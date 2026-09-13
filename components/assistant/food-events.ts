export const COACH_FOOD_SELECT = 'trophe:coach-food-select';
export const COACH_FOOD_REFRESH = 'trophe:coach-food-refresh';
/**
 * Completion signal for an identity-bound canonical Food refresh. A producer that actually
 * re-reads the authorized Food log (never a bare re-render) emits this once its read settles,
 * carrying the same `requestId` it received on `COACH_FOOD_REFRESH`. Hosts use it as the
 * authoritative "the canonical Food view is current" seam instead of trusting the request event.
 */
export const COACH_FOOD_REFRESH_DONE = 'trophe:coach-food-refresh-done';
export interface CoachFoodSelection { actorId: string; entryId: string }
export function readFoodSelection(event: Event): CoachFoodSelection | null {
  const value = (event as CustomEvent<unknown>).detail;
  if (!value || typeof value !== 'object') return null;
  const { actorId, entryId } = value as CoachFoodSelection;
  return [actorId, entryId].every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)) ? { actorId, entryId } : null;
}
export interface CoachFoodRefreshRequest extends CoachFoodSelection { requestId: string }

/**
 * Request events that at least one mounted canonical Food consumer has actually read. A host
 * dispatches its `COACH_FOOD_REFRESH` request synchronously and can then tell whether a real
 * mounted reader (a route that re-reads and renders the canonical log) observed it, versus no
 * consumer being mounted at all. Dispatch is synchronous, so this is settled by the time the
 * request dispatch returns. It is NOT a completion signal — completion still requires the reader's
 * own `COACH_FOOD_REFRESH_DONE`.
 */
const observedRefreshRequests = new WeakSet<Event>();
/** True when a mounted canonical reader consumed this exact request event (see above). */
export function wasFoodRefreshRequestObserved(event: Event): boolean {
  return observedRefreshRequests.has(event);
}

/** Read the optional refresh request id from a refresh event. Absent for plain refresh hints. */
export function readFoodRefreshRequest(event: Event): CoachFoodRefreshRequest | null {
  const value = (event as CustomEvent<unknown>).detail;
  if (!value || typeof value !== 'object') return null;
  const { actorId, entryId, requestId } = value as Partial<CoachFoodRefreshRequest>;
  if (typeof actorId !== 'string' || !actorId || actorId.length > 128) return null;
  if (typeof entryId !== 'string' || !/^[a-f0-9-]{36}$/.test(entryId)) return null;
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId)) return null;
  // A well-formed request id is only ever produced by a host that will gate on completion; a
  // mounted consumer reading it records that a canonical reader is present.
  observedRefreshRequests.add(event);
  return { actorId, entryId, requestId };
}
export interface CoachFoodRefreshDone extends CoachFoodRefreshRequest { ok: boolean }
/** Read a refresh completion signal. Returns null for malformed/foreign signals. */
export function readFoodRefreshDone(event: Event): CoachFoodRefreshDone | null {
  const request = readFoodRefreshRequest(event);
  const { ok } = ((event as CustomEvent<unknown>).detail ?? {}) as { ok?: unknown };
  return request && typeof ok === 'boolean' ? { ...request, ok } : null;
}
