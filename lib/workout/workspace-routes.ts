import type { WorkoutStage } from '@/lib/workout/workspace-state';

export const WORKOUT_ROUTES = {
  home: '/dashboard/workout',
  build: '/dashboard/workout/build',
  review: '/dashboard/workout/review',
  live: '/dashboard/workout/live',
  exercises: '/dashboard/workout/exercises',
} as const;

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
