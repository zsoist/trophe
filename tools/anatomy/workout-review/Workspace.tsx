'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppHeader } from '../../../components/shared/AppHeader';
import { ClientShell } from '../../../components/shared/ClientShell';
import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '../../../components/workout/workspace/WorkoutWorkspaceProvider';
import { WorkoutWorkspaceHeader } from '../../../components/workout/workspace/WorkoutWorkspaceHeader';
import { WorkoutRouteTransition } from '../../../components/workout/workspace/WorkoutRouteTransition';
import { ConfirmSheet } from '../../../components/ui/ConfirmSheet';
import { WorkoutHome } from '../../../components/workout/workspace/WorkoutHome';
import { WorkoutCoachEntry } from '../../../components/workout/coach/WorkoutCoachEntry';
import { privateCoachTransport } from './coach';
import { WorkoutBuilder, type PlanSaveState } from '../../../components/workout/workspace/WorkoutBuilder';
import { WorkoutReview } from '../../../components/workout/workspace/WorkoutReview';
import { ExerciseBrowser } from '../../../components/workout/workspace/ExerciseBrowser';
import { RoutedExerciseDetail } from '../../../components/workout/workspace/RoutedExerciseDetail';
import { LiveWorkout } from '../../../components/workout/workspace/LiveWorkout';
import { RetrospectiveWorkoutLogger } from '../../../components/workout/workspace/RetrospectiveWorkoutLogger';
import WorkoutHistoryPage from '../../../app/dashboard/workout/history/page';
import WorkoutAnalyticsSurface from '../../../components/workout/analytics/WorkoutAnalyticsSurface';
import type { RenderObservation } from '../../../components/anatomy/AtlasCanvas';
import AnatomyExplorer from '../../../components/anatomy/AnatomyExplorer';
import { WorkoutAnatomySource } from '../../../components/anatomy/WorkoutAnatomySource';
import type { AuthoredSupplement } from '../../../lib/anatomy/authored';
import type { WorkoutDraft } from '../../../lib/workout/workspace-state';
import { atlasWorkoutContext } from '../../../lib/anatomy/workout-navigation';
import { workoutRouteForStage } from '../../../lib/workout/workspace-routes';
import { localToday } from '../../../lib/utils/dates';
import { useCoachI18n as useI18n } from '../../../components/workout/coach/useCoachI18n';
import { navigate, usePathname, useSearchParams } from './navigation';
import { REVIEW_USER, reviewData, reviewExercises, reviewTemplate, reviewWorkspaceStorage, subscribeReview, updateReview } from './store';

type PreviewProps = { manifestUrl: string; authoredSupplement?: AuthoredSupplement; onRender?: (value: RenderObservation) => void };
function ReviewRoutes({ manifestUrl, authoredSupplement, onRender }: PreviewProps) {
  const path = usePathname();
  const params = useSearchParams();
  const { t } = useI18n();
  const data = useSyncExternalStore(subscribeReview, reviewData, reviewData);
  const workspace = useWorkoutWorkspace();
  useEffect(() => {
    if (!workspace.ready || path !== '/dashboard/workout/live') return;
    const stage = workspace.state.stage;
    if (stage !== 'live' && stage !== 'paused' && stage !== 'finishing' && stage !== 'completed') navigate(workoutRouteForStage(stage));
  }, [path, workspace.ready, workspace.state.stage]);
  const [saveState, setSaveState] = useState<PlanSaveState>('idle');
  const savedDraft = useRef<WorkoutDraft | null>(null);
  useEffect(() => {
    if (saveState === 'success' && savedDraft.current !== workspace.state.draft) {
      savedDraft.current = null;
      setSaveState('idle');
    }
  }, [saveState, workspace.state.draft]);
  const [retrospective, setRetrospective] = useState<WorkoutDraft | null>(null);
  const repeated = useRef<string | null>(null);
  const [repeatChoice, setRepeatChoice] = useState<{ create: () => void; replace: () => void } | null>(null);
  const exercises = useMemo(() => [...reviewExercises, ...data.customExercises], [data.customExercises]);
  const repeat = params.get('repeat');
  useEffect(() => {
    if (!repeat) { repeated.current = null; return; }
    if (repeated.current === repeat || !workspace.ready) return;
    const record = data.sessions.find(item => item.id === repeat);
    if (!record) return;
    repeated.current = repeat;
    let choice: { create: () => void; replace: () => void };
    if (record.workout_kind === 'cardio' && record.cardio_activity && record.duration_minutes) {
      const input = { templateKey: `repeat:${record.id}`, name: record.name ?? t('workout.cardio'), activity: record.cardio_activity, durationMinutes: record.duration_minutes, distanceKm: record.cardio_distance_km ?? null, effort: record.cardio_effort ?? null };
      choice = { create: () => workspace.createCardioDraftFromHistory(input), replace: () => workspace.replaceCardioDraftFromHistory(input) };
    } else {
      const sets = data.sets.filter(set => set.session_id === repeat && !set.is_warmup);
      const ids = [...new Set(sets.map(set => set.exercise_id))];
      const template = { templateKey: `repeat:${record.id}`, name: record.name ?? t('workout.strength'), exercises: ids.flatMap(id => {
        const exercise = exercises.find(item => item.id === id); if (!exercise) return [];
        const rows = sets.filter(set => set.exercise_id === id);
        const reps = rows.flatMap(set => set.reps && set.reps > 0 ? [set.reps] : []);
        const min = Math.min(...reps), max = Math.max(...reps);
        return [{ exerciseId: id, exerciseName: exercise.name, muscleGroup: exercise.muscle_group, targetSets: rows.length, targetReps: reps.length ? min === max ? String(min) : `${min}-${max}` : '8-12' }];
      }) };
      choice = { create: () => workspace.createDraftFromTemplate(template), replace: () => workspace.replaceDraftFromTemplate(template) };
    }
    if ((workspace.state.stage === 'draft' || workspace.state.stage === 'review') && !workspace.state.startRequest && !workspace.state.retrospectiveRequest) setRepeatChoice(choice);
    else if ((workspace.state.stage === 'home' || workspace.state.stage === 'completed') && !workspace.state.startRequest && !workspace.state.retrospectiveRequest) { choice.create(); navigate('/dashboard/workout/build'); }
  }, [repeat, workspace, data, exercises, t]);
  const savePlan = (draft: WorkoutDraft) => {
    if (draft.kind !== 'strength') return;
    const routine = { templateKey: draft.templateKey ?? `review:${crypto.randomUUID()}`, name: draft.name, exercises: draft.exercises.map(({ exerciseId, exerciseName, muscleGroup, targetSets, targetReps }) => ({ exerciseId, exerciseName, muscleGroup, targetSets, targetReps })), muscleSummary: [...new Set(draft.exercises.flatMap(item => { const exercise = exercises.find(e => e.id === item.exerciseId); return exercise ? [exercise.muscle_group] : []; }))] };
    updateReview(current => ({ ...current, routines: [...current.routines.filter(item => item.templateKey !== routine.templateKey), routine] }));
    savedDraft.current = draft;
    setSaveState('success');
  };
  if (!workspace.ready) return <main className="mx-auto max-w-2xl p-4" role="status">{t('workout.loading_workspace')}</main>;
  const template = reviewTemplate(t('workout.strength'), ['Bench Press', 'Squat', 'Lat Pulldown']);
  const todayIds = new Set(data.sessions.filter(session => session.session_date === localToday()).map(session => session.id));
  const workedExerciseIds = [...new Set(data.sets.filter(set => todayIds.has(set.session_id) && !set.is_warmup && (set.reps ?? 0) > 0).map(set => set.exercise_id))];
  const returnRoute = params.get('return') === 'review' ? 'review' : params.get('return') === 'build' ? 'build' : undefined;
  let content;
  if ((path === '/dashboard/anatomy' || path === '/dashboard/workout/atlas')) content = <AnatomyExplorer workout exerciseLibraryContext={atlasWorkoutContext(params)} manifestUrl={manifestUrl} authoredSupplement={authoredSupplement} initialMuscle={params.get('muscle') ?? undefined} initialGroup={params.get('group') ?? undefined} onRender={onRender} />;
  else if (path === '/dashboard/workout/build') content = <WorkoutBuilder exercises={exercises} onSavePlan={savePlan} saveState={saveState} />;
  else if (path === '/dashboard/workout/review') content = retrospective ? <RetrospectiveWorkoutLogger userId={REVIEW_USER} draft={retrospective} exercises={exercises} onCancel={() => setRetrospective(null)} onSaveRequest={async input => { const ok = await workspace.saveRetrospective(input); if (ok) { setRetrospective(null); navigate('/dashboard/workout/live'); } return ok; }} /> : <WorkoutReview exercises={exercises} onSavePlan={savePlan} saveState={saveState} onLogCompleted={setRetrospective} />;
  else if (path === '/dashboard/workout/exercises') content = <ExerciseBrowser initialExercises={exercises} initialRecentIds={workedExerciseIds} atlasGroup={params.get('atlas')} replaceExerciseId={params.get('replace') ?? undefined} returnRoute={returnRoute} />;
  else if (path.startsWith('/dashboard/workout/exercises/')) {
    const exercise = exercises.find(item => item.id === decodeURIComponent(path.split('/').at(-1) ?? ''));
    content = exercise ? <RoutedExerciseDetail exercise={exercise} userId={REVIEW_USER} replaceExerciseId={params.get('replace') ?? undefined} returnRoute={returnRoute} /> : <p className="p-4">{t('anatomy.review_unavailable')}</p>;
  } else if (path === '/dashboard/workout/live') content = <LiveWorkout exercises={exercises} userId={REVIEW_USER} />;
  else if (path === '/dashboard/workout/history') content = <WorkoutHistoryPage />;
  else if (path === '/dashboard/workout/stats') content = <WorkoutAnalyticsSurface />;
  else if (path !== '/dashboard/workout') content = <main className="mx-auto max-w-2xl space-y-4 p-4"><p>{t('anatomy.review_scope')}</p><button type="button" className="btn-gold min-h-11 rounded-xl px-4" onClick={() => navigate('/dashboard/workout')}>{t('workout.back_home')}</button></main>;
  else content = <WorkoutHome coachPreview={<WorkoutCoachEntry example={privateCoachTransport(reviewData, () => workspace.state.draft, t, template.exercises.length)} />} exercises={exercises} program={data.scenario === 'empty' ? null : { programName: t('workout.strength'), todayTemplate: template, alsoToday: [], nextWeekday: (new Date().getDay() + 2) % 7, nextTemplateName: t('workout.strength') }} recents={data.sessions.filter(session => session.completed_at).slice(0, 3)} workedExerciseIds={workedExerciseIds} routines={data.routines} />;
  return <div className="workout-workspace"><WorkoutWorkspaceHeader /><WorkoutRouteTransition>{content}</WorkoutRouteTransition><ConfirmSheet open={Boolean(repeatChoice)} title={t('workout.repeat_replace_title')} message={t('workout.repeat_replace_message')} confirmLabel={t('workout.repeat_replace_confirm')} cancelLabel={t('workout.repeat_replace_cancel')} onCancel={() => { setRepeatChoice(null); navigate('/dashboard/workout'); }} onConfirm={() => { repeatChoice?.replace(); setRepeatChoice(null); navigate('/dashboard/workout/build'); }} /></div>;
}
export function PrivateWorkoutWorkspace({ manifestUrl, authoredSupplement, onRender }: PreviewProps) {
  const source = useMemo(() => ({ manifestUrl, authoredSupplement }), [manifestUrl, authoredSupplement]);
  return <WorkoutAnatomySource.Provider value={source}><WorkoutWorkspaceProvider userId={REVIEW_USER} storage={reviewWorkspaceStorage}><AppHeader title="Trophē" eyebrow="Client" /><ClientShell><div id="main-content" tabIndex={-1} className="outline-none"><ReviewRoutes manifestUrl={manifestUrl} authoredSupplement={authoredSupplement} onRender={onRender} /></div></ClientShell></WorkoutWorkspaceProvider></WorkoutAnatomySource.Provider>;
}
