export const COACH_MESSAGE_REFRESH = 'trophe:coach-message-refresh';

export interface CoachMessageRefresh {
  coachId: string;
  clientId: string;
  messageId: string;
  strategy: 'refetch';
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A hint to refetch the existing authorized human chat. */
export function readMessageRefresh(event: Event): CoachMessageRefresh | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return null;
  const value = event.detail as Partial<CoachMessageRefresh>;
  if (![value.coachId, value.clientId, value.messageId].every(item => typeof item === 'string' && uuid.test(item))) return null;
  if (value.strategy !== 'refetch') return null;
  return value as CoachMessageRefresh;
}
