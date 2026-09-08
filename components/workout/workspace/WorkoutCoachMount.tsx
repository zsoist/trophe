'use client';

import { lazy, Suspense } from 'react';

const WorkoutCoachEntry = lazy(() => import('./WorkoutCoachEntry').then(module => ({ default: module.WorkoutCoachEntry })));

/** Keeps the disabled Workout coach out of every route's initial bundle. */
export function WorkoutCoachMount() {
  if (process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED !== '1') return null;
  return <Suspense fallback={null}><WorkoutCoachEntry /></Suspense>;
}
