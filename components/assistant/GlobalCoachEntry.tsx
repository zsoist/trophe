'use client';
import { lazy, Suspense } from 'react';
import type { CoachContextSlot } from './GlobalCoach';
const AccountCoach = /* @__PURE__ */ lazy(() => import('./AccountCoach'));
export function GlobalCoachEntry({ professional = false, contextSlot }: { professional?: boolean; contextSlot?: CoachContextSlot } = {}) {
  if (process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED !== '1') return null;
  return <Suspense fallback={null}><AccountCoach professional={professional} contextSlot={contextSlot} /></Suspense>;
}
