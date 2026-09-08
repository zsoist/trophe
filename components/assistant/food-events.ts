export const COACH_FOOD_SELECT = 'trophe:coach-food-select';
export const COACH_FOOD_REFRESH = 'trophe:coach-food-refresh';
export interface CoachFoodSelection { actorId: string; entryId: string }
export function readFoodSelection(event: Event): CoachFoodSelection | null {
  const value = (event as CustomEvent<unknown>).detail;
  if (!value || typeof value !== 'object') return null;
  const { actorId, entryId } = value as CoachFoodSelection;
  return [actorId, entryId].every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)) ? { actorId, entryId } : null;
}
