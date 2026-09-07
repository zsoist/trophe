import { z } from 'zod';
import { COACH_PILOT_BUDGET_USD, COACH_PRICING, COACH_PRICING_VERSION } from './economics';

export const USD_IN_NANODOLLARS=1_000_000_000;
/** Worst supported input tier is cache write; output already includes reasoning. */
export const COACH_ATTEMPT_RESERVATION_NANO_USD=8000*Math.round(Math.max(COACH_PRICING.input,COACH_PRICING.read,COACH_PRICING.write)*1000)+2000*Math.round(COACH_PRICING.output*1000);
const nano=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const pilotAttemptBindingSchema=z.object({
  pilotId:z.string().uuid(),actorId:z.string().uuid(),attemptId:z.string().uuid(),agentRunId:z.string().uuid(),turnId:z.string().uuid(),
  model:z.literal('gpt-5.6-luna'),pricingVersion:z.literal(COACH_PRICING_VERSION),requestHash:z.string().regex(/^[a-f0-9]{64}$/),
  reservedNanoUsd:z.literal(COACH_ATTEMPT_RESERVATION_NANO_USD),
}).strict();
export type PilotAttemptBinding=z.infer<typeof pilotAttemptBindingSchema>;
const usageSchema=z.object({inputTokens:nano,outputTokens:nano,cacheReadTokens:nano,cacheWriteTokens:nano,reasoningTokens:nano}).strict();
export type PilotUsage=z.infer<typeof usageSchema>;
export const pilotBudgetCommandSchema=z.discriminatedUnion('operation',[
  z.object({operation:z.enum(['reserve','lookup','claim_dispatch','mark_unknown','release_unstarted']),binding:pilotAttemptBindingSchema}).strict(),
  z.object({operation:z.literal('settle'),binding:pilotAttemptBindingSchema,usage:usageSchema}).strict(),
]);
export type PilotBudgetCommand=z.infer<typeof pilotBudgetCommandSchema>;
export const pilotAttemptRecordSchema=z.object({
  binding:pilotAttemptBindingSchema,state:z.enum(['reserved','dispatched','unknown','settled','released']),chargedNanoUsd:nano,usage:usageSchema.nullable(),accountingAlert:z.boolean(),
}).strict().refine(record=>record.state==='settled'?record.usage!==null&&pricePilotUsageNanoUsd(record.usage)===record.chargedNanoUsd&&record.accountingAlert===(record.chargedNanoUsd>record.binding.reservedNanoUsd):record.state==='unknown'?record.chargedNanoUsd===record.binding.reservedNanoUsd&&(record.usage===null||record.accountingAlert&&pricePilotUsageNanoUsd(record.usage)===null):record.usage===null&&!record.accountingAlert&&record.chargedNanoUsd===(record.state==='released'?0:record.binding.reservedNanoUsd));
export type PilotAttemptRecord=z.infer<typeof pilotAttemptRecordSchema>;
export type PilotBudgetError='budget_blocked'|'invalid_input'|'not_found'|'idempotency_conflict'|'invalid_transition'|'uncertain'|'cancelled';
export type PilotBudgetDecision={ok:false;error:PilotBudgetError}|{ok:true;record:PilotAttemptRecord;write:'none'|'insert'|'update';chargeDeltaNanoUsd:number;dispatchGranted:boolean};

/** Exact integer accounting. Unknown/invalid usage is not zero consumption. */
export function pricePilotUsageNanoUsd(raw:unknown):number|null {
  const parsed=usageSchema.safeParse(raw);
  if(!parsed.success)return null;
  const u=parsed.data;
  // This tariff is short-context only. Do not price an anomalous long input cheaply.
  if(u.inputTokens>272_000)return null;
  if(u.cacheReadTokens+u.cacheWriteTokens>u.inputTokens||u.reasoningTokens>u.outputTokens||u.inputTokens+u.outputTokens===0)return null;
  const amount=(u.inputTokens-u.cacheReadTokens-u.cacheWriteTokens)*Math.round(COACH_PRICING.input*1000)+u.cacheReadTokens*Math.round(COACH_PRICING.read*1000)+u.cacheWriteTokens*Math.round(COACH_PRICING.write*1000)+u.outputTokens*Math.round(COACH_PRICING.output*1000);
  return Number.isSafeInteger(amount)?amount:null;
}
const failure=(error:PilotBudgetError):PilotBudgetDecision=>({ok:false,error});
export function samePilotBinding(a:PilotAttemptBinding,b:PilotAttemptBinding):boolean {
  return (Object.keys(pilotAttemptBindingSchema.shape) as Array<keyof PilotAttemptBinding>).every(key=>a[key]===b[key]);
}

/** Pure decision core for a persistent transaction owned by AG1.
 * The writer MUST authorize the configured pilot/actor and lock its cap/aggregate
 * before reading this snapshot; persist record and delta before returning success.
 * This function does not provide database atomicity or an in-memory ledger.
 */
export function decidePilotBudgetCommand(snapshot:{pilotId:string;capNanoUsd:number;chargedNanoUsd:number;turnAttemptCount:number;accountingBlocked:boolean;existing?:PilotAttemptRecord},raw:unknown):PilotBudgetDecision {
  const parsed=pilotBudgetCommandSchema.safeParse(raw);
  if(!parsed.success)return failure('invalid_input');
  const command=parsed.data;
  if(typeof snapshot.accountingBlocked!=='boolean'||snapshot.pilotId!==command.binding.pilotId||![snapshot.capNanoUsd,snapshot.chargedNanoUsd,snapshot.turnAttemptCount].every(n=>Number.isSafeInteger(n)&&n>=0))return failure('invalid_input');
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
    return {ok:true,record:{binding:structuredClone(command.binding),state:'reserved',chargedNanoUsd:command.binding.reservedNanoUsd,usage:null,accountingAlert:false},write:'insert',chargeDeltaNanoUsd:command.binding.reservedNanoUsd,dispatchGranted:false};
  }
  if(!previous)return failure('not_found');
  if(command.operation==='lookup')return unchanged();
  const update=(state:PilotAttemptRecord['state'],chargedNanoUsd:number,usage:PilotUsage|null,dispatchGranted=false,accountingAlert=false):PilotBudgetDecision=>({ok:true,record:{binding:structuredClone(previous!.binding),state,chargedNanoUsd,usage:structuredClone(usage),accountingAlert},write:'update',chargeDeltaNanoUsd:chargedNanoUsd-previous!.chargedNanoUsd,dispatchGranted});
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
    return update('unknown',previous.chargedNanoUsd,null);
  }
  if(command.operation==='settle') {
    if(previous.state==='settled')return JSON.stringify(previous.usage)===JSON.stringify(command.usage)?unchanged():failure('idempotency_conflict');
    if(previous.state!=='dispatched'&&previous.state!=='unknown')return failure('invalid_transition');
    const amount=pricePilotUsageNanoUsd(command.usage);
    if(amount===null)return update('unknown',previous.chargedNanoUsd,command.usage,false,true);
    // Bill measured usage even if it exceeded the reservation: never hide an overrun.
    return update('settled',amount,command.usage,false,amount>previous.binding.reservedNanoUsd);
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

/** Production-facing reservation remains disabled; tests use the pure core/port.
 * Enabling a cap requires the separate authorization and persistent SQL gates.
 */
export async function reserveCoachPilotAttempt(binding:PilotAttemptBinding,store:PilotBudgetStore,signal:AbortSignal):Promise<PilotBudgetResult> {
  if(COACH_PILOT_BUDGET_USD<=0)return {ok:false,error:'budget_blocked',storage:'database'};
  return executePilotBudgetCommand({operation:'reserve',binding},store,signal);
}
