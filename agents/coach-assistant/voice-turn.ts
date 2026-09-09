import type {CoachConversationRequest,CoachConversationResponse} from './contracts';
import {conversationRequestSchema} from './schema';
import type {CoachRepository} from './repository';
import {prepareReviewedVoiceMessage,type CoachVoiceResult,type CoachVoiceScope} from './voice-contract';
import {verifyVoiceReviewToken} from './voice-review-token';
export {hasAmbiguousSpokenNumber} from './voice-ambiguity';
import {hasAmbiguousSpokenNumber} from './voice-ambiguity';

type RequestTail=Omit<CoachConversationRequest,'message'>;
export interface VoiceTextPipeline {run(request:CoachConversationRequest,signal:AbortSignal):Promise<CoachConversationResponse>}
export interface CoachSpeechDescriptor {status:'available_on_request';conversationId:string;turnId:string;textSource:'validated_final_answer';syntheticVoice:true;autoplay:false;expiresInMs:60000;requiresResponseId:true}
export type ReviewedVoiceTurnResult=
 |{ok:false;status:'review_required'|'clarification_required'|'error';error:'review_required'|'ambiguous_number'|'forbidden'|'invalid_input'|'cancelled'|'pipeline_failed'}
 |{ok:true;status:'answered';transcript:{text:string;locale:string;languages:string[];source:'synthetic_fixture'|'provider_transcript';trust:'untrusted_user_reviewed_data'};response:CoachConversationResponse;speech:CoachSpeechDescriptor|null};

const fail=(status:Extract<ReviewedVoiceTurnResult,{ok:false}>['status'],error:Extract<ReviewedVoiceTurnResult,{ok:false}>['error']):ReviewedVoiceTurnResult=>({ok:false,status,error});

/** Continues through the existing text pipeline only after an ephemeral reviewed
 * transcript proof. It never receives raw audio, persists audio or invokes STT/TTS. */
export async function runReviewedVoiceTurn(input:{voice:CoachVoiceResult;editedText:string;reviewed:boolean;request:RequestTail;offerSpeech?:boolean},options:{actorId:string;repository:CoachRepository;pipeline:VoiceTextPipeline;signal:AbortSignal}):Promise<ReviewedVoiceTurnResult>{
 if(options.signal.aborted)return fail('error','cancelled');if(!input.voice.ok||!input.reviewed)return fail('review_required','review_required');
 const voice=input.voice,scope:CoachVoiceScope={actorId:voice.scope.actorId,organizationId:voice.scope.organizationId,conversationId:input.request.conversationId};
 if(input.request.conversationId!==voice.scope.conversationId||input.request.turnId!==voice.turnId||scope.actorId!==options.actorId)return fail('error','forbidden');
 const prepared=prepareReviewedVoiceMessage(voice,scope,input.editedText,true);if(!prepared.ok)return fail(prepared.error==='review_required'?'review_required':'error',prepared.error);
 if(!verifyVoiceReviewToken(voice.review.token,{...voice.scope,turnId:voice.turnId,locale:voice.transcript.locale,transcript:voice.transcript.text}))return fail('error','forbidden');
 if(hasAmbiguousSpokenNumber(prepared.message))return fail('clarification_required','ambiguous_number');
 const request=conversationRequestSchema.safeParse({...input.request,message:prepared.message});if(!request.success)return fail('error','invalid_input');
 if(request.data.context?.clientId&&request.data.context.clientId!==options.actorId)return fail('error','forbidden');
 try{
  const before=await options.repository.authorize(options.actorId,options.actorId,options.signal);if(before.actorId!==options.actorId||before.subjectId!==options.actorId||before.organizationId!==voice.scope.organizationId)return fail('error','forbidden');
  const response=await options.pipeline.run(request.data,options.signal);options.signal.throwIfAborted();
  const after=await options.repository.authorize(options.actorId,options.actorId,options.signal);if(JSON.stringify(after)!==JSON.stringify(before)||response.conversationId!==voice.scope.conversationId||response.turnId!==voice.turnId||response.snapshot&&response.snapshot.subjectId!==options.actorId||response.snapshot&&response.snapshot.organizationId!==voice.scope.organizationId)return fail('error','forbidden');
  if(!response.ok||!response.output)return fail('error','pipeline_failed');
  const speech=input.offerSpeech?{status:'available_on_request' as const,conversationId:voice.scope.conversationId,turnId:voice.turnId,textSource:'validated_final_answer' as const,syntheticVoice:true as const,autoplay:false as const,expiresInMs:60000 as const,requiresResponseId:true as const}:null;
  return {ok:true,status:'answered',transcript:{text:prepared.message,locale:voice.transcript.locale,languages:[...voice.transcript.languages],source:voice.transcript.source,trust:'untrusted_user_reviewed_data'},response,speech};
 }catch{return fail('error',options.signal.aborted?'cancelled':'pipeline_failed');}
}
