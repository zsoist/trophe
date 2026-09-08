import { createHash } from 'node:crypto';
import type { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
import type { ProviderResult } from '@/agents/runtime/types';
import { COACH_PRICING_VERSION } from './economics';
import {
  COACH_ATTEMPT_RESERVATION_NANO_USD,
  USD_IN_NANODOLLARS,
  executePilotBudgetCommand,
  pricePilotUsageNanoUsd,
  reserveCoachPilotAttempt,
  type PilotAttemptBinding,
  type PilotBudgetStore,
  type PilotUsage,
} from './pilot-budget';

export type GovernedCoachTransport = (input: Parameters<typeof invokeStructuredProvider>[0]) => Promise<ProviderResult<unknown>>;
export type GovernedAttemptState = 'reserved' | 'dispatched' | 'settled' | 'unknown' | 'blocked' | 'recovered';
export interface GovernedAttemptTrace {
  attemptId:string;agentRunId:string;requestId:string|null;requestedModel:'gpt-5.6-luna';returnedModel:string|null;
  reservationNanoUsd:number;usage:PilotUsage|null;pricedUsageNanoUsd:number|null;latencyMs:number|null;
  state:GovernedAttemptState;providerCalled:boolean;error:string|null;
}
const issuedTransports=new WeakSet<GovernedCoachTransport>();

const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function stableId(parts:string[]):string {
  const bytes=Buffer.from(digest(parts).slice(0,32),'hex');bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function usageOf(value:ProviderResult<unknown>['usage']):PilotUsage {return {inputTokens:value.inputTokens,outputTokens:value.outputTokens,cacheReadTokens:value.cacheReadTokens??0,cacheWriteTokens:value.cacheWriteTokens??0,reasoningTokens:value.reasoningTokens??0};}

/** Shared server-only dispatch adapter for the existing Coach runtime.
 * `pilotId` and `actorId` must come from the authenticated composition root,
 * never request JSON. One HTTP attempt is allowed per reserved invocation.
 */
export function createGovernedCoachTransport(input:{
  pilotId:string;actorId:string;turnId:string;identityParts:string[];mode:'injected'|'live';store:PilotBudgetStore;signal:AbortSignal;
  transport:GovernedCoachTransport;allowedPromptVersions:readonly string[];
}){
  const attempts:GovernedAttemptTrace[]=[];
  const transport:GovernedCoachTransport=async request=>{
    const invocation=attempts.length+1;
    if(invocation>2||request.policy.model!=='gpt-5.6-luna'||request.policy.provider!=='openai'||request.policy.reasoningEffort!=='low'
      ||request.maxTokens!==2000||request.maxAttempts!==1||!input.allowedPromptVersions.includes(request.policy.promptVersion))throw new Error('budget_blocked');
    const binding:PilotAttemptBinding={pilotId:input.pilotId,actorId:input.actorId,
      attemptId:stableId([...input.identityParts,`attempt-${invocation}`]),agentRunId:stableId([...input.identityParts,`agent-run-${invocation}`]),turnId:input.turnId,
      model:'gpt-5.6-luna',pricingVersion:COACH_PRICING_VERSION,requestHash:digest({policy:request.policy,system:request.system,prompt:request.prompt,schema:request.schema,maxTokens:request.maxTokens}),reservedNanoUsd:COACH_ATTEMPT_RESERVATION_NANO_USD};
    const trace:GovernedAttemptTrace={attemptId:binding.attemptId,agentRunId:binding.agentRunId,requestId:null,requestedModel:'gpt-5.6-luna',returnedModel:null,reservationNanoUsd:binding.reservedNanoUsd,usage:null,pricedUsageNanoUsd:null,latencyMs:null,state:'blocked',providerCalled:false,error:null};attempts.push(trace);
    const reserve=input.mode==='live'?await reserveCoachPilotAttempt(binding,input.store,request.signal):await executePilotBudgetCommand({operation:'reserve',binding},input.store,request.signal);
    if(!reserve.ok){trace.state=reserve.error==='uncertain'?'unknown':'blocked';trace.error=reserve.error;throw new Error('budget_blocked');}
    trace.state='reserved';
    const claim=await executePilotBudgetCommand({operation:'claim_dispatch',binding},input.store,request.signal);
    if(!claim.ok||!claim.dispatchGranted){trace.state=claim.ok?'recovered':claim.error==='uncertain'?'unknown':'blocked';trace.error=claim.ok?'dispatch_not_granted':claim.error;throw new Error('budget_blocked');}
    trace.state='dispatched';trace.providerCalled=true;const started=performance.now();
    try {
      const generated=await input.transport(request);trace.latencyMs=Math.round(performance.now()-started);trace.requestId=generated.requestId??null;
      trace.returnedModel=typeof generated.responseModel==='string'&&generated.responseModel.trim()?generated.responseModel:null;trace.usage=usageOf(generated.usage);
      if(trace.returnedModel!=='gpt-5.6-luna'){
        trace.state='unknown';trace.error='model_pricing_unverified';
        await executePilotBudgetCommand({operation:'mark_pricing_unknown',binding,usage:trace.usage,responseModel:trace.returnedModel},input.store,request.signal);
        throw new Error('model_pricing_unverified');
      }
      trace.pricedUsageNanoUsd=pricePilotUsageNanoUsd(trace.usage);
      const settled=await executePilotBudgetCommand({operation:'settle',binding,usage:trace.usage},input.store,request.signal);
      if(!settled.ok||settled.record.state!=='settled'){trace.state='unknown';trace.error='accounting_uncertain';throw new Error('accounting_uncertain');}
      trace.state='settled';return generated;
    } catch {
      trace.latencyMs??=Math.round(performance.now()-started);
      if(trace.state!=='settled'){trace.state='unknown';trace.error??='provider_outcome_unknown';await executePilotBudgetCommand({operation:'mark_unknown',binding},input.store,request.signal);}
      throw new Error('provider_unavailable');
    }
  };
  issuedTransports.add(transport);
  return {transport,attempts,reservedMaximumUsd:2*COACH_ATTEMPT_RESERVATION_NANO_USD/USD_IN_NANODOLLARS};
}

export function isGovernedCoachTransport(value:unknown):value is GovernedCoachTransport {
  return typeof value==='function'&&issuedTransports.has(value as GovernedCoachTransport);
}
