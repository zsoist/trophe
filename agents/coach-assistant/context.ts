import { localDateStr } from '@/lib/utils/dates';
import type { CoachIntent, CoachWindow } from './contracts';

export interface Actor { id: string; role: string; organizationIds: string[] }
export interface Subject { id: string; coachId: string | null; organizationIds: string[]; timezone: string; language: string }
export interface AuthorizedContext { actorId: string; subjectId: string; organizationId: string; timezone: string; language: string }

/** Inputs are queried by the server. Request body and model never construct these. */
export function authorizeSubject(actor: Actor | null, subject: Subject | null): AuthorizedContext {
  if (!actor) throw new Error('unauthenticated');
  if (!subject) throw new Error('forbidden');
  const sharedOrg = actor.organizationIds.find(org => subject.organizationIds.includes(org));
  const own = actor.role === 'client' && actor.id === subject.id;
  const assigned = ['coach', 'admin', 'super_admin'].includes(actor.role) && subject.coachId === actor.id;
  if (!sharedOrg || (!own && !assigned)) throw new Error('forbidden');
  return { actorId: actor.id, subjectId: subject.id, organizationId: sharedOrg, timezone: subject.timezone, language: subject.language };
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
