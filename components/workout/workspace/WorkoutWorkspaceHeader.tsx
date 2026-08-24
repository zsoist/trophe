'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Dumbbell } from 'lucide-react';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import { WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';
import type { WorkoutStage } from '@/lib/workout/workspace-state';

const titleKeys: Record<string, string> = {
  [WORKOUT_ROUTES.home]: 'workout.workspace_home_title',
  [WORKOUT_ROUTES.build]: 'workout.workspace_build_title',
  [WORKOUT_ROUTES.review]: 'workout.workspace_review_title',
  [WORKOUT_ROUTES.live]: 'workout.workspace_live_title',
  [WORKOUT_ROUTES.exercises]: 'workout.workspace_exercises_title',
};

function statusKeyForStage(stage: WorkoutStage): string {
  if (stage === 'paused') return 'workout.workspace_status_paused';
  if (stage === 'live' || stage === 'finishing' || stage === 'completed') return 'workout.workspace_status_live';
  return 'workout.workspace_status_draft';
}

function WorkoutWorkspaceHeaderContent({ stage }: { stage: WorkoutStage }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const titleKey = pathname.startsWith(`${WORKOUT_ROUTES.exercises}/`)
    ? 'workout.workspace_exercises_title'
    : titleKeys[pathname] ?? 'workout.title';
  const title = t(titleKey);
  const status = t(statusKeyForStage(stage));

  return (
    <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
      <Link href={WORKOUT_ROUTES.home} aria-label={t('workout.back_home')} className="inline-flex min-h-11 items-center gap-1">
        <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        <span>{t('workout.workspace_back')}</span>
      </Link>
      <Dumbbell size={18} strokeWidth={2} aria-hidden="true" />
      <h1 className="text-base font-semibold">{title}</h1>
      <Link href={WORKOUT_ROUTES.home} className="ml-auto text-sm font-medium">{t('workout.workspace_home_title')}</Link>
      <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-1 text-xs font-semibold" aria-label={t('workout.workspace_status_label', { status })}>{status}</span>
    </header>
  );
}

function ConnectedWorkoutWorkspaceHeader() {
  const { state } = useWorkoutWorkspace();
  return <WorkoutWorkspaceHeaderContent stage={state.stage} />;
}

export function WorkoutWorkspaceHeader({ stage }: { stage?: WorkoutStage }) {
  return stage === undefined
    ? <ConnectedWorkoutWorkspaceHeader />
    : <WorkoutWorkspaceHeaderContent stage={stage} />;
}
