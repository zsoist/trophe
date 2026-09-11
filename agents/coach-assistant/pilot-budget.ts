import { z } from 'zod';
import { COACH_PILOT_BUDGET_USD, COACH_PRICING, COACH_PRICING_VERSION } from './economics';
import {HAIKU_MODEL,LUNA_MODEL,TRANSCRIPTION_MODEL} from '@/agents/router/policies';
import {PHOTO_PILOT_PRICING_VERSION} from '@/agents/router/pricing';

export const USD_IN_NANODOLLARS=1_000_000_000;
/** Worst supported input tier is cache write; output already includes reasoning. */
export const COACH_ATTEMPT_RESERVATION_NANO_USD=8000*Math.round(Math.max(COACH_PRICING.input,COACH_PRICING.read,COACH_PRICING.write)*1000)+2000*Math.round(COACH_PRICING.output*1000);
export const STT_ATTEMPT_RESERVATION_NANO_USD=30_000_000;
export const PHOTO_ATTEMPT_RESERVATION_NANO_USD=80_000_000;
const nano=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bindingBase={
  pilotId:z.string().uuid(),actorId:z.string().uuid(),attemptId:z.string().uuid(),agentRunId:z.string().uuid(),turnId:z.string().uuid(),
  requestHash:z.string().regex(/^[a-f0-9]{64}$/),
};
export const pilotAttemptBindingSchema=z.discriminatedUnion('model',[
  z.object({...bindingBase,model:z.literal(LUNA_MODEL),pricingVersion:z.literal(COACH_PRICING_VERSION),reservedNanoUsd:z.literal(COACH_ATTEMPT_RESERVATION_NANO_USD)}).strict(),
  z.object({...bindingBase,model:z.literal(TRANSCRIPTION_MODEL),pricingVersion:z.literal('gpt-4o-mini-transcribe-2026-09-09'),reservedNanoUsd:z.literal(STT_ATTEMPT_RESERVATION_NANO_USD)}).strict(),
  z.object({...bindingBase,model:z.literal(HAIKU_MODEL),pricingVersion:z.literal(PHOTO_PILOT_PRICING_VERSION),reservedNanoUsd:z.literal(PHOTO_ATTEMPT_RESERVATION_NANO_USD)}).strict(),
]);
export type PilotAttemptBinding=z.infer<typeof pilotAttemptBindingSchema>;
const usageSchema=z.object({inputTokens:nano,outputTokens:nano,cacheReadTokens:nano,cacheWriteTokens:nano,reasoningTokens:nano}).strict();
export type PilotUsage=z.infer<typeof usageSchema>;
const providerDiagnostic=z.enum(['invalid_request_error','authentication_error','permission_error','not_found_error','request_too_large','rate_limit_error','api_error','overloaded_error','forbidden','rate_limited','invalid_response','response_validation_error','http_error','insufficient_permissions','invalid_api_key','rate_limit_exceeded','server_error','model_not_found','insufficient_quota','billing_not_active','ETIMEDOUT','ECONNRESET','ENOTFOUND','UND_ERR_CONNECT_TIMEOUT','TimeoutError','TypeError']);
const providerErrorSchema=z.object({
  code:providerDiagnostic.optional(),type:providerDiagnostic.optional(),
  requestId:z.string().regex(/^req_[A-Za-z0-9_-]{1,116}$/).optional(),
  param:z.enum(['model','messages','input','instructions','max_completion_tokens','max_output_tokens','reasoning_effort','reasoning','reasoning.effort','prompt_cache_key','prompt_cache_options','tools','tool_choice','store','tools[0].function.parameters','tools[0].function.parameters.required']).optional(),
}).strict().refine(value=>value.code!==undefined||value.type!==undefined||value.requestId!==undefined||value.param!==undefined);
export const providerFailureDiagnosticSchema=z.object({
  category:z.enum(['auth','access','billing','rate_limit','network','timeout','provider','schema','unknown']),
  phase:z.enum(['pre_provider','provider_pending','post_provider']).optional(),
  rawStatus:z.number().int().min(0).max(599),providerError:providerErrorSchema.optional(),hasUsage:z.boolean(),
}).strict().refine(value=>value.phase===undefined||value.category==='timeout');
export type ProviderFailureDiagnostic=z.infer<typeof providerFailureDiagnosticSchema>;
const providerSuccessSchema=z.object({
  responseModel:z.enum([LUNA_MODEL,TRANSCRIPTION_MODEL,HAIKU_MODEL]),
  requestId:z.string().regex(/^req_[A-Za-z0-9_-]{1,116}$/).nullable(),
}).strict();
export type ProviderSuccessDiagnostic=z.infer<typeof providerSuccessSchema>;
export const pilotBudgetCommandSchema=z.discriminatedUnion('operation',[
  z.object({operation:z.enum(['reserve','lookup','claim_dispatch','release_unstarted']),binding:pilotAttemptBindingSchema}).strict(),
  z.object({operation:z.literal('mark_unknown'),binding:pilotAttemptBindingSchema,failure:providerFailureDiagnosticSchema.optional()}).strict(),
  z.object({operation:z.literal('mark_pricing_unknown'),binding:pilotAttemptBindingSchema,usage:usageSchema,responseModel:z.string().min(1).nullable()}).strict(),
  z.object({operation:z.literal('settle'),binding:pilotAttemptBindingSchema,usage:usageSchema,providerSuccess:providerSuccessSchema.optional()}).strict(),
]);
export type PilotBudgetCommand=z.infer<typeof pilotBudgetCommandSchema>;
export const pilotAttemptRecordSchema=z.object({
  binding:pilotAttemptBindingSchema,admissionDay:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),state:z.enum(['reserved','dispatched','unknown','settled','released']),chargedNanoUsd:nano,usage:usageSchema.nullable(),accountingAlert:z.boolean(),unpricedModel:z.string().min(1).nullable().optional(),providerFailure:providerFailureDiagnosticSchema.optional(),
  providerSuccess:providerSuccessSchema.optional(),
}).strict().refine(record=>record.unpricedModel===undefined||(record.state==='unknown'&&record.accountingAlert&&record.usage!==null)).refine(record=>record.providerFailure===undefined||record.state==='unknown').refine(record=>record.providerSuccess===undefined||record.state==='settled'&&record.providerSuccess.responseModel===record.binding.model).refine(record=>record.state==='settled'?record.unpricedModel===undefined&&record.usage!==null&&pricePilotUsageNanoUsd(record.usage,record.binding.model)===record.chargedNanoUsd&&record.accountingAlert===(record.chargedNanoUsd>record.binding.reservedNanoUsd):record.state==='unknown'?record.chargedNanoUsd===record.binding.reservedNanoUsd&&(record.usage===null||record.accountingAlert&&(record.unpricedModel!==undefined||pricePilotUsageNanoUsd(record.usage,record.binding.model)===null)):record.usage===null&&!record.accountingAlert&&record.chargedNanoUsd===(record.state==='released'?0:record.binding.reservedNanoUsd));
export type PilotAttemptRecord=z.infer<typeof pilotAttemptRecordSchema>;
export type PilotBudgetError='budget_blocked'|'invalid_input'|'not_found'|'idempotency_conflict'|'invalid_transition'|'uncertain'|'cancelled';
export type PilotBudgetDecision={ok:false;error:PilotBudgetError}|{ok:true;record:PilotAttemptRecord;write:'none'|'insert'|'update';chargeDeltaNanoUsd:number;dispatchGranted:boolean};

/** Exact integer accounting. Unknown/invalid usage is not zero consumption. */
export function pricePilotUsageNanoUsd(raw:unknown,model:PilotAttemptBinding['model']=LUNA_MODEL):number|null {
  const parsed=usageSchema.safeParse(raw);
  if(!parsed.success)return null;
  const u=parsed.data;
  // This tariff is short-context only. Do not price an anomalous long input cheaply.
  if(u.inputTokens>272_000)return null;
  if(u.cacheReadTokens+u.cacheWriteTokens>u.inputTokens||u.reasoningTokens>u.outputTokens||u.inputTokens+u.outputTokens===0)return null;
  if(model===TRANSCRIPTION_MODEL&&(u.cacheReadTokens!==0||u.cacheWriteTokens!==0||u.reasoningTokens!==0))return null;
  const rates=model===LUNA_MODEL?{input:COACH_PRICING.input,read:COACH_PRICING.read,write:COACH_PRICING.write,output:COACH_PRICING.output}
    :model===TRANSCRIPTION_MODEL?{input:1.25,read:1.25,write:1.25,output:5}
    :{input:1,read:.1,write:1.25,output:5};
  const amount=(u.inputTokens-u.cacheReadTokens-u.cacheWriteTokens)*Math.round(rates.input*1000)+u.cacheReadTokens*Math.round(rates.read*1000)+u.cacheWriteTokens*Math.round(rates.write*1000)+u.outputTokens*Math.round(rates.output*1000);
  return Number.isSafeInteger(amount)?amount:null;
}
const failure=(error:PilotBudgetError):PilotBudgetDecision=>({ok:false,error});
export function samePilotBinding(a:PilotAttemptBinding,b:PilotAttemptBinding):boolean {
  return ['pilotId','actorId','attemptId','agentRunId','turnId','model','pricingVersion','requestHash','reservedNanoUsd'].every(key=>a[key as keyof PilotAttemptBinding]===b[key as keyof PilotAttemptBinding]);
}

/** Pure decision core for a persistent transaction owned by AG1.
 * The writer MUST authorize the configured pilot/actor and lock its cap/aggregate
 * before reading this snapshot; persist record and delta before returning success.
 * This function does not provide database atomicity or an in-memory ledger.
 */
export function pilotRecordActiveCharge(record:PilotAttemptRecord,budgetDay:string):number {
  if(record.state==='released')return 0;
  if(record.state==='settled'&&record.admissionDay!==budgetDay)return 0;
  return record.chargedNanoUsd;
}

export function decidePilotBudgetCommand(snapshot:{pilotId:string;budgetDay:string;capNanoUsd:number;chargedNanoUsd:number;turnAttemptCount:number;accountingBlocked:boolean;existing?:PilotAttemptRecord},raw:unknown):PilotBudgetDecision {
  const parsed=pilotBudgetCommandSchema.safeParse(raw);
  if(!parsed.success)return failure('invalid_input');
  const command=parsed.data;
  if(typeof snapshot.accountingBlocked!=='boolean'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(snapshot.budgetDay)||snapshot.pilotId!==command.binding.pilotId||![snapshot.capNanoUsd,snapshot.chargedNanoUsd,snapshot.turnAttemptCount].every(n=>Number.isSafeInteger(n)&&n>=0))return failure('invalid_input');
  let previous:PilotAttemptRecord|undefined;
  if(snapshot.existing) {
    const validated=pilotAttemptRecordSchema.safeParse(snapshot.existing);
    if(!validated.success)return failure('uncertain');
    previous=validated.data;
    if(!samePilotBinding(previous.binding,command.binding))return failure('idempotency_conflict');
  }
  const unchanged=():PilotBudgetDecision=>({ok:true,record:structuredClone(previous!),write:'none',chargeDeltaNanoUsd:0,dispatchGranted:false});
  if(command.operation==='reserve') {
    if(previous)return unchanged();
    const total=snapshot.chargedNanoUsd+command.binding.reservedNanoUsd;
    if(snapshot.accountingBlocked||snapshot.turnAttemptCount>=2||!Number.isSafeInteger(total)||total>snapshot.capNanoUsd)return failure('budget_blocked');
    return {ok:true,record:{binding:structuredClone(command.binding),admissionDay:snapshot.budgetDay,state:'reserved',chargedNanoUsd:command.binding.reservedNanoUsd,usage:null,accountingAlert:false},write:'insert',chargeDeltaNanoUsd:command.binding.reservedNanoUsd,dispatchGranted:false};
  }
  if(!previous)return failure('not_found');
  if(command.operation==='lookup')return unchanged();
  const update=(state:PilotAttemptRecord['state'],chargedNanoUsd:number,usage:PilotUsage|null,dispatchGranted=false,accountingAlert=false,providerFailure?:ProviderFailureDiagnostic):PilotBudgetDecision=>{
    const record:PilotAttemptRecord={binding:structuredClone(previous!.binding),admissionDay:previous!.admissionDay,state,chargedNanoUsd,usage:structuredClone(usage),accountingAlert};
    const retainedFailure=providerFailure??(state==='unknown'?previous!.providerFailure:undefined);
    if(retainedFailure)record.providerFailure=structuredClone(retainedFailure);
    return {ok:true,record,write:'update',chargeDeltaNanoUsd:pilotRecordActiveCharge(record,snapshot.budgetDay)-pilotRecordActiveCharge(previous!,snapshot.budgetDay),dispatchGranted};
  };
  if(command.operation==='claim_dispatch') {
    // A replay never grants a second transport permission, even after restart.
    if(previous.state==='reserved'&&(snapshot.accountingBlocked||snapshot.capNanoUsd===0||snapshot.chargedNanoUsd>snapshot.capNanoUsd))return failure('budget_blocked');
    return previous.state==='reserved'?update('dispatched',previous.chargedNanoUsd,null,true):unchanged();
  }
  if(command.operation==='release_unstarted') {
    if(previous.state==='released')return unchanged();
    if(previous.state!=='reserved')return failure('invalid_transition');
    return update('released',0,null);
  }
  if(command.operation==='mark_unknown') {
    if(previous.state==='unknown'||previous.state==='settled'||previous.state==='released')return unchanged();
    if(previous.state!=='dispatched')return failure('invalid_transition');
    return update('unknown',previous.chargedNanoUsd,null,false,false,command.failure);
  }
  if(command.operation==='mark_pricing_unknown') {
    if(previous.state!=='dispatched'&&previous.state!=='unknown')return failure('invalid_transition');
    if(previous.unpricedModel!==undefined)return previous.unpricedModel===command.responseModel&&JSON.stringify(previous.usage)===JSON.stringify(command.usage)?unchanged():failure('idempotency_conflict');
    const decision=update('unknown',previous.binding.reservedNanoUsd,command.usage,false,true);
    if(decision.ok)decision.record.unpricedModel=command.responseModel;
    return decision;
  }
  if(command.operation==='settle') {
    if(previous.unpricedModel!==undefined)return failure('invalid_transition');
    if(previous.state==='settled') {
      if(JSON.stringify(previous.usage)!==JSON.stringify(command.usage))return failure('idempotency_conflict');
      // Success provenance is part of the idempotency identity. Historical rows
      // that predate this field may replay only the historical, omitted shape;
      // never backfill or infer a model/request ID after the fact.
      if(command.providerSuccess===undefined)return previous.providerSuccess===undefined?unchanged():failure('idempotency_conflict');
      if(previous.providerSuccess===undefined||JSON.stringify(previous.providerSuccess)!==JSON.stringify(command.providerSuccess))return failure('idempotency_conflict');
      return unchanged();
    }
    if(previous.state!=='dispatched'&&previous.state!=='unknown')return failure('invalid_transition');
    const amount=pricePilotUsageNanoUsd(command.usage,command.binding.model);
    if(amount===null)return update('unknown',previous.chargedNanoUsd,command.usage,false,true);
    // Bill measured usage even if it exceeded the reservation: never hide an overrun.
    const settled=update('settled',amount,command.usage,false,amount>previous.binding.reservedNanoUsd);
    if(settled.ok&&command.providerSuccess)settled.record.providerSuccess=structuredClone(command.providerSuccess);
    return settled;
  }
  return failure('invalid_input');
}

export interface PilotBudgetStore {
  /** Persistent authorized transaction. No success before commit; no automatic retry. */
  execute(command:PilotBudgetCommand,signal:AbortSignal):Promise<unknown>;
}
const storeResultSchema=z.union([
  z.object({storage:z.literal('database'),ok:z.literal(false),error:z.enum(['budget_blocked','invalid_input','not_found','idempotency_conflict','invalid_transition','uncertain','cancelled'])}).strict(),
  z.object({storage:z.literal('database'),ok:z.literal(true),record:pilotAttemptRecordSchema,write:z.enum(['none','insert','update']),chargeDeltaNanoUsd:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),dispatchGranted:z.boolean()}).strict(),
]);
export type PilotBudgetResult=PilotBudgetDecision&{storage:'database'};

/** Adapter only; a missing/ambiguous database answer never permits dispatch. */
export async function executePilotBudgetCommand(raw:unknown,store:PilotBudgetStore,signal:AbortSignal):Promise<PilotBudgetResult> {
  const fail=(error:PilotBudgetError):PilotBudgetResult=>({ok:false,error,storage:'database'});
  const parsed=pilotBudgetCommandSchema.safeParse(raw);
  if(!parsed.success)return fail('invalid_input');
  if(signal.aborted)return fail('cancelled');
  try {
    const returned=await store.execute(structuredClone(parsed.data),signal);
    if(signal.aborted)return fail('uncertain');
    const validated=storeResultSchema.safeParse(returned);
    if(!validated.success)return fail('uncertain');
    const result=validated.data;
    if(!result.ok)return result;
    if(!samePilotBinding(result.record.binding,parsed.data.binding))return fail('uncertain');
    if(result.dispatchGranted&&(parsed.data.operation!=='claim_dispatch'||result.record.state!=='dispatched'||result.write!=='update'))return fail('uncertain');
    if(result.write==='none'&&result.chargeDeltaNanoUsd!==0)return fail('uncertain');
    return result;
  } catch {return fail('uncertain');}
}

/** Server-facing reservation delegates every admission to the persistent store. */
export async function reserveCoachPilotAttempt(binding:PilotAttemptBinding,store:PilotBudgetStore,signal:AbortSignal):Promise<PilotBudgetResult> {
  if(COACH_PILOT_BUDGET_USD<=0)return {ok:false,error:'budget_blocked',storage:'database'};
  return executePilotBudgetCommand({operation:'reserve',binding},store,signal);
}
