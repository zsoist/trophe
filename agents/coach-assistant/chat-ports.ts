import type {CoachChatScope} from './chat-contract';
import type {CoachAttachmentResult} from './contracts';
/** Neutral type-only final-text lookup. Implementations must check current auth
 * and session epoch, return null on revocation, and revise even identical reruns.
 */
export interface CoachSpeechTextPort {
 load(responseId:string,scope:Pick<CoachChatScope,'actorId'|'organizationId'>&{conversationId:string},signal:AbortSignal):Promise<{kind:'final_answer';speechAllowed:boolean;text:string;revision:string;sessionEpoch:string}|null>;
}
/** Cleanup requires only reviewed removal, not an upload/storage implementation. */
export interface CoachChatAttachmentRemovalPort {
 operation(scope:Pick<CoachChatScope,'actorId'|'subjectId'|'organizationId'>,operation:{version:'coach-assistant.v2';operation:'attachment.remove';conversationId:string;attachmentId:string;reviewed:true},signal:AbortSignal):Promise<Pick<CoachAttachmentResult,'ok'|'state'>>;
}
