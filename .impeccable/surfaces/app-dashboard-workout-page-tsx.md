---
version: 1
slug: "app-dashboard-workout-page-tsx"
primary_target: "app/dashboard/workout/page.tsx"
related_targets: ["app/dashboard/workout/exercises/page.tsx","app/dashboard/workout/build/page.tsx","app/dashboard/workout/review/page.tsx","app/dashboard/workout/live/page.tsx","app/dashboard/workout/history/page.tsx","app/dashboard/workout/stats/page.tsx"]
---

Scope: Complete client Workout surface inside the established Personal Best world. Operate mode, mobile-first PWA.

Audience and job: A coached client must understand today’s training, discover or customize exercises, review before starting, log sets quickly, inspect accurate technique, report pain, and see progress. A coach must retain plan authority and receive trustworthy evidence.

Primary action: Contextual and singular—Review plan on home, Add to plan in discovery, Start workout on review, Complete set in live mode.

Proof and content: Coach approval, exact exercise/equipment identity, curated primary/secondary muscle roles, controllable technique motion, previous-set evidence, pain constraints, personal records, and session summaries.

Constraints: Preserve draft/review/live persistence, explicit start/end, RLS and audit behavior, English source-of-truth fallback, light/dark parity, 320–430px usability, safe-area navigation, reduced motion, and no recurring paid inference requirement.

Chosen direction: Interactive Muscle Atlas, comp-first, decision seed e467ce0c. The first viewport is led by a front/back selectable atlas plus today’s target and one plan action. Real-person technique media appears on neutral-light plates.

Memorable moment: Selecting a muscle transitions once from whole-body context to the exact exercises and their primary/secondary roles, while the draft tray remains visible and nothing starts automatically.

Unresolved: Final verified media cohort size and whether any existing profile fields need a dedicated persisted workout-preferences record.
