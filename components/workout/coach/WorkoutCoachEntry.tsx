'use client';

import { lazy, Suspense } from 'react';
import type { CoachRequest, CoachResponse } from '@/agents/coach-assistant/contracts';

export type CoachTransport = (request: CoachRequest, signal: AbortSignal) => Promise<CoachResponse>;
const CoachSurface = /* @__PURE__ */ lazy(() => import('./WorkoutCoachSurface'));

export function WorkoutCoachEntry({ example = null }: { example?: CoachTransport | null }) {
  if (!example && process.env.NEXT_PUBLIC_COACH_ASSISTANT_ENABLED !== '1') return null;
  return <Suspense fallback={null}><CoachSurface example={example} /></Suspense>;
}
