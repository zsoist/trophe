import { createHash } from 'node:crypto';
import { taskPolicies } from '@/agents/router/policies';
import { invokeOpenAiTranscription } from '@/agents/runtime/providers/openai-transcription';
import { governAudio,audioDigest } from './audio-governor';
import { AUDIO_PRICING_VERSION,AUDIO_RESERVATION_NANO_USD,type AudioBinding,type AudioBudgetPort } from './audio-budget';
import type { OfflineCoachTranscriber } from './voice';
import type { CoachVoiceScope } from './voice-contract';
const registered=new WeakMap<OfflineCoachTranscriber,CoachVoiceScope&{turnId:string}>();
export function isGovernedCoachTranscriber(transport:OfflineCoachTranscriber,scope?:CoachVoiceScope,turnId?:string){
 const b=registered.get(transport);return Boolean(b&&(!scope||b.actorId===scope.actorId&&b.organizationId===scope.organizationId&&b.conversationId===scope.conversationId&&(!turnId||b.turnId===turnId)));
}
export type AudioIdentity=Pick<AudioBinding,'pilotId'|'actorId'|'organizationId'|'conversationId'|'attemptId'|'agentRunId'|'turnId'>;
/** Reuses the existing OpenAI multipart transport with an explicit offline fetch. No key read. */
export function createInjectedOpenAiCoachTranscriber(fetchImpl:typeof fetch):OfflineCoachTranscriber{
 return input=>invokeOpenAiTranscription({...input,fetchImpl});
}
/** Identity is supplied by the server; checked against current authorization in voice.ts. */
export function createGovernedCoachTranscriber(config:{mode:'injected'|'live';identity:AudioIdentity;budget?:AudioBudgetPort;transport?:OfflineCoachTranscriber}){
 const identity=Object.freeze({...config.identity}),provider=config.transport,mode=config.mode,budget=config.budget;
 const transport:OfflineCoachTranscriber=async input=>{
  if(!provider||input.model!==taskPolicies.transcribe.model)throw new Error('budget_blocked');
  const digest=createHash('sha256').update(new Uint8Array(await input.file.arrayBuffer())).digest('hex');
  const governed=await governAudio({mode,binding:{...identity,modality:'stt',model:'gpt-4o-mini-transcribe',pricingVersion:AUDIO_PRICING_VERSION,reservedNanoUsd:AUDIO_RESERVATION_NANO_USD,requestHash:audioDigest({digest,locale:input.locale,durationMs:input.durationMs,model:input.model})},budget,signal:input.signal,invoke:async()=>{
   await input.authorizeBeforeTransport?.();input.signal.throwIfAborted();
   const result=await provider(input);
   return {output:result,usage:{unit:'provider_tokens',inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens}};
  }});
  return governed.output;
 };
 registered.set(transport,identity);return transport;
}
