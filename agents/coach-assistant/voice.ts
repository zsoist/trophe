import { z } from 'zod';
import { SUPPORTED_TRANSCRIPTION_LOCALES, transcriptionOutputSchema } from '@/agents/schemas/transcribe';
import type { invokeOpenAiTranscription } from '@/agents/runtime/providers/openai-transcription';
import { taskPolicies } from '@/agents/router/policies';
import { normalizeAudioMediaType, readAudioDurationMs } from '@/lib/server/audio-duration';
import { COACH_AUDIO_LIMITS, type CoachVoiceResult } from './voice-contract';
import type { CoachRepository } from './repository';

/** Existing provider signature; only a synthetic fixture callback is accepted here. */
export type OfflineCoachTranscriber=(input:Parameters<typeof invokeOpenAiTranscription>[0])=>ReturnType<typeof invokeOpenAiTranscription>;
const metadataSchema=z.object({conversationId:z.string().uuid(),turnId:z.string().uuid(),locale:z.enum(SUPPORTED_TRANSCRIPTION_LOCALES),durationMs:z.number().int().positive().max(COACH_AUDIO_LIMITS.durationMs),clientId:z.string().uuid().optional()}).strict();
const failure=(error:Extract<CoachVoiceResult,{ok:false}>['error']):CoachVoiceResult=>({version:'coach-assistant.voice.v1',ok:false,status:error==='budget_blocked'?'not_connected':'error',error});

/** Not wired to HTTP or paid STT. Authenticated subject is never taken from audio metadata. */
export async function transcribeCoachAudio(file:File,raw:unknown,options:{actorId:string;repository:CoachRepository;signal:AbortSignal;offlineTranscriber?:OfflineCoachTranscriber;deadlineMs?:number}):Promise<CoachVoiceResult> {
  const parsed=metadataSchema.safeParse(raw);
  if(!parsed.success)return failure('invalid_input');
  const input=parsed.data;
  if(input.clientId&&input.clientId!==options.actorId)return failure('forbidden');
  if(!options.offlineTranscriber||options.repository.dataSource!=='synthetic')return failure('budget_blocked');
  const controller=new AbortController();
  const cancel=()=>controller.abort(new Error('cancelled'));
  if(options.signal.aborted)cancel();else options.signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('deadline')),Math.min(45000,Math.max(1,options.deadlineMs??45000)));
  let boundary:(()=>void)|undefined;
  try {
    const work=async():Promise<CoachVoiceResult>=>{
      controller.signal.throwIfAborted();
      const context=await options.repository.authorize(options.actorId,options.actorId,controller.signal);
      if(context.actorId!==options.actorId||context.subjectId!==options.actorId)throw new Error('forbidden');
      const reauthorize=async()=>{
        const fresh=await options.repository.authorize(options.actorId,options.actorId,controller.signal);
        controller.signal.throwIfAborted();
        if(JSON.stringify(fresh)!==JSON.stringify(context))throw new Error('forbidden');
      };
      if(file.size<=0||file.size>COACH_AUDIO_LIMITS.fileBytes)throw new Error('invalid_audio');
      const mime=normalizeAudioMediaType(file.type);
      if(!['audio/webm','audio/mp4','video/mp4'].includes(mime))throw new Error('invalid_audio');
      const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
      const signature=mime==='audio/webm'?header[0]===0x1a&&header[1]===0x45&&header[2]===0xdf&&header[3]===0xa3:new TextDecoder().decode(header.slice(4,8))==='ftyp';
      if(!signature)throw new Error('invalid_audio');
      let durationMs:number;
      try {durationMs=await readAudioDurationMs(file);}catch{throw new Error('invalid_audio');}
      if(!Number.isFinite(durationMs)||durationMs<=0||durationMs>COACH_AUDIO_LIMITS.durationMs)throw new Error('invalid_audio');
      await reauthorize();
      // No food/intake context spoofing, no new transcription model or paid runner.
      const result=await options.offlineTranscriber!({model:taskPolicies.transcribe.model,file,locale:input.locale,durationMs,signal:controller.signal});
      await reauthorize();
      const transcript=transcriptionOutputSchema.safeParse(result.output);
      if(!transcript.success||transcript.data.text.length>2000||result.rawStatus<200||result.rawStatus>=300)throw new Error('invalid_output');
      return {version:'coach-assistant.voice.v1',ok:true,status:'review_required',scope:{actorId:context.actorId,organizationId:context.organizationId,conversationId:input.conversationId},turnId:input.turnId,transcript:{...transcript.data,source:'synthetic_fixture'},durationMs};
    };
    return await Promise.race([work(),new Promise<never>((_,reject)=>{
      boundary=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',boundary,{once:true});if(controller.signal.aborted)boundary();
    })]);
  } catch(error) {
    if(controller.signal.aborted)return failure(options.signal.aborted?'cancelled':'deadline');
    const code=error instanceof Error?error.message:'';
    return failure(code==='forbidden'||code==='invalid_audio'||code==='invalid_output'?code:'provider_unavailable');
  } finally {
    clearTimeout(timer);options.signal.removeEventListener('abort',cancel);if(boundary)controller.signal.removeEventListener('abort',boundary);
  }
}
