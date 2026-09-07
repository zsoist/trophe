'use client';

import { createContext, lazy, Suspense, useContext } from 'react';
import type { CoachRequest, CoachResponse } from '@/agents/coach-assistant/contracts';

export type CoachTransport = (request: CoachRequest, signal: AbortSignal) => Promise<CoachResponse>;
// Only the private review composition injects an example transport. Never a fallback for API errors.
export const WorkoutCoachExample = createContext<CoachTransport | null>(null);
const CoachSurface = lazy(() => import('./WorkoutCoachSurface'));

export function WorkoutCoachEntry() {
  const example = useContext(WorkoutCoachExample);
  if (!example && process.env.NEXT_PUBLIC_COACH_ASSISTANT_ENABLED !== '1') return null;
  return <Suspense fallback={null}><CoachSurface example={example} /></Suspense>;
}
