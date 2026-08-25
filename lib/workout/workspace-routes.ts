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
      return WORKOUT_ROUTES.live;
    case 'home':
    case 'completed':
      return WORKOUT_ROUTES.home;
  }
}
