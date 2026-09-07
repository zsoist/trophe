import type { AuthorizedContext } from './context';
import type { CoachWindow } from './contracts';

export interface PlanRow {
  id: string; userId: string; startsOn: string | null; status: string;
  days: Array<{ id: string; weekday: number; targetSets: number; templateId?: string; targetReps?: number | null }>;
}
export interface WorkoutRow {
  id: string; userId: string; date: string; completedAt: string | null;
  idempotencyKey: string | null; durationMinutes: number | null;
  templateId?: string | null;
  sets: Array<{ id: string; reps: number | null; weightKg: number | null; isWarmup: boolean }>;
}
export interface NutritionRow { id: string; userId: string; date: string; calories: number | null; proteinG: number | null }
export interface ExerciseRow { id: string; name: string; instructions: string[]; curated: boolean }
export interface Rows<T> { rows: T[]; truncated: boolean }
export interface ReadArgs { context: AuthorizedContext; window: CoachWindow; limit: number; signal: AbortSignal }
export interface PersonalContextRow {
  userId: string; preferences: unknown; preferencesVersion?:string; memoriesRead?:boolean;
  memories: Array<{id:string;userId:string;text:string;source:'user_input'|'coach'|'agent_inference'|'wearable';createdAt:string;scope:'user';version:string}>;
}
export interface CoachRepository {
  dataSource: 'synthetic' | 'authorized_records';
  authorize(actorId: string, subjectId: string, signal: AbortSignal): Promise<AuthorizedContext>;
  plan(args: ReadArgs): Promise<Rows<PlanRow>>;
  workouts(args: ReadArgs): Promise<Rows<WorkoutRow>>;
  nutrition(args: ReadArgs): Promise<Rows<NutritionRow>>;
  exercise(args: ReadArgs & { exerciseId: string }): Promise<Rows<ExerciseRow>>;
  personalContext?(args:ReadArgs):Promise<Rows<PersonalContextRow>>;
}
