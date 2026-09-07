import { createHash } from 'node:crypto';
import { COACH_PILOT_BUDGET_USD } from './economics';
import { audioBindingSchema, executeAudioBudgetCommand, priceAudioUsageNanoUsd, type AudioBinding, type AudioBudgetPort, type AudioUsage } from './audio-budget';
export const audioDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Cap0 blocks before any durable write or provider access. Injected is explicit test mode. */
export async function governAudio<T>(input:{mode:'injected'|'live';binding:AudioBinding;budget?:AudioBudgetPort;signal:AbortSignal;allowHeldOutput?:boolean;invoke:()=>Promise<{output:T;usage:AudioUsage|null}>}):Promise<{output:T;accounting:'settled'|'held_unknown'}>{
 if(input.mode==='live'&&COACH_PILOT_BUDGET_USD<=0)throw new Error('budget_blocked');
 if(!input.budget||!audioBindingSchema.safeParse(input.binding).success)throw new Error('budget_blocked');
 const {binding,budget,signal}=input;signal.throwIfAborted();
 const reserved=await executeAudioBudgetCommand({operation:'reserve',binding},budget,signal);
 if(!reserved.ok||reserved.record.state!=='reserved')throw new Error('budget_blocked');
 const claim=await executeAudioBudgetCommand({operation:'claim_dispatch',binding},budget,signal);
 if(!claim.ok||!claim.dispatchGranted)throw new Error('budget_blocked');
 try{
  signal.throwIfAborted();const result=await input.invoke();signal.throwIfAborted();
  if(!result.usage||priceAudioUsageNanoUsd(binding,result.usage)===null){
   const held=await executeAudioBudgetCommand({operation:'mark_unknown',binding},budget,signal);
   if(input.allowHeldOutput&&held.ok&&held.record.state==='unknown'&&held.record.accountingAlert&&!signal.aborted)return {output:result.output,accounting:'held_unknown'};
   throw new Error('accounting_uncertain');
  }
  const settled=await executeAudioBudgetCommand({operation:'settle',binding,usage:result.usage},budget,signal);
  if(!settled.ok||settled.record.state!=='settled'||settled.record.accountingAlert)throw new Error('accounting_uncertain');
  return {output:result.output,accounting:'settled'};
 }catch(error){
  // An aborted/failed reconciliation cannot release a dispatched reservation.
  await executeAudioBudgetCommand({operation:'mark_unknown',binding},budget,signal);
  throw error;
 }
}
