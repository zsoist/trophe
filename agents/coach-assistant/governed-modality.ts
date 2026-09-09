import {createHash} from 'node:crypto';
import type {AiUsage} from '@/agents/runtime';
import {executePilotBudgetCommand,PHOTO_ATTEMPT_RESERVATION_NANO_USD,pricePilotUsageNanoUsd,reserveCoachPilotAttempt,STT_ATTEMPT_RESERVATION_NANO_USD,type PilotAttemptBinding,type PilotBudgetStore,type PilotUsage,type ProviderFailureDiagnostic} from './pilot-budget';

type ModalityTask='photo_analyze'|'transcribe';
type TaskContract={provider:'anthropic'|'openai';model:PilotAttemptBinding['model'];promptVersion:string;pricingVersion:PilotAttemptBinding['pricingVersion'];reservationNanoUsd:number};
const contracts:Record<ModalityTask,TaskContract>={
 photo_analyze:{provider:'anthropic',model:'claude-haiku-4-5-20251001',promptVersion:'photo-analyze-v1',pricingVersion:'claude-haiku-4-5-20251001-standard-2026-09-09',reservationNanoUsd:PHOTO_ATTEMPT_RESERVATION_NANO_USD},
 transcribe:{provider:'openai',model:'gpt-4o-mini-transcribe',promptVersion:'transcribe-v1',pricingVersion:'gpt-4o-mini-transcribe-2026-09-09',reservationNanoUsd:STT_ATTEMPT_RESERVATION_NANO_USD},
};
type GovernedResult={selectedPolicy:{provider:string;model:string;promptVersion:string};isFallback:boolean;usage:AiUsage;rawStatus:number;latencyMs:number;requestId?:string;providerGenerationId?:string;output:unknown};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function stableId(parts:string[]):string {const bytes=Buffer.from(digest(parts).slice(0,32),'hex');bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
const usageOf=(usage:AiUsage):PilotUsage=>({inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,cacheReadTokens:usage.cacheReadTokens??0,cacheWriteTokens:usage.cacheWriteTokens??0,reasoningTokens:usage.reasoningTokens??0});
function failureOf(error:unknown):ProviderFailureDiagnostic {const timeout=Boolean(error&&typeof error==='object'&&'_isTimeout'in error&&(error as {_isTimeout?:unknown})._isTimeout);return {category:timeout?'timeout':'unknown',rawStatus:0,hasUsage:false};}
async function persistAfterDispatch(command:Parameters<typeof executePilotBudgetCommand>[0],store:PilotBudgetStore){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('accounting_deadline')),5000);try{return await executePilotBudgetCommand(command,store,controller.signal);}finally{clearTimeout(timer);}}

/** One shared-ledger admission around one existing modality runtime. The caller
 * supplies a server-derived identity and the existing task invocation. */
export async function runGovernedPilotModality<Result extends GovernedResult>(input:{pilotId:string;actorId:string;turnId:string;identityParts:string[];task:ModalityTask;store:PilotBudgetStore;signal:AbortSignal;run:()=>Promise<Result>}):Promise<Result>{
 const contract=contracts[input.task];
 const common={pilotId:input.pilotId,actorId:input.actorId,turnId:input.turnId,attemptId:stableId([...input.identityParts,input.task,'attempt']),agentRunId:stableId([...input.identityParts,input.task,'budget-run']),requestHash:digest({task:input.task,identityParts:input.identityParts})};
 const binding:PilotAttemptBinding=contract.model==='gpt-4o-mini-transcribe'
  ?{...common,model:contract.model,pricingVersion:'gpt-4o-mini-transcribe-2026-09-09',reservedNanoUsd:STT_ATTEMPT_RESERVATION_NANO_USD}
  :{...common,model:'claude-haiku-4-5-20251001',pricingVersion:'claude-haiku-4-5-20251001-standard-2026-09-09',reservedNanoUsd:PHOTO_ATTEMPT_RESERVATION_NANO_USD};
 const reserve=await reserveCoachPilotAttempt(binding,input.store,input.signal);if(!reserve.ok)throw new Error('budget_blocked');
 const claim=await executePilotBudgetCommand({operation:'claim_dispatch',binding},input.store,input.signal);if(!claim.ok||!claim.dispatchGranted)throw new Error('budget_blocked');
 try{
  const result=await input.run(),usage=usageOf(result.usage);
  if(result.selectedPolicy.provider!==contract.provider||result.selectedPolicy.model!==contract.model||result.selectedPolicy.promptVersion!==contract.promptVersion||result.isFallback||result.rawStatus<200||result.rawStatus>=300||pricePilotUsageNanoUsd(usage,binding.model)===null)throw new Error('invalid_modality_result');
  const settled=await persistAfterDispatch({operation:'settle',binding,usage,providerSuccess:{responseModel:binding.model,requestId:result.requestId??null}},input.store);
  if(!settled.ok||settled.record.state!=='settled')throw new Error('accounting_uncertain');
  return result;
 }catch(error){await persistAfterDispatch({operation:'mark_unknown',binding,failure:failureOf(error)},input.store);throw new Error('provider_unavailable');}
}
