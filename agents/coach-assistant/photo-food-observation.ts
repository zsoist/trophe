import { z } from 'zod';
import type {db} from '@/db/client';
import { normalizePhotoAnalysisFoods,photoAnalysisToParsedItems,type PhotoAnalysisFood } from '@/lib/food/photo-analysis';
import type { ParsedFoodItem } from '@/agents/schemas/food-parse';
const uuid=z.string().uuid();
const reservedControlFields=new Set(['action','actorId','attachmentId','command','conversationId','developer','instruction','instructions','operation','organizationId','prompt','subjectId','system','tool','toolCall','tool_call']);
export const photoFoodScopeSchema=z.object({actorId:uuid,subjectId:uuid,organizationId:uuid,conversationId:uuid,attachmentId:uuid}).strict();
export type PhotoFoodScope=z.infer<typeof photoFoodScopeSchema>;
const observationSchema=photoFoodScopeSchema.extend({id:uuid,revision:uuid,imageDigest:z.string().regex(/^[a-f0-9]{64}$/),source:z.enum(['validated_photo_analysis','offline_fixture']),foods:z.array(z.unknown()).min(1).max(8)}).strict();
export interface PhotoFoodObservation extends PhotoFoodScope {id:string;revision:string;imageDigest:string;source:'validated_photo_analysis'|'offline_fixture';trust:'untrusted_image_data';foods:PhotoAnalysisFood[];items:ParsedFoodItem[]}
export function assertNoPhotoControlFields(raw:unknown):void{
 if(!Array.isArray(raw))throw new Error('invalid_observation');
 for(const candidate of raw)if(candidate&&typeof candidate==='object'&&Object.keys(candidate).some(key=>reservedControlFields.has(key)))throw new Error('untrusted_instruction');
}
/** Server-only loader of an already validated observation, never a vision call.
 * Must use the caller transaction to lock the current validated observation row
 * through commit, scoped to the exact attachment. Revocation/analysis replacement
 * must invalidate its immutable revision, including authorization ABA.
 * An HTTP/model payload must not supply this port or its authorization context.
 */
export type PhotoFoodObservationTransaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface PhotoFoodObservationPort {load(scope:PhotoFoodScope,signal:AbortSignal,transaction:PhotoFoodObservationTransaction):Promise<unknown|null>}
export function validatePhotoFoodObservation(raw:unknown,expected:PhotoFoodScope):PhotoFoodObservation{
 const found=observationSchema.parse(raw);for(const k of ['actorId','subjectId','organizationId','conversationId','attachmentId'] as const)if(found[k]!==expected[k])throw new Error('forbidden');
 assertNoPhotoControlFields(found.foods);
 const foods=normalizePhotoAnalysisFoods(found.foods),items=photoAnalysisToParsedItems(found.foods);
 // Do not silently remap a user's selected index by dropping invalid candidates.
 if(foods.length!==found.foods.length||items.length!==foods.length)throw new Error('invalid_observation');
 // The native route can append dish-prior guesses; those need separate evidence.
 if(foods.some(item=>item.needs_confirmation===true))throw new Error('unconfirmed_observation');
 return {...found,trust:'untrusted_image_data',foods,items};
}
/** Offline data stays visibly labelled and cannot authorize database creation. */
export function createOfflinePhotoFoodObservationPort(fixtures:unknown[]):PhotoFoodObservationPort{
 if(fixtures.length>8)throw new Error('fixture_limit');const snapshots=fixtures.map(raw=>observationSchema.parse({...structuredClone(raw) as object,source:'offline_fixture'}));
 return {async load(scope,signal){signal.throwIfAborted();const found=snapshots.find(row=>Object.entries(scope).every(([key,value])=>row[key as keyof PhotoFoodScope]===value));return found?structuredClone(found):null;}};
}
