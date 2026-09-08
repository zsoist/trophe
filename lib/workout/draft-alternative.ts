import type { MuscleGroup } from '@/lib/types';
import type { CoachConversationResponse, CoachDraftUpdateIntent, CoachSurface } from '@/agents/coach-assistant/contracts';
import { hashWorkoutWorkspace } from './workspace-hash';
import type { StrengthDraft, WorkoutDraft, WorkoutWorkspaceState } from './workspace-state';

export interface DraftAlternativeTarget { durationMinutes: number; equipment: string[] }
export interface DraftAlternativeExercise { id: string; name: string; muscle_group?: MuscleGroup | null; equipment?: string | null }

export function acceptedWorkoutDraftIntent(response: CoachConversationResponse, identity: string, conversationId: string, turnId: string, surface: CoachSurface, workspace: WorkoutWorkspaceState): CoachDraftUpdateIntent | null {
  const snapshot = response.snapshot;
  const intents = response.actionIntents ?? [];
  if (!response.ok || response.conversationId !== conversationId || response.turnId !== turnId || !snapshot || snapshot.access !== 'self'
    || snapshot.subjectId !== identity || snapshot.surface !== surface || !['workout', 'plan'].includes(surface)
    || !snapshot.screenIncluded || intents.length !== 1) return null;
  const intent = intents[0];
  const version = hashWorkoutWorkspace(workspace);
  if (intent.action !== 'draft.update' || intent.source !== 'provider_tool' || intent.reviewRequired !== true
    || intent.subjectId !== identity || intent.scopeKey !== snapshot.scopeKey || intent.surface !== surface
    || intent.resource.kind !== 'draft' || intent.resource.id !== identity || intent.resource.version !== version
    || !Number.isInteger(intent.target.durationMinutes) || intent.target.durationMinutes < 5 || intent.target.durationMinutes > 180
    || intent.target.equipment.length !== 1 || intent.target.equipment[0] !== 'dumbbells') return null;
  return intent;
}

function estimateSeconds(exercises: StrengthDraft['exercises']): number {
  return Math.max(0, exercises.length - 1) * 60 + exercises.reduce((total, exercise) => {
    const sets = Math.max(1, exercise.targetSets);
    return total + sets * 45 + Math.max(0, sets - 1) * (exercise.restSeconds ?? 90);
  }, 0);
}

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2 && !['barbell', 'dumbbell', 'press'].includes(word)));
}

function chooseReplacement(sourceName: string, group: MuscleGroup | null | undefined, catalogue: DraftAlternativeExercise[], used: Set<string>): DraftAlternativeExercise | null {
  const sourceWords = words(sourceName);
  const candidates = catalogue.filter(item => item.equipment?.toLowerCase() === 'dumbbell' && item.muscle_group === group && !used.has(item.id));
  return candidates.sort((a, b) => {
    const score = (item: DraftAlternativeExercise) => [...words(item.name)].filter(word => sourceWords.has(word)).length;
    return score(b) - score(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  })[0] ?? null;
}

/** Builds a deterministic copy for review. It never mutates or persists the source draft. */
export function buildWorkoutDraftAlternative(draft: WorkoutDraft, catalogue: DraftAlternativeExercise[], target: DraftAlternativeTarget, now: number): WorkoutDraft | null {
  if (draft.kind !== 'strength' || draft.exercises.length === 0) return null;
  const dumbbells = target.equipment.includes('dumbbells');
  const byId = new Map(catalogue.map(item => [item.id, item]));
  const used = new Set<string>();
  const exercises: StrengthDraft['exercises'] = [];
  for (const source of draft.exercises) {
    const current = byId.get(source.exerciseId);
    const group = source.muscleGroup ?? current?.muscle_group ?? null;
    const replacement = dumbbells
      ? current?.equipment?.toLowerCase() === 'dumbbell' ? current : chooseReplacement(source.exerciseName ?? current?.name ?? source.exerciseId, group, catalogue, used)
      : current ?? { id: source.exerciseId, name: source.exerciseName ?? source.exerciseId, muscle_group: group };
    if (!replacement) return null;
    used.add(replacement.id);
    exercises.push({ ...source, exerciseId: replacement.id, exerciseName: replacement.name, ...(replacement.muscle_group ? { muscleGroup: replacement.muscle_group } : {}), targetSets: Math.min(3, Math.max(1, source.targetSets)), restSeconds: 60 });
  }
  const limit = target.durationMinutes * 60;
  while (estimateSeconds(exercises) > limit && exercises.some(exercise => exercise.targetSets > 1)) {
    const exercise = [...exercises].reverse().find(item => item.targetSets > 1)!;
    exercise.targetSets -= 1;
  }
  while (estimateSeconds(exercises) > limit && exercises.length > 1) exercises.pop();
  if (estimateSeconds(exercises) > limit) return null;
  return {
    ...structuredClone(draft),
    name: `${draft.name} · ${target.durationMinutes} min${dumbbells ? ' · Dumbbells' : ''}`,
    updatedAt: now,
    exercises,
  };
}
