'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WorkoutHome, type WorkoutHomeProgram, type WorkoutHomeTemplate } from '@/components/workout/workspace/WorkoutHome';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { supabase } from '@/lib/supabase';
import { trpc } from '@/lib/trpc/client';
import type { Exercise, TemplateExercise, WorkoutSession } from '@/lib/types';
import { localToday } from '@/lib/utils/dates';
import { normalizeUuid } from '@/lib/workout/uuid';
import { WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';

interface StoredRoutine {
  id: string;
  name: string;
  exercises: TemplateExercise[];
}

interface ResolvedExerciseMetadata {
  id: string;
  name: string;
  muscleGroup: Exercise['muscle_group'];
}

interface RepeatedSetRow {
  exercise_id: string;
  reps: number | null;
  is_warmup: boolean;
  exercise: { id: string; name: string; muscle_group: Exercise['muscle_group'] } | Array<{ id: string; name: string; muscle_group: Exercise['muscle_group'] }> | null;
}

function repeatedExercises(rows: RepeatedSetRow[]) {
  const grouped = new Map<string, RepeatedSetRow[]>();
  for (const row of rows) {
    if (!row.exercise_id || row.is_warmup) continue;
    grouped.set(row.exercise_id, [...(grouped.get(row.exercise_id) ?? []), row]);
  }
  return [...grouped.entries()].map(([exerciseId, sets]) => {
    const reps = sets.map((set) => set.reps).filter((value): value is number => typeof value === 'number' && value > 0);
    const minReps = reps.length ? Math.min(...reps) : null;
    const maxReps = reps.length ? Math.max(...reps) : null;
    const resolvedExercise = sets.find((set) => set.exercise)?.exercise ?? null;
    const metadata = Array.isArray(resolvedExercise) ? resolvedExercise[0] ?? null : resolvedExercise;
    return {
      exerciseId,
      ...(metadata?.name ? { exerciseName: metadata.name } : {}),
      ...(metadata?.muscle_group ? { muscleGroup: metadata.muscle_group } : {}),
      targetSets: sets.length,
      targetReps: minReps === null || maxReps === null ? '8-12' : minReps === maxReps ? String(minReps) : `${minReps}-${maxReps}`,
    };
  });
}

export default function WorkoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createDraftFromTemplate } = useWorkoutWorkspace();
  const handledRepeat = useRef<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recents, setRecents] = useState<WorkoutSession[]>([]);
  const [storedRoutines, setStoredRoutines] = useState<StoredRoutine[]>([]);
  const programQuery = trpc.workouts.program.mine.useQuery(undefined, { staleTime: 60_000, retry: 1 });
  const repeatId = searchParams.get('repeat');

  useEffect(() => {
    let active = true;
    async function loadHomeData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);

      const [exerciseResult, recentResult, routineResult] = await Promise.all([
        supabase.from('exercises').select('*').order('muscle_group').order('name'),
        supabase.from('workout_sessions').select('*').eq('user_id', user.id).order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
        supabase.from('workout_templates').select('id, name, exercises').eq('created_by', user.id).order('created_at', { ascending: false }).limit(8),
      ]);
      if (!active) return;

      setLoadError(Boolean(exerciseResult.error || recentResult.error || routineResult.error));
      setExercises((exerciseResult.data as Exercise[] | null) ?? []);
      setRecents((recentResult.data as WorkoutSession[] | null) ?? []);
      setStoredRoutines(((routineResult.data as { id: string; name: string; exercises: unknown }[] | null) ?? []).map((routine) => ({
        id: routine.id,
        name: routine.name,
        exercises: ((routine.exercises as TemplateExercise[] | null) ?? []).filter((exercise) => exercise && typeof exercise.exercise_id === 'string'),
      })));
      setLoadingLibrary(false);
    }
    void loadHomeData();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const normalizedRepeatId = normalizeUuid(repeatId);
    if (!normalizedRepeatId || handledRepeat.current === normalizedRepeatId) return;
    handledRepeat.current = normalizedRepeatId;
    let active = true;

    async function loadRepeatedWorkout() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      const sessionResult = await supabase
        .from('workout_sessions')
        .select('id, name, template_id')
        .eq('id', normalizedRepeatId!)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      if (sessionResult.error || !sessionResult.data) {
        setLoadError(true);
        return;
      }
      const setsResult = await supabase
        .from('workout_sets')
        .select('exercise_id, set_number, reps, is_warmup, exercise:exercises(id, name, muscle_group)')
        .eq('session_id', sessionResult.data.id)
        .order('set_number');
      if (!active) return;
      if (setsResult.error) {
        setLoadError(true);
        return;
      }

      createDraftFromTemplate({
        templateKey: `repeat:${sessionResult.data.id}`,
        templateId: sessionResult.data.template_id,
        name: sessionResult.data.name ?? 'Workout',
        exercises: repeatedExercises((setsResult.data as unknown as RepeatedSetRow[] | null) ?? []),
      });
      router.push(WORKOUT_ROUTES.build);
    }

    void loadRepeatedWorkout();
    return () => { active = false; };
  }, [createDraftFromTemplate, repeatId, router]);

  const resolvedExerciseById = useMemo(() => {
    const resolved = new Map<string, ResolvedExerciseMetadata>();
    for (const exercise of exercises) {
      resolved.set(exercise.id, { id: exercise.id, name: exercise.name, muscleGroup: exercise.muscle_group });
    }
    for (const exercise of programQuery.data?.exercises ?? []) {
      resolved.set(exercise.id, { id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup as Exercise['muscle_group'] });
    }
    return resolved;
  }, [exercises, programQuery.data?.exercises]);

  const toTemplate = useCallback((template: { id: string; name: string; exercises?: unknown }): WorkoutHomeTemplate => {
    const stored = ((template.exercises as TemplateExercise[] | null) ?? []).filter((exercise) => exercise && typeof exercise.exercise_id === 'string');
    return {
      templateKey: `template:${template.id}`,
      templateId: template.id,
      name: template.name,
      exercises: stored.map((exercise) => {
        const metadata = resolvedExerciseById.get(exercise.exercise_id);
        return {
          exerciseId: exercise.exercise_id,
          ...(metadata?.name ? { exerciseName: metadata.name } : {}),
          ...(metadata?.muscleGroup ? { muscleGroup: metadata.muscleGroup } : {}),
          targetSets: exercise.target_sets || 3,
          targetReps: exercise.target_reps || '8-12',
        };
      }),
      muscleSummary: Array.from(new Set(stored.map((exercise) => resolvedExerciseById.get(exercise.exercise_id)?.muscleGroup).filter((muscle): muscle is Exercise['muscle_group'] => Boolean(muscle)))),
    };
  }, [resolvedExerciseById]);

  const todayWeekday = new Date(`${localToday()}T12:00:00`).getDay();
  const program = useMemo<WorkoutHomeProgram | null>(() => {
    const data = programQuery.data;
    if (!data) return null;
    const todayDays = data.days.filter((day) => day.weekday === todayWeekday).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    let nextDay: (typeof data.days)[number] | null = null;
    for (let distance = 1; distance <= 7 && !nextDay; distance += 1) {
      const weekday = (todayWeekday + distance) % 7;
      nextDay = data.days.filter((day) => day.weekday === weekday).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0] ?? null;
    }
    return {
      programName: data.program.name,
      todayTemplate: todayDays[0] ? toTemplate(todayDays[0].template) : null,
      alsoToday: todayDays.slice(1).map((day) => toTemplate(day.template)),
      nextWeekday: nextDay?.weekday ?? null,
      nextTemplateName: nextDay?.template.name ?? null,
    };
  }, [programQuery.data, todayWeekday, toTemplate]);

  const routines = useMemo(() => storedRoutines.map((routine) => toTemplate(routine)), [storedRoutines, toTemplate]);

  return (
    <WorkoutHome
      exercises={exercises}
      program={program}
      programLoading={programQuery.isLoading}
      programError={Boolean(programQuery.error || loadError)}
      recents={recents}
      routines={routines}
      disabled={!userId || loadingLibrary}
    />
  );
}
