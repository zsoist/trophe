'use client';
import { lazy, Suspense } from 'react';
import type { CoachContextSlot } from './GlobalCoach';
import type { CoachContextHint } from '@/agents/coach-assistant/contracts';
const AccountCoach = /* @__PURE__ */ lazy(() => import('./AccountCoach'));
export function GlobalCoachEntry({ professional = false, contextSlot, workspaceHint }: { professional?: boolean; contextSlot?: CoachContextSlot; workspaceHint?: CoachContextHint['workspace'] } = {}) {
  if (process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED !== '1') return null;
  return <Suspense fallback={null}><AccountCoach professional={professional} contextSlot={contextSlot} workspaceHint={workspaceHint} /></Suspense>;
}
