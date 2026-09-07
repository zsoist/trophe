---
version: 1
slug: "app-dashboard-workout-page-tsx"
primary_target: "app/dashboard/workout/page.tsx"
related_targets: ["app/dashboard/workout/exercises/page.tsx","app/dashboard/workout/build/page.tsx","app/dashboard/workout/review/page.tsx","app/dashboard/workout/live/page.tsx","app/dashboard/workout/history/page.tsx","app/dashboard/workout/stats/page.tsx","app/dashboard/workout/atlas/page.tsx","tools/anatomy/private-review.tsx","tools/anatomy/workout-review/Workspace.tsx"]
---

Scope: Complete client Workout surface inside the established Personal Best world. Operate mode, mobile-first PWA.

Audience and job: A coached client must understand today’s training, discover or customize exercises, review before starting, log sets quickly, inspect accurate technique, report pain, and see progress. A coach must retain plan authority and receive trustworthy evidence.

Primary action: Contextual and singular—Review plan on home, Add to plan in discovery, Start workout on review, Complete set in live mode.

Proof and content: Coach approval, exact exercise/equipment identity, curated primary/secondary muscle roles, controllable technique motion, previous-set evidence, pain constraints, personal records, and session summaries.

Constraints: Preserve draft/review/live persistence, explicit start/end, RLS and audit behavior, English source-of-truth fallback, light/dark parity, 320–430px usability, safe-area navigation, reduced motion, and no recurring paid inference requirement.

Chosen direction: Faithful assembly of the established Personal Best Workout components in Operate mode. The existing private Muscle Atlas viewer is the full Workout design prototype; production components and their shared styles provide the visual reference. Home presents the readiness rail, the dedicated Muscle Atlas entry, today's anatomical target, and the plan action in the existing reading order. Technique media retains the production guide and its neutral-light plate. The earlier decision seed e467ce0c is historical context, not an approved replacement composition.

Prototype flow: Home connects to review, editable Build, the exercise library and full exercise detail, explicit live start and set logging, completion, History, and Training progress. Muscle Atlas has its own destination at /dashboard/workout/atlas within the persistent Workout workspace. Muscle/group context and exercise-library links stay within the prototype's Workout flow. The five-destination client navigation retains the production shell; destinations outside the preview's Workout scope explain that scope and provide a return to Workout Home.

Private review boundary: The collapsed “Design preview · Sample data” disclosure holds scenario reset, language, and device-observation controls. Example routines, drafts, sets, sessions, history, and analytics use isolated browser-session records and do not write to an account. Reset controls replace only those private example records. The production atlas release remains disabled; the private source override is supplied only by the review wrapper. Any remote review export requires private SSO protection and is not a production release.

Evidence boundary: The saved mobile dark Home, expanded muscle group, exercise-guide viewport, and desktop light Home captures document the preserved composition. They do not establish physical-device performance, a complete accessibility matrix, or remote deployment protection. The private wrapper adds no new global palette, type scale, or component tokens, so DESIGN.md and its sidecar retain their incumbent system decisions.

Memorable moment: Selecting a muscle transitions once from whole-body context to the exact exercises and their primary/secondary roles, while the draft tray remains visible and nothing starts automatically.

Unresolved: Final verified media cohort size and whether any existing profile fields need a dedicated persisted workout-preferences record.
