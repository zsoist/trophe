import type { WorkoutStage } from '@/lib/workout/workspace-state';

export const WORKOUT_ROUTES = {
  home: '/dashboard/workout',
  build: '/dashboard/workout/build',
  review: '/dashboard/workout/review',
  live: '/dashboard/workout/live',
  exercises: '/dashboard/workout/exercises',
} as const;

interface WorkoutRouter {
  push: (href: string) => void;
}

let workoutScrollResetPending = false;

function scrollWorkoutToTop(): void {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
  if (/jsdom/i.test(window.navigator.userAgent)) return;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

export function resetWorkoutScroll(): void {
  workoutScrollResetPending = true;
  scrollWorkoutToTop();
}

export function applyPendingWorkoutScrollReset(): (() => void) | undefined {
  if (!workoutScrollResetPending) return undefined;
  workoutScrollResetPending = false;
  scrollWorkoutToTop();
  if (typeof window === 'undefined' || /jsdom/i.test(window.navigator.userAgent)) return undefined;
  let finalFrame = 0;
  const firstFrame = window.requestAnimationFrame(() => {
    scrollWorkoutToTop();
    finalFrame = window.requestAnimationFrame(scrollWorkoutToTop);
  });
  return () => {
    window.cancelAnimationFrame(firstFrame);
    if (finalFrame) window.cancelAnimationFrame(finalFrame);
  };
}

export function pushWorkoutRoute(router: WorkoutRouter, href: string): void {
  resetWorkoutScroll();
  router.push(href);
}

export function workoutRouteForStage(stage: WorkoutStage): string {
  switch (stage) {
    case 'draft':
      return WORKOUT_ROUTES.build;
    case 'review':
      return WORKOUT_ROUTES.review;
    case 'live':
    case 'paused':
    case 'finishing':
    case 'completed':
      return WORKOUT_ROUTES.live;
    case 'home':
      return WORKOUT_ROUTES.home;
  }
}

export interface WorkoutRouteContext {
  replaceExerciseId?: string;
  returnRoute?: 'build' | 'review';
}

export function workoutBackRoute(pathname: string, stage?: WorkoutStage, context: WorkoutRouteContext = {}): string {
  const returnPath = context.returnRoute === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build;
  if (pathname.startsWith(`${WORKOUT_ROUTES.exercises}/`)) {
    if (context.replaceExerciseId) return `${WORKOUT_ROUTES.exercises}?replace=${encodeURIComponent(context.replaceExerciseId)}&return=${context.returnRoute === 'review' ? 'review' : 'build'}`;
    return context.returnRoute ? returnPath : WORKOUT_ROUTES.exercises;
  }
  if (pathname === WORKOUT_ROUTES.exercises) return context.returnRoute ? returnPath : stage === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build;
  if (pathname === WORKOUT_ROUTES.review) return WORKOUT_ROUTES.build;
  return WORKOUT_ROUTES.home;
}
