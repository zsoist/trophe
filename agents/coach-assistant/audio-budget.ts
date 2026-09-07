import { z } from 'zod';
import type { PilotBudgetError } from './pilot-budget';
/** Official OpenAI pricing/model pages fetched 2026-09-07. Standard global endpoint only.
 * STT bills input/output tokens; estimated $/minute is NOT a settlement tariff.
 * TTS bills text input/audio output tokens. No duration/character conversion.
 */
export const AUDIO_PRICING_VERSION='openai-audio-standard-2026-09-07.v1' as const;
export const AUDIO_RESERVATION_NANO_USD=30_000_000 as const;
const nano=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const audioBindingSchema=z.object({
 pilotId:z.string().uuid(),actorId:z.string().uuid(),attemptId:z.string().uuid(),agentRunId:z.string().uuid(),turnId:z.string().uuid(),
 organizationId:z.string().uuid(),conversationId:z.string().uuid(),
 modality:z.enum(['stt','tts']),model:z.enum(['gpt-4o-mini-transcribe','gpt-4o-mini-tts']),
 pricingVersion:z.literal(AUDIO_PRICING_VERSION),requestHash:z.string().regex(/^[a-f0-9]{64}$/),
 reservedNanoUsd:z.literal(AUDIO_RESERVATION_NANO_USD),
}).strict().refine(b=>b.model===(b.modality==='stt'?'gpt-4o-mini-transcribe':'gpt-4o-mini-tts'));
export type AudioBinding=z.infer<typeof audioBindingSchema>;
export const audioUsageSchema=z.object({unit:z.literal('provider_tokens'),inputTokens:nano,outputTokens:nano}).strict();
export type AudioUsage=z.infer<typeof audioUsageSchema>;
export function priceAudioUsageNanoUsd(binding:AudioBinding,raw:unknown):number|null{
 const b=audioBindingSchema.safeParse(binding),u=audioUsageSchema.safeParse(raw);
 if(!b.success||!u.success||u.data.inputTokens+u.data.outputTokens===0)return null;
 const amount=u.data.inputTokens*(b.data.modality==='stt'?1250:600)+u.data.outputTokens*(b.data.modality==='stt'?5000:12000);
 return Number.isSafeInteger(amount)?amount:null;
}
export const audioCommandSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.enum(['reserve','lookup','claim_dispatch','mark_unknown','release_unstarted']),binding:audioBindingSchema}).strict(),
 z.object({operation:z.literal('settle'),binding:audioBindingSchema,usage:audioUsageSchema}).strict(),
]);
export type AudioCommand=z.infer<typeof audioCommandSchema>;
export const audioRecordSchema=z.object({binding:audioBindingSchema,state:z.enum(['reserved','dispatched','unknown','settled','released']),chargedNanoUsd:nano,usage:audioUsageSchema.nullable(),accountingAlert:z.boolean()}).strict().refine(r=>{
 if(r.state==='settled')return r.usage!==null&&priceAudioUsageNanoUsd(r.binding,r.usage)===r.chargedNanoUsd&&r.accountingAlert===(r.chargedNanoUsd>r.binding.reservedNanoUsd);
 if(r.state==='unknown')return r.chargedNanoUsd===r.binding.reservedNanoUsd&&r.usage===null&&r.accountingAlert;
 return r.usage===null&&!r.accountingAlert&&r.chargedNanoUsd===(r.state==='released'?0:r.binding.reservedNanoUsd);
});
export type AudioRecord=z.infer<typeof audioRecordSchema>;
export type AudioDecision={ok:false;error:PilotBudgetError}|{ok:true;record:AudioRecord;write:'none'|'insert'|'update';chargeDeltaNanoUsd:number;dispatchGranted:boolean};
export const sameAudioBinding=(a:AudioBinding,b:AudioBinding)=>Object.keys(a).length===Object.keys(b).length&&(Object.keys(a) as Array<keyof AudioBinding>).every(k=>a[k]===b[k]);
/** Pure transaction decision. Same account lock/aggregate as text is mandatory. */
export function decideAudioBudgetCommand(snapshot:{pilotId:string;capNanoUsd:number;chargedNanoUsd:number;turnAttemptCount:number;turnChargedNanoUsd:number;accountingBlocked:boolean;existing?:AudioRecord},raw:unknown):AudioDecision{
 const parsed=audioCommandSchema.safeParse(raw);const fail=(error:PilotBudgetError):AudioDecision=>({ok:false,error});
 if(!parsed.success)return fail('invalid_input');
 const c=parsed.data,b=c.binding;
 if(snapshot.pilotId!==b.pilotId||![snapshot.capNanoUsd,snapshot.chargedNanoUsd,snapshot.turnAttemptCount,snapshot.turnChargedNanoUsd].every(n=>Number.isSafeInteger(n)&&n>=0))return fail('invalid_input');
 const p=snapshot.existing;
 if(p&&(!audioRecordSchema.safeParse(p).success||!sameAudioBinding(p.binding,b)))return fail('idempotency_conflict');
 const unchanged=():AudioDecision=>({ok:true,record:structuredClone(p!),write:'none',chargeDeltaNanoUsd:0,dispatchGranted:false});
 const update=(state:AudioRecord['state'],amount:number,usage:AudioUsage|null,dispatchGranted=false,accountingAlert=false):AudioDecision=>({ok:true,record:{binding:structuredClone(b),state,chargedNanoUsd:amount,usage,accountingAlert},write:'update',chargeDeltaNanoUsd:amount-p!.chargedNanoUsd,dispatchGranted});
 if(c.operation==='reserve'){
  if(p)return unchanged();
  const total=snapshot.chargedNanoUsd+b.reservedNanoUsd;
  if(snapshot.accountingBlocked||snapshot.turnAttemptCount>=1||!Number.isSafeInteger(total)||total>snapshot.capNanoUsd||snapshot.turnChargedNanoUsd+b.reservedNanoUsd>50_000_000)return fail('budget_blocked');
  return {ok:true,record:{binding:structuredClone(b),state:'reserved',chargedNanoUsd:b.reservedNanoUsd,usage:null,accountingAlert:false},write:'insert',chargeDeltaNanoUsd:b.reservedNanoUsd,dispatchGranted:false};
 }
 if(!p)return fail('not_found');
 if(c.operation==='lookup')return unchanged();
 if(c.operation==='claim_dispatch'){
  if(p.state!=='reserved')return unchanged();
  if(snapshot.accountingBlocked||snapshot.capNanoUsd===0||snapshot.chargedNanoUsd>snapshot.capNanoUsd)return fail('budget_blocked');
  return update('dispatched',p.chargedNanoUsd,null,true);
 }
 if(c.operation==='release_unstarted')return p.state==='released'?unchanged():p.state==='reserved'?update('released',0,null):fail('invalid_transition');
 if(c.operation==='mark_unknown')return p.state==='dispatched'?update('unknown',p.chargedNanoUsd,null,false,true):['unknown','settled','released'].includes(p.state)?unchanged():fail('invalid_transition');
 if(c.operation!=='settle')return fail('invalid_input');
 if(p.state==='settled')return JSON.stringify(p.usage)===JSON.stringify(c.usage)?unchanged():fail('idempotency_conflict');
 if(!['dispatched','unknown'].includes(p.state))return fail('invalid_transition');
 const amount=priceAudioUsageNanoUsd(b,c.usage);
 return amount===null?update('unknown',p.chargedNanoUsd,null,false,true):update('settled',amount,c.usage,false,amount>b.reservedNanoUsd);
}
export interface AudioBudgetPort {execute(command:AudioCommand,signal:AbortSignal):Promise<unknown>}
export async function executeAudioBudgetCommand(command:AudioCommand,port:AudioBudgetPort,signal:AbortSignal):Promise<AudioDecision>{
 const fail=():AudioDecision=>({ok:false,error:'uncertain'});
 if(!audioCommandSchema.safeParse(command).success||signal.aborted)return fail();
 try{
  const raw=await port.execute(structuredClone(command),signal);
  if(signal.aborted||!raw||typeof raw!=='object')return fail();
  const r=raw as AudioDecision;
  if(r.ok!==true)return fail();
  const parsed=audioRecordSchema.safeParse(r.record);
  if(!parsed.success||!sameAudioBinding(parsed.data.binding,command.binding)||!['none','insert','update'].includes(r.write)||!Number.isSafeInteger(r.chargeDeltaNanoUsd)||typeof r.dispatchGranted!=='boolean')return fail();
  if(r.dispatchGranted&&(command.operation!=='claim_dispatch'||r.write!=='update'||r.record.state!=='dispatched'))return fail();
  if(r.write==='none'&&r.chargeDeltaNanoUsd!==0)return fail();
  return r;
 }catch{return fail();}
}
