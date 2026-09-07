/** Browser-safe durable chat contract. Scope and finality are server-owned. */
export const COACH_CHAT_VERSION='coach-assistant.chat.v1' as const;
export interface CoachChatScope {actorId:string;organizationId:string;actorRole:'client'|'coach'|'admin'|'super_admin';subjectId:string}
export interface CoachChatThread {id:string;title:string;createdAt:string;revision:string;state:'active'|'cleanup_pending'|'deleted'}
export interface CoachChatMessage {id:string;turnId:string;role:'user'|'assistant';text:string;sequence:number;revision:string;createdAt:string}
export type CoachChatError='not_connected'|'forbidden'|'not_found'|'invalid_input'|'idempotency_conflict'|'version_conflict'|'cancelled'|'uncertain';
export type CoachChatResult<T>={version:typeof COACH_CHAT_VERSION;storage:'database';ok:true;value:T}|{version:typeof COACH_CHAT_VERSION;storage:'database';ok:false;error:CoachChatError};
