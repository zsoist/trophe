import {randomUUID} from 'node:crypto';
import {AUDIO_PRICING_VERSION,AUDIO_RESERVATION_NANO_USD,decideAudioBudgetCommand,type AudioBinding,type AudioCommand,type AudioRecord,type AudioBudgetPort} from './audio-budget';
export function audioBinding(modality:'stt'|'tts'='stt'):AudioBinding{return {pilotId:randomUUID(),actorId:randomUUID(),organizationId:randomUUID(),conversationId:randomUUID(),attemptId:randomUUID(),agentRunId:randomUUID(),turnId:randomUUID(),modality,model:modality==='stt'?'gpt-4o-mini-transcribe':'gpt-4o-mini-tts',pricingVersion:AUDIO_PRICING_VERSION,requestHash:'a'.repeat(64),reservedNanoUsd:AUDIO_RESERVATION_NANO_USD};}
/** Pure fixture only. Concrete SQL writer tests are separate; never use this in product. */
export function audioFixtureLedger(b:AudioBinding,capNanoUsd=100_000_000){
 const records=new Map<string,AudioRecord>();const calls:string[]=[];let blocked=false;
 const store:AudioBudgetPort={execute:async(c:AudioCommand,signal)=>{
  signal.throwIfAborted();calls.push(c.operation);
  const all=[...records.values()];const result=decideAudioBudgetCommand({pilotId:b.pilotId,capNanoUsd,chargedNanoUsd:all.reduce((n,r)=>n+r.chargedNanoUsd,0),turnAttemptCount:all.filter(r=>r.binding.turnId===c.binding.turnId&&r.binding.modality===c.binding.modality).length,turnChargedNanoUsd:all.filter(r=>r.binding.turnId===c.binding.turnId).reduce((n,r)=>n+r.chargedNanoUsd,0),accountingBlocked:blocked,existing:records.get(c.binding.attemptId)},c);
  if(result.ok&&result.write!=='none'){records.set(c.binding.attemptId,result.record);blocked ||= result.record.accountingAlert;}
  return result;
 }};return {store,records,calls};
}

// Silent 108ms Opus fixture. Any transcript in tests is injected, not recognized speech.
const audio='GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAI3EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggFCTbuMU6uEHFO7a1OsggIh7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAyV0GNTGF2ZjYyLjEyLjEwMkSJiEBbAAAAAAAAFlSua+WuAQAAAAAAAFzXgQFzxYgsJ0xZKgl/uJyBACK1nIN1bmSIgQCGhkFfT1BVU1aqg2MuoFa7hATEtACDgQLhkZ+BAbWIQL9AAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBQB8AAAAAABJUw2f9c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2Mi4xMi4xMDJzc9djwItjxYgsJ0xZKgl/uGfIokWjh0VOQ09ERVJEh5VMYXZjNjIuMjguMTAyIGxpYm9wdXNnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjEwODAwMDAwMAAfQ7Z12OeBAKOLgQAAgAgL5jsjq2CjioEAFYAICKyzDsajioEAKYAICKyzDsajioEAPYAICKyzDsajioEAUYAICKyzDsaglqGKgQBlAAgIrLMOxpuBB3WihADN/mAcU7trkbuPs4EAt4r3gQHxggHE8IED';
export const silentCoachWebm=()=>new File([Buffer.from(audio,'base64')],'recording.webm',{type:'audio/webm'});
