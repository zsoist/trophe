import { z } from 'zod';
import { pilotAttemptRecordSchema,pilotBudgetCommandSchema,decidePilotBudgetCommand,type PilotAttemptRecord } from './pilot-budget';
import { audioRecordSchema,audioCommandSchema,decideAudioBudgetCommand,type AudioRecord } from './audio-budget';
export const multimodalCommandSchema=z.union([pilotBudgetCommandSchema,audioCommandSchema]);
export const multimodalRecordSchema=z.union([pilotAttemptRecordSchema,audioRecordSchema]);
export type MultimodalRecord=PilotAttemptRecord|AudioRecord;
export const recordModality=(record:MultimodalRecord)=>'modality' in record.binding?record.binding.modality:'text';
export function decideMultimodalBudgetCommand(snapshot:{pilotId:string;capNanoUsd:number;chargedNanoUsd:number;turnAttemptCount:number;turnChargedNanoUsd:number;accountingBlocked:boolean;existing?:MultimodalRecord},raw:unknown){
 const audio=audioCommandSchema.safeParse(raw);
 if(audio.success){
  const existing=snapshot.existing?audioRecordSchema.safeParse(snapshot.existing):undefined;
  if(existing&&!existing.success)return {ok:false as const,error:'idempotency_conflict' as const};
  return decideAudioBudgetCommand({...snapshot,existing:existing?.data},audio.data);
 }
 const text=pilotBudgetCommandSchema.safeParse(raw);
 if(!text.success)return {ok:false as const,error:'invalid_input' as const};
 const existing=snapshot.existing?pilotAttemptRecordSchema.safeParse(snapshot.existing):undefined;
 if(existing&&!existing.success)return {ok:false as const,error:'idempotency_conflict' as const};
 // Audio and text spend share this same per-turn aggregate; text still has at most two invocations.
 if(text.data.operation==='reserve'&&!existing&&snapshot.turnChargedNanoUsd+text.data.binding.reservedNanoUsd>50_000_000)return {ok:false as const,error:'budget_blocked' as const};
 return decidePilotBudgetCommand({...snapshot,existing:existing?.data},text.data);
}
