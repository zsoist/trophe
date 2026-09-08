import type { PhotoFoodResult } from './photo-food-contracts';
import { array, datetime, enumeration, hash, literal, object, pattern, stringLength, uuid, type JsonCheck } from './result-reader-checks';

const finite=(min:number,max:number):JsonCheck=>value=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const integer=(min:number,max:number):JsonCheck=>value=>Number.isInteger(value)&&(value as number)>=min&&(value as number)<=max;
const date:JsonCheck=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const meal=enumeration(['breakfast','lunch','dinner','snack','pre_workout','post_workout']);
const source=enumeration(['validated_photo_analysis','offline_fixture']);
const evaluation=object({mode:literal('isolated_authorized_fixture'),observation:literal('offline_fixture'),visionVerified:literal(false),paidApiCalls:literal(0)});
const review=object({loggedDate:date,mealType:meal,grams:value=>finite(.1,10000)(value)&&Math.abs(Math.round((value as number)*100)-(value as number)*100)<1e-7,foodName:stringLength(1,200),calories:finite(0,10000),proteinG:finite(0,1000),carbsG:finite(0,1000),fatG:finite(0,1000),fiberG:finite(0,1000),sugarG:finite(0,1000),confidence:finite(0,.75),source:literal('photo_ai'),nutrition:literal('estimated'),portion:literal('explicit_user')});
const evidence=object({observationId:uuid,observationRevision:uuid,attachmentId:uuid,imageDigest:hash,itemIndex:integer(0,7),source,trust:literal('untrusted_image_data')});
const proposal=object({id:uuid,hash,action:literal('food.photo.create'),resource:object({kind:literal('food_entry'),id:uuid,version:hash}),before:literal(null),after:review,evidence,precondition:hash,expiresAt:datetime,reviewRequired:literal(true)});
const item=object({index:integer(0,7),version:hash,foodName:stringLength(1,200),estimatedGrams:finite(Number.MIN_VALUE,Number.MAX_VALUE),estimatedCalories:finite(0,Number.MAX_VALUE),confidence:finite(0,.75),accuracyNote:stringLength(0,500)});
const items:JsonCheck=value=>Array.isArray(value)&&value.length>=1&&array(item,8)(value);
const snapshot=object({observationId:uuid,attachmentId:uuid,source,trust:literal('untrusted_image_data'),reviewRequired:literal(true),items});
const receipt=object({id:uuid,actionId:uuid,proposalId:uuid,status:literal('applied'),action:literal('food.photo.create'),resourceVersion:pattern(/^[0-9]{1,20}$/),recordedAt:datetime});
const refresh=object({entryId:uuid,loggedDate:date,previousVersion:hash,version:pattern(/^[0-9]{1,20}$/),strategy:literal('refetch')});
const error=enumeration(['invalid_input','forbidden','not_found','not_connected','version_conflict','expired','idempotency_conflict','uncertain','cancelled']);
const version={version:literal('coach-assistant.v2')};
const variants:JsonCheck[]=[
 object({...version,storage:literal('database'),ok:literal(false),error}),
 object({...version,storage:enumeration(['database','offline_fixture']),ok:literal(true),snapshot}),
 object({...version,storage:enumeration(['database','offline_fixture']),ok:literal(true),proposal}),
 object({...version,storage:literal('isolated_database_fixture'),ok:literal(true),snapshot,evaluation}),
 object({...version,storage:literal('isolated_database_fixture'),ok:literal(true),proposal,evaluation}),
 object({...version,storage:literal('database'),ok:literal(true),receipt,refresh}),
 object({...version,storage:literal('isolated_database_fixture'),ok:literal(true),receipt,refresh,evaluation}),
];

/** Strict browser JSON validation without importing server schemas or their runtime. */
export function readPhotoFoodResult(value:unknown):PhotoFoodResult|null{return variants.some(check=>check(value))?value as PhotoFoodResult:null;}
