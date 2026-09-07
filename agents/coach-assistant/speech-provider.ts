import { assertPaidProviderAccess, PAID_PROVIDER_OFFLINE_CREDENTIAL } from '@/agents/runtime/provider-access';
import { debitPaidTransportAttempt } from '@/scripts/safety/require-paid-ai-approval';
import { COACH_PILOT_BUDGET_USD } from './economics';
import type { AudioUsage } from './audio-budget';
export const COACH_SPEECH_POLICY=Object.freeze({model:'gpt-4o-mini-tts' as const,voice:'coral' as const,format:'pcm' as const,sampleRate:24000,channels:1,bitsPerSample:16,maxBytes:2*1024*1024,maxDurationMs:30000,maxTextLength:1000});
export interface SpeechProviderResult {audio:Uint8Array;mediaType:'audio/pcm';usage:AudioUsage|null}
export type CoachSpeechProvider=(input:{text:string;signal:AbortSignal})=>Promise<SpeechProviderResult>;
/** Concrete OpenAI HTTP transport. No retries, custom endpoint or default paid access.
 * Binary Speech responses expose no request-level token usage: keep usage null.
 * A future documented usage-bearing transport may settle; do not estimate tokens from PCM.
 */
export function createOpenAiCoachSpeechProvider(config:{fetchImpl?:typeof fetch;beforeTransportAttempt?:Parameters<typeof debitPaidTransportAttempt>[0]}={}):CoachSpeechProvider{
 const fetchImpl=config.fetchImpl,before=config.beforeTransportAttempt;
 return async input=>{
  if(!fetchImpl&&COACH_PILOT_BUDGET_USD<=0)throw new Error('budget_blocked');
  input.signal.throwIfAborted();
  if(!input.text.trim()||input.text.length>COACH_SPEECH_POLICY.maxTextLength)throw new Error('invalid_input');
  const mode=assertPaidProviderAccess({provider:'openai',transportWasInjected:fetchImpl!==undefined});
  const key=mode==='offline'?PAID_PROVIDER_OFFLINE_CREDENTIAL:process.env.OPENAI_API_KEY;
  if(!key)throw new Error('budget_blocked');
  const endpoint='https://api.openai.com/v1/audio/speech';
  debitPaidTransportAttempt(before,endpoint);
  const response=await (fetchImpl??fetch)(endpoint,{method:'POST',redirect:'error',signal:input.signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:COACH_SPEECH_POLICY.model,voice:COACH_SPEECH_POLICY.voice,input:input.text,response_format:'pcm',speed:1})});
  if(!response.ok)throw new Error('provider_unavailable');
  const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(!['audio/pcm','application/octet-stream'].includes(mime??'')||!response.body)throw new Error('invalid_audio');
  const chunks:Uint8Array[]=[];let size=0;const reader=response.body.getReader();
  try{while(true){input.signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>COACH_SPEECH_POLICY.maxBytes)throw new Error('invalid_audio');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  input.signal.throwIfAborted();
  const audio=new Uint8Array(size);let offset=0;for(const chunk of chunks){audio.set(chunk,offset);offset+=chunk.byteLength;}
  validateCoachSpeechPcm(audio);
  return {audio,mediaType:'audio/pcm',usage:null};
 };
}
/** PCM is headerless by protocol: bytes are 24kHz mono signed 16-bit LE, not WAV.
 * Structural/nonzero checks do not establish intelligibility or faithful pronunciation.
 */
export function validateCoachSpeechPcm(audio:Uint8Array):number{
 const p=COACH_SPEECH_POLICY,durationMs=audio.byteLength/(p.sampleRate*2)*1000;
 if(audio.byteLength===0||audio.byteLength%2!==0||audio.byteLength>p.maxBytes||durationMs>p.maxDurationMs)throw new Error('invalid_audio');
 const data=new DataView(audio.buffer,audio.byteOffset,audio.byteLength);let nonzero=false;
 for(let i=0;i<audio.byteLength;i+=2)if(data.getInt16(i,true)!==0){nonzero=true;break;}
 if(!nonzero)throw new Error('invalid_audio');return durationMs;
}
