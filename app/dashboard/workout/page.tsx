'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkoutHome, type WorkoutHomeProgram, type WorkoutHomeTemplate } from '@/components/workout/workspace/WorkoutHome';
import { supabase } from '@/lib/supabase';
import { trpc } from '@/lib/trpc/client';
import type { Exercise, TemplateExercise, WorkoutSession } from '@/lib/types';
import { localToday } from '@/lib/utils/dates';

interface StoredRoutine {
  id: string;
  name: string;
  exercises: TemplateExercise[];
}

export default function WorkoutPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recents, setRecents] = useState<WorkoutSession[]>([]);
  const [storedRoutines, setStoredRoutines] = useState<StoredRoutine[]>([]);
  const programQuery = trpc.workouts.program.mine.useQuery(undefined, { staleTime: 60_000, retry: 1 });

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

  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const toTemplate = useCallback((template: { id: string; name: string; exercises?: unknown }): WorkoutHomeTemplate => {
    const stored = ((template.exercises as TemplateExercise[] | null) ?? []).filter((exercise) => exercise && typeof exercise.exercise_id === 'string');
    return {
      templateId: template.id,
      name: template.name,
      exercises: stored.map((exercise) => ({ exerciseId: exercise.exercise_id, targetSets: exercise.target_sets || 3, targetReps: exercise.target_reps || '8-12' })),
      muscleSummary: Array.from(new Set(stored.map((exercise) => exerciseById.get(exercise.exercise_id)?.muscle_group).filter((muscle): muscle is Exercise['muscle_group'] => Boolean(muscle)))),
    };
  }, [exerciseById]);

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
