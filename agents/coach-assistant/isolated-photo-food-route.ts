import {sql} from 'drizzle-orm';
import type {db as databaseType} from '@/db/client';
import {photoFoodOperationSchema} from './photo-food-actions';
import {createOfflinePhotoFoodObservationPort} from './photo-food-observation';
import {createIsolatedPhotoFoodBoundary} from './photo-food-isolation';
import {createPhotoFoodService} from './photo-food-service';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Exact disposable CI binding. It consumes an offline fixture and cannot call a
 * provider. The binding is absent from the normal production route object. */
export async function createIsolatedPhotoFoodRouteService(env:Record<string,string|undefined>,database:typeof databaseType,raw:unknown){
 const operation=photoFoodOperationSchema.parse(raw),actorId=env.COACH_SQL_ACTOR??'',organizationId=env.COACH_SQL_ORG??'',observationId=env.COACH_PHOTO_FOOD_OBSERVATION_ID??'',revision=env.COACH_PHOTO_FOOD_OBSERVATION_REVISION??'';
 if(![actorId,organizationId,observationId,revision].every(value=>uuid.test(value)))throw new Error('isolated_photo_food_disabled');
 let attachmentId:string|undefined='attachmentId'in operation?operation.attachmentId:undefined;
 if(!attachmentId&&operation.operation==='photo.food.apply'){
  const found=await database.execute<{attachment_id:string}>(sql`SELECT envelope#>>'{evidence,attachmentId}' AS attachment_id FROM private.coach_action_proposals WHERE id=${operation.proposalId}::uuid AND actor_id=${actorId}::uuid AND conversation_id=${operation.conversationId}::uuid AND action='food.photo.create'`);attachmentId=found.rows[0]?.attachment_id;
 }
 if(!attachmentId&&operation.operation==='photo.food.receipt'){
  const found=await database.execute<{attachment_id:string}>(sql`SELECT p.envelope#>>'{evidence,attachmentId}' AS attachment_id FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id WHERE r.actor_id=${actorId}::uuid AND r.action_id=${operation.actionId}::uuid AND r.conversation_id=${operation.conversationId}::uuid AND p.action='food.photo.create'`);attachmentId=found.rows[0]?.attachment_id;
 }
 if(!attachmentId||!uuid.test(attachmentId))throw new Error('isolated_photo_food_disabled');
 const scope={actorId,subjectId:actorId,organizationId,conversationId:operation.conversationId,attachmentId};
 const port=createOfflinePhotoFoodObservationPort([{...scope,id:observationId,revision,imageDigest:'a'.repeat(64),foods:[{name:'Fixture rice',estimated_grams:100,estimated_calories:130,estimated_protein_g:2.7,estimated_carbs_g:28,estimated_fat_g:.3,estimated_fiber_g:.4,estimated_sugar_g:0,confidence:.7,source:'ai_estimate',accuracy_note:'Offline estimate; confirm portion.'}]}]);
 return createPhotoFoodService(database,port,createIsolatedPhotoFoodBoundary(env,database,port,[scope]));
}
