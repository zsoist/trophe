'use client';
import { lazy, Suspense } from 'react';
const AccountCoach = /* @__PURE__ */ lazy(() => import('./AccountCoach'));
export function GlobalCoachEntry({ professional = false }: { professional?: boolean } = {}) {
  if (process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED !== '1') return null;
  return <Suspense fallback={null}><AccountCoach professional={professional} /></Suspense>;
}
