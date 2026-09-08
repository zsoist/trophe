export const COACH_PROGRESS_REFRESH = 'trophe:coach-progress-refresh';
export function progressRefreshActor(event: Event): string | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return null;
  const actorId = (event.detail as { actorId?: unknown }).actorId;
  return typeof actorId === 'string' && /^[a-f0-9-]{36}$/.test(actorId) ? actorId : null;
}
