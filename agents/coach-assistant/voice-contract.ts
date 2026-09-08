import { coachMessageInputSchema } from './message-input';
export { COACH_AUDIO_LIMITS, startCoachAudioRecording } from './voice-capture';

export interface CoachVoiceScope { actorId:string;organizationId:string;conversationId:string }
export type CoachVoiceResult={version:'coach-assistant.voice.v1';ok:false;status:'not_connected'|'error';error:'budget_blocked'|'forbidden'|'invalid_audio'|'invalid_input'|'invalid_output'|'cancelled'|'deadline'|'provider_unavailable'}|
  {version:'coach-assistant.voice.v1';ok:true;status:'review_required';scope:CoachVoiceScope;turnId:string;transcript:{text:string;languages:string[];source:'synthetic_fixture'};durationMs:number};

/** Returns editable text only. Never sends a turn, stores a memory or executes an action. */
export function prepareReviewedVoiceMessage(result:CoachVoiceResult,current:CoachVoiceScope,editedText:string,reviewed:boolean):{ok:true;message:string}|{ok:false;error:'review_required'|'forbidden'|'invalid_input'} {
  if(!result.ok||!reviewed)return {ok:false,error:'review_required'};
  if(result.scope.actorId!==current.actorId||result.scope.organizationId!==current.organizationId||result.scope.conversationId!==current.conversationId)return {ok:false,error:'forbidden'};
  const text=coachMessageInputSchema.safeParse(editedText);
  return text.success?{ok:true,message:text.data}:{ok:false,error:'invalid_input'};
}
