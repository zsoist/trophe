import { localDateStr } from '@/lib/utils/dates';
import { createHash } from 'node:crypto';
import type { CoachActorRole, CoachConversationRequest, CoachIntent, CoachWindow } from './contracts';

export interface Actor { id: string; role: string; organizationIds: string[] }
export interface Subject { id: string; coachId: string | null; organizationIds: string[]; timezone: string; language: string }
export interface AuthorizedContext { actorId: string; subjectId: string; organizationId: string; timezone: string; language: string; actorRole?:CoachActorRole;access?:'self'|'assigned_professional' }

const actorRoles:readonly CoachActorRole[]=['client','coach','admin','super_admin'];
export function conversationScope(context:AuthorizedContext){
  const actorRole=context.actorRole??(context.actorId===context.subjectId?'client':'coach');
  if(!actorRoles.includes(actorRole))throw new Error('forbidden');
  const access=context.access??(context.actorId===context.subjectId?'self':'assigned_professional');
  if((access==='self')!==(context.actorId===context.subjectId)||actorRole==='client'&&access!=='self')throw new Error('forbidden');
  const scopeKey=createHash('sha256').update(['coach-scope.v2',context.actorId,context.subjectId,context.organizationId,actorRole,access].join('\0')).digest('hex');
  return {actorRole,access,scopeKey};
}

/** Professional browser history and attachments are untrusted cross-subject state.
 * The server drops them before selection, context reads or model input. */
export function scopeConversationInput(input:CoachConversationRequest,context:AuthorizedContext):CoachConversationRequest{
  return conversationScope(context).access==='assigned_professional'?{...input,history:undefined,attachments:undefined}:input;
}

/** Inputs are queried by the server. Request body and model never construct these. */
export function authorizeSubject(actor: Actor | null, subject: Subject | null): AuthorizedContext {
  if (!actor) throw new Error('unauthenticated');
  if (!subject) throw new Error('forbidden');
  if(!actorRoles.includes(actor.role as CoachActorRole))throw new Error('forbidden');
  const actorRole=actor.role as CoachActorRole;
  const sharedOrg = actor.organizationIds.find(org => subject.organizationIds.includes(org));
  const own = actorRole === 'client' && actor.id === subject.id;
  const assigned = ['coach', 'admin', 'super_admin'].includes(actorRole) && subject.coachId === actor.id;
  if (!sharedOrg || (!own && !assigned)) throw new Error('forbidden');
  return { actorId: actor.id, subjectId: subject.id, organizationId: sharedOrg, timezone: subject.timezone, language: subject.language,actorRole,access:own?'self':'assigned_professional' };
}

export function windowFor(intent: CoachIntent, timezone: string, now: Date): CoachWindow {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  } catch { throw new Error('invalid_timezone'); }
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  // Calendar arithmetic, not subtraction of 24h instants across DST boundaries.
  const date = new Date(part('year'), part('month') - 1, part('day'), 12);
  const end = localDateStr(date);
  const days = intent === 'week' ? 7 : 1;
  date.setDate(date.getDate() - days + 1);
  return { start: localDateStr(date), end, days, timezone };
}

export function weekdayFor(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}
