import { REVIEW_USER } from './store';
export type ExampleFood = { id: string; user_id: string; food_name: string; calories: number; protein_g: number; logged_date: string; [key: string]: unknown };
let rows: ExampleFood[] = [];
const listeners = new Set<() => void>();
export function exampleFoodRows() { return rows; }
export function addExampleFoods(values: Record<string, unknown>[]) {
  if (values.some(value => value.user_id !== REVIEW_USER)) throw new Error('Private food owner mismatch');
  const inserted = values.map(value => ({ ...value, id: crypto.randomUUID() }) as ExampleFood);
  rows = [...rows, ...inserted]; listeners.forEach(listener => listener()); return inserted;
}
export function subscribeFood(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
