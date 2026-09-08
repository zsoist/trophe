import type { CoachAnatomyHint } from '@/agents/coach-assistant/selection-contracts';

/** Browser hints only. The server independently resolves every supplied ID. */
export type CoachScreenSelection = { path: string; label: string } & (
  | { anatomy: CoachAnatomyHint; entity?: never; actorId?: never }
  | { entity: { kind: 'exercise'; id: string }; actorId: string; anatomy?: never }
);
let current: CoachScreenSelection | null = null;
let owner: symbol | null = null;
const listeners = new Set<() => void>();
export const subscribeScreenSelection = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const screenSelectionSnapshot = () => current;
export const emptyScreenSelection = () => null;
export function publishScreenSelection(selection: CoachScreenSelection | null) {
  const token = Symbol(); owner = token;
  current = selection ? structuredClone(selection) : null;
  listeners.forEach(listener => listener());
  return () => {
    if (owner !== token) return;
    owner = null; current = null; listeners.forEach(listener => listener());
  };
}
export function acceptedScreenSelection(selection: CoachScreenSelection | null, path: string, actorId: string, subjectId = actorId) {
  if (!selection || selection.path !== path) return null;
  if (selection.entity && (selection.actorId !== actorId || subjectId !== actorId)) return null;
  return selection;
}
