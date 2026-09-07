/** Fail-closed local data facade for the private export. No SDK or network calls. */
import type { supabase as RuntimeClient } from '../../../lib/supabase';
import type { Exercise } from '../../../lib/types';
import { REVIEW_USER, reviewData, reviewExercises, updateReview } from './store';
import { addExampleFoods } from './food-store';
type Row = Record<string, unknown>;
class ReviewQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ key: string; ascending: boolean }> = [];
  private start = 0;
  private end = Infinity;
  private one = false;
  private inserted: Row | Row[] | null = null;
  constructor(private table: string) {}
  select(_columns?: string) { void _columns; return this; }
  eq(key: string, value: unknown) { this.filters.push(row => (key === 'workout_sessions.user_id' ? REVIEW_USER : row[key]) === value); return this; }
  in(key: string, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this; }
  not(key: string, _op: string, value: unknown) { this.filters.push(row => row[key] !== value); return this; }
  order(key: string, options?: { ascending?: boolean }) { this.orders.push({ key, ascending: options?.ascending !== false }); return this; }
  limit(count: number) { this.end = count; return this; }
  range(from: number, to: number) { this.start = from; this.end = to + 1; return this; }
  abortSignal(_signal: AbortSignal) { void _signal; return this; }
  maybeSingle() { this.one = true; return this; }
  insert(row: Row | Row[]) { if (this.table === 'exercises' || this.table === 'food_log') this.inserted = row; else throw Error('Private preview write not supported'); return this; }
  private run() {
    if (this.inserted) {
      if (this.table === 'food_log') {
        const inserted = addExampleFoods(Array.isArray(this.inserted) ? this.inserted : [this.inserted]);
        this.inserted = null; return { data: this.one ? inserted[0] : inserted, error: null };
      }
      const exercise = { name_es: null, name_el: null, secondary_muscles: [], equipment: null, is_compound: false, is_template: false, ...this.inserted, id: crypto.randomUUID(), created_at: new Date().toISOString() } as unknown as Exercise;
      updateReview(data => ({ ...data, customExercises: [...data.customExercises, exercise] }));
      this.inserted = null; return { data: this.one ? exercise : [exercise], error: null };
    }
    const data = reviewData();
    let rows: Row[];
    if (this.table === 'workout_sessions') rows = data.sessions as unknown as Row[];
    else if (this.table === 'exercises') rows = [...reviewExercises, ...data.customExercises] as unknown as Row[];
    else if (this.table === 'workout_sets') rows = data.sets.map(set => ({ ...set, exercise: [...reviewExercises, ...data.customExercises].find(e => e.id === set.exercise_id), session: data.sessions.find(s => s.id === set.session_id), workout_sessions: data.sessions.find(s => s.id === set.session_id) }));
    else return { data: null, error: { message: `Unsupported private preview table: ${this.table}` } };
    rows = rows.filter(row => this.filters.every(filter => filter(row))).sort((a, b) => {
      for (const { key, ascending } of this.orders) { const result = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (result) return ascending ? result : -result; } return 0;
    }).slice(this.start, this.end);
    return { data: this.one ? rows[0] ?? null : rows, error: null };
  }
  then<TResult1 = unknown, TResult2 = never>(resolve?: ((value: ReturnType<ReviewQuery['run']>) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(this.run()).then(resolve, reject); }
}
export const supabase = { auth: { getUser: async () => ({ data: { user: { id: REVIEW_USER } }, error: null }) }, from: (table: string) => new ReviewQuery(table), rpc: async () => ({ data: null, error: { message: 'RPC unavailable in private preview' } }) } as unknown as typeof RuntimeClient;
