import type { CoachRepository } from './repository';
import type { CoachConversationRequest } from './contracts';
import { executeFoodPreferenceAction,type FoodPreferenceService } from './food-preference-actions';
/** Compose outside existing Workout/memory brokers. Fresh profile data each turn;
 * no cached assistant interpretation is authoritative for a current diet preference. */
export function createFoodPreferenceTurn(repository:CoachRepository,service:FoodPreferenceService,request:CoachConversationRequest){
 return {repository:{...repository,personalContext:async args=>{
  const previous=repository.personalContext?await repository.personalContext(args):{rows:[{userId:args.context.subjectId,preferences:null,memories:[]}],truncated:false};
  if(previous.truncated||previous.rows.length!==1||previous.rows[0].userId!==args.context.subjectId)throw new Error('forbidden');
  const result=await executeFoodPreferenceAction(args.context.actorId,{version:'coach-assistant.v2',operation:'diet.read',profileId:args.context.subjectId,conversationId:request.conversationId,turnId:request.turnId},repository,service,args.signal);
  if(!result.ok){if(result.error==='not_connected')return {rows:previous.rows.map(row=>({...row,foodPreference:undefined})),truncated:false};throw new Error(result.error);}
  if(!('snapshot' in result))throw new Error('query_failed');
  return {rows:[{...previous.rows[0],foodPreference:result.snapshot}],truncated:false};
 }} as CoachRepository,
 filterHistory(input:CoachConversationRequest):CoachConversationRequest{
  return {...input,history:input.history?.filter(item=>item.role==='user'&&item.kind!=='memory_summary')};
 }};
}
