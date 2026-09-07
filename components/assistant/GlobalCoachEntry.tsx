// ClientShell owns the client boundary. Keep this subtree behind its public
// flag and lazy import; nested entry directives register it on disabled routes.
import { lazy, Suspense } from 'react';
const AccountCoach = /* @__PURE__ */ lazy(() => import('./AccountCoach'));
export function GlobalCoachEntry() {
  if (process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED !== '1') return null;
  return <Suspense fallback={null}><AccountCoach /></Suspense>;
}
