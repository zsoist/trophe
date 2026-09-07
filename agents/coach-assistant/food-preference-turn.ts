import { workoutProfileVersion } from './profile-context';
import { createHash } from 'node:crypto';
import { createDerivedHistoryBinding } from './derived-history';
import type { CoachRepository } from './repository';
import type { CoachConversationRequest } from './contracts';
import { executeFoodPreferenceAction,type FoodPreferenceService } from './food-preference-actions';
/** Compose outside existing Workout/memory brokers. Fresh profile data each turn;
 * no cached assistant interpretation is authoritative for a current diet preference. */
export function createFoodPreferenceTurn(repository:CoachRepository,service:FoodPreferenceService,request:CoachConversationRequest){
 const history=createDerivedHistoryBinding(request.conversationId);
 return {repository:{...repository,personalContext:async args=>{
  history.clear();
  const initial=await repository.authorize(args.context.actorId,args.context.subjectId,args.signal);
  if(JSON.stringify(initial)!==JSON.stringify(args.context))throw new Error('forbidden');
  const previous=repository.personalContext?await repository.personalContext(args):{rows:[{userId:args.context.subjectId,preferences:null,memories:[]}],truncated:false};
  if(previous.truncated||previous.rows.length!==1||previous.rows[0].userId!==args.context.subjectId)throw new Error('forbidden');
  const result=await executeFoodPreferenceAction(args.context.actorId,{version:'coach-assistant.v2',operation:'diet.read',profileId:args.context.subjectId,conversationId:request.conversationId,turnId:request.turnId},repository,service,args.signal);
  if(!result.ok&&result.error!=='not_connected')throw new Error(result.error);
  const fresh=await repository.authorize(args.context.actorId,args.context.subjectId,args.signal);
  if(JSON.stringify(fresh)!==JSON.stringify(initial))throw new Error('forbidden');
  const snapshot=result.ok&&'snapshot' in result?result.snapshot:undefined;
  // A memory revision is required when memory records exist; otherwise fail closed.
  const profile=previous.rows[0];
  if(profile.memories.length&&!profile.memoryContextVersion)throw new Error('query_failed');
  history.capture(initial,createHash('sha256').update(JSON.stringify({kind:'food_memory_profile.v2',workout:workoutProfileVersion(profile),memory:profile.memoryContextVersion??null,food:snapshot??'not_connected'})).digest('hex'));
  if(!result.ok)return {rows:previous.rows.map(row=>({...row,foodPreference:undefined})),truncated:false};
  if(!('snapshot' in result))throw new Error('query_failed');
  return {rows:[{...previous.rows[0],foodPreference:result.snapshot}],truncated:false};
 }} as CoachRepository,
 filterHistory:history.filterHistory,finish:history.finish,
 };
}
