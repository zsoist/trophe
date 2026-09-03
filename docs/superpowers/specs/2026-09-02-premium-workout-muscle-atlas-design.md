# Premium Workout Muscle Atlas — Design Specification

**Date:** 2026-09-02  
**Status:** implemented and release-verified
**Chosen composition:** Interactive Muscle Atlas  
**Build path:** comp-first  
**Decision seed:** `e467ce0c`

## Objective

Replace the current Workout presentation with a coherent coach-governed training system in which accurate anatomy and technique media help a client choose, understand, perform, and review a workout. The redesign extends the existing Personal Best identity and preserves the current durable draft/review/live session engine.

The module must feel useful during a real workout, not like a visual exercise catalogue. Motion teaches a movement or explains state; it never starts a workout, hides controls, or competes with set logging.

## Product model

Trophē uses a hybrid model:

- a coach can assign and approve a program;
- Trophē can prepare an editable recommendation from goals, level, equipment, history, recovery, and pain constraints;
- the client reviews the exact routine before explicitly starting it or recording it retrospectively;
- completed work becomes evidence for both client and coach;
- paid inference is optional and budget-gated, not required for the first recommendation engine.

## Information architecture

### 1. Workout home

The home answers three questions in order:

1. What am I training today?
2. Is this assigned, recommended, or mine?
3. What can I do next?

The first viewport contains a compact readiness/plan rail, today’s muscle focus, a front/back interactive atlas, and one primary action. When a coach plan exists, the primary action is **Review plan**. Without a plan, it is **Build workout**. Search, saved plans, and history remain secondary destinations.

Re-selecting the Workout tab from any nested Workout route returns to this home without discarding a draft or live session. A recoverable live session appears as a prominent **Resume workout** state.

### 2. Exercise discovery

Discovery supports two equally valid entry modes:

- visual selection from the muscle atlas;
- direct search by exercise name.

Results can be filtered by equipment, body region, movement pattern, and availability. The first step shows muscle groups; the second shows relevant exercises. Multi-select is supported through a persistent plan tray that never covers the final result row or bottom navigation.

Selecting an exercise opens detail. Adding it changes the draft only. It never starts a timer or creates a live session.

### 3. Exercise detail

Exercise detail is a full screen or large sheet with:

- exact technique motion and a static poster;
- start and finish phase controls;
- front/back muscle map;
- primary, secondary, and stabilizer roles;
- equipment and setup;
- concise setup, movement, breathing, and safety cues;
- previous values, personal best, and recent sessions when available;
- **Add to plan** or **Replace exercise** as the contextual action.

Technique content remains available from a live workout without pausing or losing the session.

### 4. Plan editor and review

The editor shows the sequence as compact exercise blocks with motion posters, target sets/reps, rest, optional RPE, notes, and substitution. Exercises can be reordered without horizontal precision gestures. The review screen summarizes duration, equipment, muscle distribution, and pain conflicts.

Review has two explicit actions:

- **Start workout** creates the live session and begins the active clock;
- **Log completed workout** records a session done elsewhere without a live clock.

### 5. Live workout

Live mode focuses on one active exercise while retaining the whole-session path. It contains:

- large technique poster/loop with play/pause;
- exercise number and session progress;
- previous-set evidence and current target;
- large weight, reps, and RPE inputs;
- one **Complete set** action;
- automatic rest timer with skip/adjust controls;
- quick access to technique, plate calculator, pain flag, notes, pause, and exercise substitution;
- a visible next exercise preview.

Ending is deliberately separated from ordinary controls and always confirmed. A high-severity pain flag pauses the session and recommends stopping or modifying the exercise; it does not diagnose an injury.

### 6. Completion and progress

Completion shows duration, sets, volume, personal records, pain notes, and muscles trained. History groups sessions by month and allows filter by workout type. Exercise progress shows best weight, estimated one-rep max where valid, volume, consistency, and complete history. Muscle distribution distinguishes planned from completed work.

## Media system

### Anatomy layer

Anatomy is deterministic and reviewable, implemented as a front/back SVG atlas with named muscle paths. Each canonical muscle has a stable key, human-readable label, view, and region. Primary muscles use a solid semantic channel, secondary muscles use a lighter fill, and stabilizers use an outline or hatch. Color is never the only distinction.

The atlas supports:

- hover/focus/tap selection;
- front/back switching without layout jump;
- a short focus transition rather than continuous pulsing;
- labels and text equivalents for every highlighted region;
- a static reduced-motion state.

The controlled vocabulary follows established anatomical names such as pectorals, serratus anterior, deltoid heads, rotator cuff, trapezius, latissimus dorsi, rhomboids, erector spinae, biceps, triceps, forearm flexors/extensors, rectus abdominis, obliques, gluteal groups, quadriceps, hamstrings, adductors, gastrocnemius, soleus, and tibialis anterior. Exercise-specific roles are curated; they are not inferred from image pixels.

### Technique layer

Technique media uses a controllable `<video>` or frame-sequence player, not an uncontrolled animated GIF. WebM/MP4 provides better quality and size, permits pause/replay/scrubbing, and can honor reduced motion. Every motion asset has:

- a neutral-light poster;
- exact exercise/equipment identity;
- a short loop with stable camera and full-body safe margins;
- duration and frame-rate metadata;
- textual phase descriptions;
- provenance and review status;
- a reduced-motion poster fallback.

List views show static posters by default. Motion begins only when the card is focused or the user presses play. The detail and live surfaces may loop a short demonstration, but always expose pause/replay. Continuous auto-motion longer than five seconds is not allowed without a stop mechanism.

### Fidelity tiers

1. **Verified technique:** exact movement media and curated muscle roles.
2. **Verified anatomy:** exact muscle roles with a static atlas; no claim that the body-area visual demonstrates technique.
3. **Honest fallback:** neutral exercise placeholder, equipment, and text cues; never a mismatched movement image.

The first production cohort covers the currently supported named technique assets and the most-used compound patterns. Custom and uncovered exercises use the honest fallback until curated.

## Recommendation engine

The first recommendation engine is deterministic and inspectable. Inputs include training goal, experience level, available equipment, desired duration, recent completed muscles/volume, active coach plan, and unresolved pain flags. It produces a draft with a plain-language explanation and never overwrites a coach assignment.

The engine must:

- exclude incompatible equipment;
- avoid or flag painful body regions;
- prevent duplicate movement patterns in a short session;
- cap session length and exercise count;
- prefer recent successful exercises and preserve progressive-overload evidence;
- return a reviewable draft, not a live workout.

## Motion and transitions

- Route transitions use a short directional slide/fade that preserves scroll and respects reduced motion.
- Atlas highlights interpolate once on selection; they do not glow or pulse indefinitely.
- Exercise loops stop when offscreen, the page is hidden, or the session is paused.
- Rest and progress changes use restrained numeric transitions.
- No animation shifts set fields, changes hit targets, or delays a primary action.

## Accessibility and mobile constraints

- 44px minimum touch targets and 16px mobile input text.
- Full keyboard and screen-reader access to atlas regions, filters, media, set completion, and dialogs.
- A visible play/pause control adjacent to moving content.
- `prefers-reduced-motion` produces a complete static experience.
- No content underneath the bottom navigation, browser safe area, or software keyboard.
- Equivalent hierarchy and contrast in light and dark themes.
- The core flow is verified at 320, 375, 390, 430, 768, and desktop widths.

## Visual direction

The chosen Interactive Muscle Atlas comp remains inside Personal Best: obsidian/graphite or warm paper, disciplined evidence rails, Trophē gold for decisive actions, and performance colors only for meaningful muscle/data channels. The atlas owns the first viewport, while real-person technique imagery sits on clean neutral backgrounds. The interface avoids neon anatomy, dark cutout figures, floating actions over content, excessive pills, glassmorphism, and generic dashboard card grids.

## Data and implementation boundaries

- Preserve the existing routed Workout provider and draft/review/live persistence contract.
- Introduce typed media and muscle-role registries before changing the UI consumers.
- Keep custom-exercise fallbacks explicit and safe.
- Add persisted workout preferences only if existing profile/intake fields cannot provide the required inputs.
- Do not add a recurring API dependency to create recommendations or render media.
- Preserve coach/client authorization, row-level security, audit events, retry behavior, and offline recovery.

## Acceptance criteria

- A new client can find a muscle or search an exercise, inspect accurate guidance, add it, review the workout, and explicitly start or retrospectively log it.
- No action in discovery starts or finishes a workout.
- Every moving visual can pause and has a static accessible equivalent.
- An exact-media mismatch is impossible by resolver contract; unsupported exercises receive a labeled honest fallback.
- Light/dark modes and mobile safe areas pass visual and interaction checks.
- The complete test suite, new media-contract tests, mobile browser journeys, production health checks, and post-deploy canary are green before the goal is declared complete.

## Release verification

- The bounded release gate passed typecheck, lint, the complete Vitest suite, and a 70-route production build on 2026-09-03. The full unit run reported 2,295 passing tests, 46 skipped tests, and one intentionally skipped file.
- The authenticated Chromium journey passed 16/16 cases across plan, live session, overlays, completion, history, analytics, recovery after a committed lost response, stable focus, light/dark themes, and 320, 375, 390, and 430 px phone layouts.
- The final visual matrix contains 104 valid Workout captures across light/dark themes and 320, 390, 430, 768, and 1280 px widths, plus focused overlay evidence. The single allowed mechanical detector result and the corrective-pass evidence were reviewed before release.
- Production bundle budgets passed: `/` is 19.4 KiB (+8.5% from baseline) and `/login` is 272.4 KiB (+2.8%). The workout media registry also passes the deterministic asset integrity check.
- The recommendation and verification paths made no paid AI calls.

## Evidence used

- User-supplied references from Apple Fitness, Hevy-style trackers, Fitbod-like recommendation flows, and anatomy-first exercise libraries.
- Official Hevy documentation separates reusable routines from live workouts and emphasizes previous values, rest timers, exercise history, and controlled logging.
- Official Fitbod documentation describes recommendations based on recovery, history, goals, equipment, and desired session duration.
- Apple’s official Fitness guidance keeps start, pause/resume, end, and summary as explicit states.
- ACE’s official exercise library provides a practical muscle/equipment vocabulary and detailed form guidance.
- W3C WCAG guidance requires a pause/stop mechanism for qualifying moving content; reduced-motion preferences require a complete nonanimated presentation.
