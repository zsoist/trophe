import { z } from 'zod';
import { audioDigest,governAudio } from './audio-governor';
import { AUDIO_PRICING_VERSION,AUDIO_RESERVATION_NANO_USD,type AudioBudgetPort } from './audio-budget';
import type { AudioIdentity } from './governed-voice';
import type { CoachRepository } from './repository';
import type { CoachVoiceScope } from './voice-contract';
import { COACH_SPEECH_POLICY,validateCoachSpeechPcm,type CoachSpeechProvider } from './speech-provider';
/** Server-owned final response lookup. Must use the current authenticated session epoch,
 * return null after logout/revocation, and replace revision even on identical regeneration.
 * Do not construct this record from a client body or unvalidated model output.
 */
export interface CoachSpeechTextPort {load(responseId:string,scope:CoachVoiceScope,signal:AbortSignal):Promise<{kind:'final_answer';speechAllowed:boolean;text:string;revision:string;sessionEpoch:string}|null>}
const requestSchema=z.object({responseId:z.string().uuid(),conversationId:z.string().uuid()}).strict();
export interface CoachSpeechAudio {version:'coach-assistant.speech.v1';scope:CoachVoiceScope;responseId:string;textHash:string;audioHash:string;revision:string;sessionEpoch:string;expiresAt:number;syntheticVoice:true;disclosure:'Voz generada por IA';mediaType:'audio/pcm';sampleRate:24000;channels:1;bitsPerSample:16;audio:Uint8Array;source:'injected_provider'}
export type CoachSpeechResult={ok:true;status:'ready';value:CoachSpeechAudio;accounting:'settled'|'held_unknown'}|{ok:false;status:'not_connected'|'error';error:string};
const receipts=new WeakSet<CoachSpeechAudio>();
const textAllowed=(value:Awaited<ReturnType<CoachSpeechTextPort['load']>>)=>value?.kind==='final_answer'&&value.speechAllowed&&typeof value.text==='string'&&value.text.trim().length>0&&value.text.length<=COACH_SPEECH_POLICY.maxTextLength&&Boolean(value.revision)&&Boolean(value.sessionEpoch)&&!/(?:sk-[a-zA-Z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[a-zA-Z0-9._-]{12,})/.test(value.text);
export async function synthesizeCoachSpeech(raw:unknown,options:{actorId:string;repository:CoachRepository;texts:CoachSpeechTextPort;identity:AudioIdentity;mode:'injected'|'live';budget?:AudioBudgetPort;provider?:CoachSpeechProvider;signal:AbortSignal;deadlineMs?:number}):Promise<CoachSpeechResult>{
 const fail=(error:string):CoachSpeechResult=>({ok:false,status:['budget_blocked','accounting_uncertain','not_connected'].includes(error)?'not_connected':'error',error});
 const parsed=requestSchema.safeParse(raw);if(!parsed.success)return fail('invalid_input');
 if(!options.provider)return fail('not_connected');
 const controller=new AbortController(),cancel=()=>controller.abort(new Error('cancelled'));
 if(options.signal.aborted)cancel();else options.signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>controller.abort(new Error('deadline')),Math.min(45000,Math.max(1,options.deadlineMs??45000)));let boundary:(()=>void)|undefined;
 const signal=controller.signal;
 try{
  const work=async():Promise<CoachSpeechResult>=>{
   signal.throwIfAborted();const context=await options.repository.authorize(options.actorId,options.actorId,signal);
   const scope={actorId:context.actorId,organizationId:context.organizationId,conversationId:parsed.data.conversationId};
   const identity={...options.identity};
   if(context.actorId!==options.actorId||context.subjectId!==options.actorId||identity.actorId!==scope.actorId||identity.organizationId!==scope.organizationId||identity.conversationId!==scope.conversationId)throw new Error('forbidden');
   const text=await options.texts.load(parsed.data.responseId,scope,signal);
   if(!textAllowed(text)||!text)throw new Error('forbidden');
   const snapshot=structuredClone(text),textHash=audioDigest(snapshot.text);
   const reauthorize=async()=>{
    const auth=await options.repository.authorize(options.actorId,options.actorId,signal);
    const current=await options.texts.load(parsed.data.responseId,scope,signal);signal.throwIfAborted();
    if(JSON.stringify(auth)!==JSON.stringify(context)||JSON.stringify(current)!==JSON.stringify(snapshot))throw new Error('forbidden');
   };
   await reauthorize();
   const governed=await governAudio({allowHeldOutput:true,mode:options.mode,binding:{...identity,modality:'tts',model:COACH_SPEECH_POLICY.model,pricingVersion:AUDIO_PRICING_VERSION,reservedNanoUsd:AUDIO_RESERVATION_NANO_USD,requestHash:audioDigest({responseId:parsed.data.responseId,textHash,revision:snapshot.revision,sessionEpoch:snapshot.sessionEpoch,policy:COACH_SPEECH_POLICY})},budget:options.budget,signal,invoke:async()=>{
    // Reauthorize after reservation/claim as well; no stale scope reaches transport.
    await reauthorize();const result=await options.provider!({text:snapshot.text,signal});
    if(result.mediaType!=='audio/pcm')throw new Error('invalid_audio');validateCoachSpeechPcm(result.audio);
    return {output:result.audio.slice(),usage:result.usage};
   }});
   await reauthorize();
   const audio=governed.output;
   const value:CoachSpeechAudio={version:'coach-assistant.speech.v1',scope,responseId:parsed.data.responseId,textHash,audioHash:audioDigest(Array.from(audio)),revision:snapshot.revision,sessionEpoch:snapshot.sessionEpoch,expiresAt:Date.now()+60_000,syntheticVoice:true,disclosure:'Voz generada por IA',mediaType:'audio/pcm',sampleRate:24000,channels:1,bitsPerSample:16,audio,source:'injected_provider'};
   Object.freeze(value.scope);Object.freeze(value);receipts.add(value);return {ok:true,status:'ready',value,accounting:governed.accounting};
  };
  return await Promise.race([work(),new Promise<never>((_,reject)=>{boundary=()=>reject(signal.reason);signal.addEventListener('abort',boundary,{once:true});if(signal.aborted)boundary();})]);
 }catch(error){if(signal.aborted)return fail(options.signal.aborted?'cancelled':'deadline');const code=error instanceof Error?error.message:'';return fail(['forbidden','invalid_audio','budget_blocked','accounting_uncertain','not_connected'].includes(code)?code:'provider_unavailable');}
 finally{clearTimeout(timer);options.signal.removeEventListener('abort',cancel);if(boundary)signal.removeEventListener('abort',boundary);}
}
/** Server validation before issuing audio. UI must also stop/revoke its object URL on
 * logout, regeneration or scope change; this cannot retract bytes already delivered. */
export async function validateCoachSpeechPlayback(value:CoachSpeechAudio,current:CoachVoiceScope,texts:CoachSpeechTextPort,signal:AbortSignal):Promise<boolean>{
 if(!receipts.has(value)||Date.now()>=value.expiresAt||audioDigest(value.scope)!==audioDigest(current)||value.audioHash!==audioDigest(Array.from(value.audio))||signal.aborted)return false;
 try{const text=await texts.load(value.responseId,current,signal);return !signal.aborted&&textAllowed(text)&&text?.revision===value.revision&&text.sessionEpoch===value.sessionEpoch&&audioDigest(text.text)===value.textHash;}catch{return false;}
}
