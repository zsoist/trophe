# Trophē Workout remediation — handoff to Claude Code (2026-09-04)

## Mission

Independently review the combined Workout reconciliation work and the follow-up remediation. Treat every statement below as a claim to verify against code and tests. Prioritize correctness, recovery/idempotency, privacy, accessibility, anatomical honesty, localization, and production operability.

## Exact repository state

- Repository: `zsoist/trophe`
- Base: `origin/main` at `33e4687`
- Review branch: `fix/independent-review-remediation-20260904`
- Reconciliation integration merge: `6e9b77d`
- Remediation implementation: `ca5e2fa`
- Review range: `33e4687..HEAD`
- Worktree used: `/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/independent-review-20260903-codex`

The range deliberately contains the still-open PR #116 reconciliation commits plus this remediation. The older delegated commit `b4b08aa` was not cherry-picked: its functional changes are already present in `origin/main` with later versions (dynamic BotNav columns, route-kind ranking, route-owned focus context, localized exercise detail labels, and their regression tests). A trial cherry-pick was aborted cleanly after confirming that duplication.

## Corrections delivered

### 1. Live recovery no longer treats expired authentication as proof of deletion

`loadWorkoutSessionStructure(sessionId, expectedUserId)` now revalidates the current Supabase user when an RLS-protected query returns no row. Missing/expired auth or an unexpected user returns the non-destructive `reason: 'auth'`; only a verified expected owner can reach `reason: 'missing'`. `LiveWorkout` supplies its server-resolved `userId` through `loadLiveStructure`.

Verify carefully: this closes the demonstrated expired-token local-copy destruction path. It is not a security-definer existence RPC, so a valid user plus a future broken SELECT policy could still be indistinguishable from a genuinely missing owner row. Decide whether that residual operational ambiguity merits a dedicated, narrowly scoped RPC.

### 2. Deterministic PostgREST/schema failures preserve the idempotency envelope

Persistence failures now have three classes:

- `rejected`: request/data/RLS refusal that releases the impossible envelope (`22xxx`, `23xxx`, `42501`, `P0001`);
- `blocked`: definition/schema-cache/JWT configuration failures that preserve the byte-exact envelope (`42xxx`, `PGRST1xx`, `PGRST2xx`, `PGRST3xx`);
- `transient`: unknown outcome, network, timeout, serialization, or unclassified error; envelope remains pinned.

`WorkoutWorkspaceProvider` exposes a visible `startBlocked` state while the pinned request is still present. `WorkoutReview` shows a localized repair/sign-in explanation, retains “Retry same start,” disables draft mutation, and suppresses the generic duplicate error. The message exists in all eight supported locales.

Review the classification boundaries, especially PostgREST codes, and confirm that no definitive duplicate-producing outcome is accidentally considered safe to release.

### 3. Anatomical fallback claims are honest and type-safe

`MuscleActivation` is now a discriminated union:

- curated activations cannot carry `group`;
- group estimates require `group`, require `confidence: 'group'`, and can only use the broad `primary` presentation role.

The Workout atlas uses `anatomyLabelKey()` for the displayed name and labels a fallback as “Group” rather than presenting the representative SVG region as a named, specific primary muscle. For example, a shoulders fallback now reads “Shoulders · Group,” not “Anterior deltoid · Primary target.” This prevents UI copy from overstating the evidence used by pain avoidance or coaching.

### 4. Client-created exercises are included in GDPR erasure

`exercises.created_by` moved from coach-only classification into `PRE_ERASURE_STEPS` with `action: 'nullify'`. This strips the client identity while retaining exercise rows referenced by paid workout/form history. The existing generic erasure engine executes the nullification before deleting the profile.

No migration was added because `created_by` is already nullable. Review the legal/product retention decision: nullification is intentional to preserve referenced history, but the exercise name/content itself may still contain user-entered personal information and could require field-level anonymization under a stricter interpretation.

### 5. Finish-dialog Escape race is closed without focus thrash

The document-level Escape listener still mounts once, preserving focus capture/restore. A `useLayoutEffect` refreshes `saving` and the latest `onKeepTraining` callback before an ancestor layout effect or browser event can fire in that commit. Escape therefore cannot close the dialog in the same commit that saving becomes true. The solution introduces no new lint warning.

### 6. Rest announcements reset correctly after Undo

Successful Undo now clears the polite live-region state along with the rest clock. Completing the set again announces “Rest started” again instead of leaving stale assistive-technology output.

### 7. CSP baseline includes form submission control

Production CSP now includes `form-action 'self'` in addition to the existing object/base/frame hardening and MediaPipe allowances. Confirm that all current auth/payment integrations use same-origin handlers or client-side requests before expanding this directive in the future.

### 8. Production canary is executable again

Five CSP assertions had been accidentally inserted before and on the shebang. They were removed from the preamble; the same assertions remain in their intended post-fetch section. A behavioral test executes the script without paid-operation opt-in and verifies that it reaches the paid-operation guard, exits 1, and never emits `command not found`.

### 9. Redirect-security source is plain reviewable text

The literal NUL byte in `lib/auth/safe-redirect.ts` was replaced with the source escape `\u0000`. Runtime behavior is unchanged, but Git can now treat the file as ASCII text and future security diffs are reviewable. A byte-level regression test enforces this.

### 10. Next.js request-gate documentation is current

`AGENTS.md` now points to root `proxy.ts` for Next.js 16 instead of the nonexistent root `middleware.ts`.

## TDD evidence

Each verified defect received a behavioral red test before its implementation. Observed red states included:

- the canary shell attempted five commands before its shebang;
- expired auth was returned as destructive `missing`;
- shoulder group fallback displayed a named deltoid/primary claim;
- blocked PostgREST errors were collapsed into transient behavior;
- the finish dialog closed on same-commit Escape while saving began;
- Undo left “Rest started” in the live region;
- CSP lacked `form-action`;
- the blocked review transition displayed both generic and repair errors;
- `safe-redirect.ts` contained byte `0`;
- erasure coverage classified client exercises as coach-only.

The tests were then rerun green. Do not replace these with source-substring assertions; the only source/byte contracts retained are for file-format and exhaustive-list concerns where execution is not the relevant behavior.

## Fresh verification on the final tree

Run from the worktree above:

```bash
npm run typecheck
npm run lint
NODE_OPTIONS=--no-experimental-webstorage npm test
npm run guard:theme
npm run assets:workout:check
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-anon-key \
SUPABASE_SERVICE_ROLE_KEY=ci-service-role-key \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
npm run build
npm run perf:budget
npm run test:e2e:local-auth
```

Observed results on 2026-09-04:

- TypeScript: pass, zero errors.
- ESLint: pass, zero errors; 43 pre-existing warnings outside this remediation.
- Vitest with local database prerequisite: 315 files passed, 1 skipped; 2,471 tests passed, 46 skipped.
- Full coverage run: pass; 56.44% statements, 55.23% branches, 63.42% functions, 58.30% lines.
- Theme guard: pass.
- Workout artwork check: pass; 24 native SVG sources, true 4K no-upscale masters, 273,970 runtime bytes, deterministic hashes.
- Next.js production build: pass; 70 static pages generated.
- Performance budgets: pass for `/`, `/login`, `/dashboard`, Workout home, live, build, and history.
- Authenticated local Playwright: 76/76 passed on mobile and desktop Chromium; disposable users removed.
- `git diff --check`: pass.
- Added-lines secret-pattern scan: no match.

## Known diagnostics not claimed as fixed

- The authenticated route sweep logs a pre-existing Framer Motion warning on coach routes: opacity animates from `undefined` to `1`. It does not fail the 76 E2E cases and is outside the Workout remediation diff, but it should receive a dedicated reproduction and fix.
- ESLint still reports 43 pre-existing `react-hooks/set-state-in-effect` warnings across coach/shared/super surfaces.
- A full dev-dependency `npm audit` reports two high transitive development advisories (`brace-expansion`, `js-yaml`) plus moderate toolchain findings. CI intentionally gates `npm audit --audit-level=high --omit=dev`; do not silently weaken that production gate. Handle dev-tool upgrades separately because the safe Drizzle upgrade path needs validation.
- No production database write or customer-account smoke was performed. Database tests and E2E used disposable local Supabase data only.

## Premium Workout product roadmap — recommended next work

The current visual system has good foundations, but “premium, accurate, and informative” should be treated as a data/product program, not merely animation polish.

### P0: evidence contract before more visuals

1. Keep curated muscle roles separate from group estimates end to end; never persist inferred representative regions as medical fact.
2. Add provenance and review metadata per exercise/media mapping: source, reviewer, review date, version, and confidence.
3. Define safe consumer language: “commonly emphasized,” “assists,” and “stabilizes,” avoiding injury-prevention or clinical claims not supported by evidence.
4. Add an exercise-level QA matrix linking canonical aliases, equipment, movement, media, anatomy, and localization.

### P1: premium exercise media coverage

1. Expand verified media from the current catalogue to the highest-frequency 50–100 exercises before chasing long-tail quantity.
2. Provide consistent start/end frames plus a short loop for each movement; keep camera, crop, lighting, equipment, and body proportions stable.
3. Show setup, motion path, breathing/bracing cues, common mistakes, range-of-motion caveats, and regressions/progressions as separate information layers.
4. Generate poster and low-bandwidth fallbacks from the same reviewed master. Respect `prefers-reduced-motion`, data saver, and offline/PWA constraints.
5. Require human anatomy and coaching review before any generated image or animation is marked verified.

### P1: informative muscle animation

1. Animate intensity by phase (eccentric, transition, concentric) rather than a decorative global pulse.
2. Encode primary/secondary/stabilizer with shape, label, and accessible text—not color alone.
3. Support front/back switching with a persistent legend and a concise “why this muscle” explanation.
4. Surface confidence explicitly: curated muscle, broad group estimate, or unavailable. Unknown is better than false precision.
5. Keep selection and phase changes keyboard accessible and announce meaningful changes without flooding a live region.

### P1: performance architecture

Authenticated Workout routes remain roughly 971 KiB–1,053 KiB of first-load JS under the current budgets. The largest levers remain:

1. split the eight-language dictionary by active locale;
2. isolate or replace Framer Motion in noninteractive/static islands;
3. lazy-load analytics, atlas detail, and form-check runtimes at the point of use;
4. self-host and integrity-pin MediaPipe runtime/model assets if operationally feasible;
5. add real-user Core Web Vitals segmented by route, device class, and connection quality rather than relying only on build bytes.

### P2: remaining platform hardening

1. Add route-level `error.tsx` boundaries for Workout recovery surfaces.
2. Complete RLS test coverage for the remaining Workout tables and verify query plans for coach access paths.
3. Scope `workout_templates.shared` to an organization/publishing model rather than a global flag.
4. Short-circuit coach `workout_sets` authorization to avoid per-row `is_coach_of()` work.
5. Replace the residual valid-auth/no-row ambiguity with a narrowly scoped security-definer reconciliation RPC if the risk review supports it.

## Questions Claude Code should answer

1. Can any two-tab/reconnect race still release an envelope that the server may later accept?
2. Are the `blocked` PostgREST code families correct and exhaustive for the deployed PostgREST version?
3. Should RLS-hidden versus truly missing live sessions be resolved by a dedicated owner-scoped RPC rather than auth revalidation?
4. Does nullifying only `exercises.created_by` meet the intended erasure policy for user-authored names/descriptions?
5. Is `useLayoutEffect` ordering sufficient for the Escape race in all supported React/browser cases, or should the listener be attached to the dialog and read disabled DOM state directly?
6. Does `form-action 'self'` affect any current or planned cross-origin auth/payment flow?
7. Can the anatomical union be narrowed further so group estimates never enter persistence or pain-avoidance inputs?
8. Are the current performance budgets acting as regression caps only, or are they mistaken for an acceptable paid-product target?

## Requested review output

Return findings first, ordered by severity, with exact `file:line` citations. Separate verified facts from inference and recommendations. Then provide:

1. correctness/security/accessibility review of `33e4687..HEAD`;
2. a score for this remediation wave;
3. an updated score for Workout as a paid consumer product;
4. merge recommendation (`approve`, `approve with follow-up`, or `request changes`);
5. a short, prioritized follow-up list with owners and acceptance criteria.

