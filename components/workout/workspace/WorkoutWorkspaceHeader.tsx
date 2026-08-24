'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Dumbbell } from 'lucide-react';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';
import type { WorkoutStage } from '@/lib/workout/workspace-state';

const titles: Record<string, string> = {
  [WORKOUT_ROUTES.home]: 'Workout Home',
  [WORKOUT_ROUTES.build]: 'Build Workout',
  [WORKOUT_ROUTES.review]: 'Review Workout',
  [WORKOUT_ROUTES.live]: 'Live Workout',
  [WORKOUT_ROUTES.exercises]: 'Exercises',
};

function statusForStage(stage: WorkoutStage): 'Draft' | 'Live' | 'Paused' {
  if (stage === 'paused') return 'Paused';
  if (stage === 'live' || stage === 'finishing' || stage === 'completed') return 'Live';
  return 'Draft';
}

function WorkoutWorkspaceHeaderContent({ stage }: { stage: WorkoutStage }) {
  const pathname = usePathname();
  const title = titles[pathname] ?? 'Workout';
  const status = statusForStage(stage);

  return (
    <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
      <Link href={WORKOUT_ROUTES.home} aria-label="Back to Workout Home" className="inline-flex min-h-11 items-center gap-1">
        <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        <span>Back</span>
      </Link>
      <Dumbbell size={18} strokeWidth={2} aria-hidden="true" />
      <h1 className="text-base font-semibold">{title}</h1>
      <Link href={WORKOUT_ROUTES.home} className="ml-auto text-sm font-medium">Workout Home</Link>
      <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-1 text-xs font-semibold" aria-label={`Workout status: ${status}`}>{status}</span>
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
