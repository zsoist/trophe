import { describe,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AUDIO_RESERVATION_NANO_USD,priceAudioUsageNanoUsd,type AudioBinding } from './audio-budget';
import { governAudio } from './audio-governor';
import { decideMultimodalBudgetCommand } from './multimodal-budget';
import { COACH_ATTEMPT_RESERVATION_NANO_USD,type PilotAttemptBinding } from './pilot-budget';
import { COACH_PRICING_VERSION } from './economics';
import {audioBinding,audioFixtureLedger} from './audio-test-fixtures';
const usage={unit:'provider_tokens' as const,inputTokens:20,outputTokens:10};
describe('audio pricing and common budget governance',()=>{
 it('prices documented model-specific tokens without duration or Luna conversion',()=>{
  expect(priceAudioUsageNanoUsd(audioBinding(),usage)).toBe(75_000);
  expect(priceAudioUsageNanoUsd(audioBinding('tts'),usage)).toBe(132_000);
  expect(priceAudioUsageNanoUsd(audioBinding(),{seconds:1})).toBeNull();
  expect(priceAudioUsageNanoUsd({...audioBinding(),pricingVersion:'unknown'} as unknown as AudioBinding,usage)).toBeNull();
 });
 it('reserves then claims before transport, settles exactly and rejects replay',async()=>{
  const binding=audioBinding(),l=audioFixtureLedger(binding);const invoke=vi.fn(async()=>{expect(l.calls).toEqual(['reserve','claim_dispatch']);return {output:'fixture',usage};});
  expect(await governAudio({mode:'injected',binding,budget:l.store,signal:new AbortController().signal,invoke})).toEqual({output:'fixture',accounting:'settled'});
  expect(l.records.get(binding.attemptId)).toMatchObject({state:'settled',chargedNanoUsd:75000});
  await expect(governAudio({mode:'injected',binding,budget:l.store,signal:new AbortController().signal,invoke})).rejects.toThrow('budget_blocked');expect(invoke).toHaveBeenCalledTimes(1);
 });
 it('cap0 live and missing store/pricing never reach transport',async()=>{
  const binding=audioBinding(),l=audioFixtureLedger(binding),invoke=vi.fn();
  for(const config of [{mode:'live' as const,budget:l.store,binding},{mode:'injected' as const,binding},{mode:'injected' as const,budget:l.store,binding:{...binding,pricingVersion:'invalid'} as unknown as AudioBinding}])await expect(governAudio({...config,signal:new AbortController().signal,invoke})).rejects.toThrow('budget_blocked');
  expect(invoke).not.toHaveBeenCalled();expect(l.calls).toEqual([]);
 });
 it('unknown usage and provider errors hold reservation and block the next modality',async()=>{
  const binding=audioBinding(),l=audioFixtureLedger(binding),signal=new AbortController().signal;
  await expect(governAudio({mode:'injected',binding,budget:l.store,signal,invoke:async()=>({output:'unreconciled',usage:null})})).rejects.toThrow('accounting_uncertain');
  expect(l.records.get(binding.attemptId)).toMatchObject({state:'unknown',chargedNanoUsd:AUDIO_RESERVATION_NANO_USD,accountingAlert:true});
  const tts={...audioBinding('tts'),pilotId:binding.pilotId,turnId:binding.turnId};const invoke=vi.fn();
  await expect(governAudio({mode:'injected',binding:tts,budget:l.store,signal,invoke})).rejects.toThrow('budget_blocked');expect(invoke).not.toHaveBeenCalled();
 });
 it('never refunds dispatched cancellation or masks measured overruns',async()=>{
  const binding=audioBinding(),l=audioFixtureLedger(binding),controller=new AbortController();
  await expect(governAudio({mode:'injected',binding,budget:l.store,signal:controller.signal,invoke:async()=>{controller.abort();throw new Error('cancelled');}})).rejects.toThrow();
  expect(l.records.get(binding.attemptId)).toMatchObject({state:'dispatched',chargedNanoUsd:AUDIO_RESERVATION_NANO_USD});
  const b=audioBinding('tts'),over=audioFixtureLedger(b);
  await expect(governAudio({mode:'injected',binding:b,budget:over.store,signal:new AbortController().signal,invoke:async()=>({output:'too much',usage:{...usage,outputTokens:4000}})})).rejects.toThrow('accounting_uncertain');
  expect(over.records.get(b.attemptId)).toMatchObject({state:'settled',chargedNanoUsd:48_012_000,accountingAlert:true});
 });
 it('enforces shared turn spend for text as well as audio without changing Luna pricing',()=>{
  const b=audioBinding();const text:PilotAttemptBinding={pilotId:b.pilotId,actorId:b.actorId,attemptId:randomUUID(),agentRunId:randomUUID(),turnId:b.turnId,model:'gpt-5.6-luna',pricingVersion:COACH_PRICING_VERSION,requestHash:'b'.repeat(64),reservedNanoUsd:COACH_ATTEMPT_RESERVATION_NANO_USD};
  const snapshot={pilotId:b.pilotId,capNanoUsd:100_000_000,chargedNanoUsd:49_000_000,turnChargedNanoUsd:49_000_000,turnAttemptCount:0,accountingBlocked:false};
  expect(decideMultimodalBudgetCommand(snapshot,{operation:'reserve',binding:text})).toMatchObject({ok:false,error:'budget_blocked'});
  expect(decideMultimodalBudgetCommand(snapshot,{operation:'reserve',binding:b})).toMatchObject({ok:false,error:'budget_blocked'});
 });
});
