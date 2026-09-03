'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLayoutEffect } from 'react';
import { ChevronLeft, Dumbbell, House } from 'lucide-react';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import { useWeightUnit } from '@/lib/workout/units';
import { applyPendingWorkoutScrollReset, resetWorkoutScroll, workoutBackRoute, WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';
import type { WorkoutStage } from '@/lib/workout/workspace-state';

const titleKeys: Record<string, string> = {
  [WORKOUT_ROUTES.home]: 'workout.workspace_home_title',
  [WORKOUT_ROUTES.build]: 'workout.workspace_build_title',
  [WORKOUT_ROUTES.review]: 'workout.workspace_review_title',
  [WORKOUT_ROUTES.live]: 'workout.workspace_live_title',
  [WORKOUT_ROUTES.exercises]: 'workout.workspace_exercises_title',
  '/dashboard/workout/history': 'workout.history',
  '/dashboard/workout/stats': 'workout.stats',
  '/dashboard/workout/form-check': 'workout.form_check',
};

function statusKeyForStage(stage: WorkoutStage): string | null {
  if (stage === 'home') return null;
  if (stage === 'paused') return 'workout.workspace_status_paused';
  if (stage === 'completed') return 'workout.workspace_status_completed';
  if (stage === 'live' || stage === 'finishing') return 'workout.workspace_status_live';
  return 'workout.workspace_status_draft';
}

function WorkoutWorkspaceHeaderContent({ stage, onBack, backDisabled = false }: { stage: WorkoutStage; onBack?: () => void; backDisabled?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [unit, setUnit] = useWeightUnit();
  const nextUnit = unit === 'kg' ? 'lb' : 'kg';
  const titleKey = pathname.startsWith(`${WORKOUT_ROUTES.exercises}/`)
    ? 'workout.workspace_exercises_title'
    : titleKeys[pathname] ?? 'workout.title';
  const title = t(titleKey);
  const isHome = pathname === WORKOUT_ROUTES.home;
  const backHref = workoutBackRoute(pathname, stage, {
    replaceExerciseId: searchParams.get('replace')?.trim() || undefined,
    returnRoute: searchParams.get('return') === 'review' ? 'review' : searchParams.get('return') === 'build' ? 'build' : undefined,
  });
  const statusKey = isHome ? null : statusKeyForStage(stage);
  const status = statusKey ? t(statusKey) : null;

  useLayoutEffect(() => {
    return applyPendingWorkoutScrollReset();
  }, [pathname]);

  return (
    <header className="flex min-h-16 items-center gap-2 border-b border-[var(--workout-rail)] px-3 py-2 min-[375px]:gap-3 min-[375px]:px-4">
      {!isHome && (
        backDisabled ? (
          <button type="button" disabled aria-label={t('workout.edit_locked')} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl text-sm font-medium opacity-40 min-[375px]:px-2">
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
            <span className="hidden min-[430px]:inline">{t('workout.workspace_back')}</span>
          </button>
        ) : (
          <Link href={backHref} onClick={() => { onBack?.(); resetWorkoutScroll(); }} aria-label={t('workout.workspace_back')} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-[375px]:px-2">
            <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
            <span className="hidden min-[430px]:inline">{t('workout.workspace_back')}</span>
          </Link>
        )
      )}
      <Dumbbell className="hidden shrink-0 min-[430px]:block" size={18} strokeWidth={2} aria-hidden="true" />
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold min-[375px]:text-base">{title}</h1>
      {isHome && (
        <button
          type="button"
          onClick={() => setUnit(nextUnit)}
          aria-label={t('workout.weight_unit_label', { unit })}
          title={t('workout.weight_unit_switch', { unit: nextUnit })}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--workout-rail)] bg-[var(--surface-subtle)] px-2 font-mono text-xs font-semibold lowercase tabular-nums text-[var(--content-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {unit}
        </button>
      )}
      {!isHome && (
        <Link href={WORKOUT_ROUTES.home} onClick={resetWorkoutScroll} aria-label={t('workout.workspace_home_title')} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl text-sm font-medium hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-[375px]:px-2">
          <House size={17} strokeWidth={2} aria-hidden="true" />
          <span className="hidden min-[430px]:inline">{t('workout.workspace_home_title')}</span>
        </Link>
      )}
      {status ? <span className="shrink-0 rounded-full border border-[var(--workout-rail)] bg-[var(--surface-subtle)] px-2 py-1 text-xs font-semibold" aria-label={t('workout.workspace_status_label', { status })}>{status}</span> : null}
    </header>
  );
}

function ConnectedWorkoutWorkspaceHeader() {
  const { state, returnToDraft } = useWorkoutWorkspace();
  const pathname = usePathname();
  return <WorkoutWorkspaceHeaderContent stage={state.stage} onBack={pathname === WORKOUT_ROUTES.review ? returnToDraft : undefined} backDisabled={pathname === WORKOUT_ROUTES.review && Boolean(state.startRequest || state.retrospectiveRequest)} />;
}

export function WorkoutWorkspaceHeader({ stage }: { stage?: WorkoutStage }) {
  return stage === undefined
    ? <ConnectedWorkoutWorkspaceHeader />
    : <WorkoutWorkspaceHeaderContent stage={stage} />;
}
