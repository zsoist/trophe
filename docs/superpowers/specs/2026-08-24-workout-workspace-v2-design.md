# Workout Workspace V2 — Product and Interaction Design

**Date:** 2026-08-24
**Status:** Implemented — local release candidate verified; production promotion pending
**Owner:** Trophē client experience
**Source:** Nik production feedback and mobile screenshots from 2026-08-24

## 1. Outcome

Replace the ambiguous workout page with a routed, draft-first workout workspace that is safe to explore, fast to log, explicit about live state, and equally legible in light and dark themes.

The user must always know:

1. where they are;
2. whether anything has been saved;
3. whether a live workout is running;
4. how to return to Workout Home;
5. what will happen before a destructive or persistent action.

This work preserves the Personal Best design system, current Supabase data model, RLS behavior, exercise library, localization infrastructure, and existing workout history.

## 2. Confirmed Problems

### State and persistence

- The current `landing | freestyle | guided` state model conflates building, logging, and live training.
- Selecting a split immediately enters `freestyle`, opens the exercise picker, and leaves an empty workout behind when the picker closes.
- The primary destructive action says `Finish Workout` before a workout has started.
- Completing the first set silently creates the database session and starts the clock, but the interface does not explain this transition.
- There is no explicit pause or resume state.

### Navigation

- Reselecting the active Workout tab is a same-path link and does not return to Workout Home.
- Nested picker, information, history, and active-session views do not share a clear back/home hierarchy.
- The floating bottom navigation is raised too far from the safe area and can obscure lower content.

### Exercise discovery and imagery

- Global `object-fit: cover` crops anatomy models and movement demonstrations.
- Dark photographic fields dominate light mode and reduce text clarity.
- Fallback anatomy images are reused for unrelated exercises, which can imply false movement specificity.
- The exercise information sheet is visually large but informationally shallow.

### Logging controls

- Exercise cards expose too many same-weight icon buttons.
- Set columns use unexplained abbreviations and cramped numeric fields.
- Pain Flag and Plate Calculator are detached utilities with insufficient instruction.

## 3. Product Principles

### Draft before live

Browsing, choosing a template, adding an exercise, or editing a set target never starts a workout and never creates a workout session.

### Persistence must be visible

The interface labels content as `Draft`, `Live`, `Paused`, `Saved`, or `Completed`. A state change that writes data has a named action and immediate confirmation.

### One primary action per stage

Home chooses intent. Build prepares the session. Review starts or saves it. Live logs work. Finish confirms completion.

### Anatomy is evidence, not decoration

Anatomical visuals must show the full relevant body region, use a neutral field, and distinguish primary from secondary muscles. A generic anatomy map must never pose as an exercise technique demonstration.

### Familiar interaction wins

Use standard mobile navigation, labeled controls, progressive disclosure, safe-area ownership, and 44px minimum targets. Motion communicates hierarchy changes only.

## 4. Information Architecture

The Workout tab owns the following routes:

| Route | Purpose | Persistent state |
|---|---|---|
| `/dashboard/workout` | Workout Home | None |
| `/dashboard/workout/build` | Create or edit a draft | Local draft, optionally saved routine |
| `/dashboard/workout/review` | Review a complete draft | Same draft |
| `/dashboard/workout/live` | Run or resume a live session | Database session and local live state |
| `/dashboard/workout/exercises` | Browse body areas and exercises | Draft selection context |
| `/dashboard/workout/exercises/[id]` | Full exercise detail | Return target and optional draft context |
| Existing history/stats/form-check routes | Supporting evidence | Existing records |

If route extraction creates unacceptable regression risk, these locations may be implemented as URL-addressable workspace stages backed by one shared provider. Browser Back, deep links, and Workout-tab reselection must still behave exactly as routed views.

## 5. State Machine

### States

- `home`: no draft or live session is being displayed.
- `draft`: exercises and targets are editable; nothing is live.
- `review`: draft is ready for a persistence decision.
- `live`: clock is running and completed sets write immediately.
- `paused`: live session exists but elapsed active time is stopped.
- `finishing`: confirmation and summary preview.
- `completed`: verified database completion followed by summary.

### Transitions

| From | Event | To | Persistence |
|---|---|---|---|
| Home | Choose Strength | Draft | None |
| Home | Choose Cardio | Draft | None |
| Home | Choose template/split | Draft | None |
| Draft | Add/remove/edit exercise | Draft | Local only |
| Draft | Continue | Review | Local only |
| Review | Save plan | Home or Draft | Saved routine only |
| Review | Start live | Live | Create workout session |
| Review | Log completed workout | Finishing | Persist on confirmation |
| Live | Pause | Paused | Persist resumable status or local recovery marker |
| Paused | Resume | Live | Resume active time |
| Live/Paused | Finish | Finishing | None until confirmation |
| Finishing | Confirm | Completed | Verify sets and session completion |
| Any draft stage | Discard | Home | Confirmation only when draft has meaningful edits |

Closing the exercise picker returns to the previous draft without starting, finishing, or renaming anything.

## 6. Screen Design

### Workout Home

- Compact page header: `Workout`, weight unit under a labeled settings action, and History as a named secondary action.
- Two theme-aware mode cards: Strength and Cardio. Images use contained, neutral-field artwork with text outside or in a guaranteed contrast zone.
- `Workout templates` replaces `Quick start`.
- Each template has a name, muscle summary, expected exercise count, and `Preview` behavior. Selecting `Push` previews Chest, Shoulders, and Triceps; it does not open a filtered picker or start a workout.
- A resumable live workout, when present, becomes the dominant first action: `Continue workout` with state and elapsed active time.
- Recent sessions remain evidence, not primary actions.

### Build

- Top navigation: Back, `Build workout`, and Workout Home.
- Persistent status: `Draft · Not started`.
- Editable workout name with a visible `Edit` affordance.
- Exercise rows show contained thumbnail, name, primary muscle, equipment, target sets, and reorder/remove actions.
- Empty draft teaches the next action: `Add your first exercise`.
- Primary CTA: `Review workout` after at least one exercise.
- Secondary CTA: `Save as plan`.
- No clock and no Finish button.

### Exercise Browser

- Search remains available and sticky without covering results.
- Body-area cards use full, contained anatomy on warm white or graphite-neutral fields.
- Primary muscle uses one restrained channel color; secondary muscles use a lower-opacity tint.
- Recent exercises remain compact labeled chips or rows.
- Selecting an exercise adds it to the draft and provides visible feedback; it does not create a live session.
- Back returns to the previous browse level; Close returns to Build.

### Exercise Detail

- Full-screen mobile surface rather than a shallow bottom sheet.
- Large contained movement visual on a neutral background.
- If no specific movement image exists, display an explicitly labeled `Muscles worked` anatomy map instead of a misleading exercise image.
- Sections: primary and secondary muscles, equipment, setup, execution steps, breathing, common mistakes, safety note, personal record, and recent sessions.
- Sticky action: `Add to workout` or `Added`.
- Technique copy uses existing localized instructions where available and safe English fallback where translations are missing.

### Review

- Summary: workout name, exercise count, estimated sets, target muscles.
- Expandable exercise list for final edits.
- Primary CTA: `Start live workout`.
- Secondary CTA: `Log completed workout` for after-the-fact entry.
- Tertiary CTA: `Save plan`.
- Explains that starting live begins the active timer and makes set completions persistent.

### Live and Paused

- Header includes Back/Home, state chip, active timer, and Pause/Resume.
- Each exercise card prioritizes identity, last performance, and set entry.
- Set row labels are explicit: `Weight`, `Reps`, `RPE`, `Done`.
- Weight and reps receive the largest fields; RPE is optional and visually secondary.
- Rest timer is a labeled control adjacent to completed-set feedback, not mixed into the exercise utility toolbar.
- `Technique`, `Pain`, `Plate calculator`, `Superset`, and `Remove` live under a labeled More menu or a compact details area.
- Live navigation away from the screen keeps the workout resumable.
- Paused state clearly stops active elapsed time and retains all logged sets.
- `Finish workout` remains visible only in live/paused state and always opens confirmation.

### Finish Confirmation

- Describes what will be saved: duration, completed sets, volume, pain notes, and PRs.
- Offers `Keep training`, `Save and finish`, and, when appropriate, `Discard empty workout`.
- Cannot complete an empty session accidentally.
- Successful completion requires verified writes before showing the summary.

### Pain Flag

- Title becomes `Report pain` with the current exercise shown.
- Body area is a labeled field with suggested regions appropriate to the exercise while remaining editable.
- Severity options include meaning: `1 Mild`, `2`, `3 Moderate`, `4`, `5 Stop`.
- Severity uses accessible danger shades and does not depend on color alone.
- Notes clarify that the record is shared with the coach.
- Primary action: `Save pain note`; secondary: `Cancel`.

### Plate Calculator

- Opens as a focused utility from a barbell exercise.
- Editable total weight, weight unit, bar weight, and available plates.
- A mirrored bar diagram labels `Left side` and `Right side` and states that listed plates are per side.
- Reports exact, nearest-load, or impossible combinations.
- Warm-up ramp explains that percentages are suggestions based on the working weight.
- Warm-up rows may be copied into the exercise draft/live set list through an explicit action.

## 7. Visual Asset Rules

- Body-area assets use a portrait-safe composition with at least 8% internal breathing room around the complete figure.
- Exercise assets use `object-fit: contain`; no face, limb, bar path, or equipment endpoint may be cropped.
- Light mode field: warm white or very light neutral, not pure black.
- Dark mode field: raised graphite, not a black void.
- Anatomy highlighting uses validated muscle regions. Generated art may demonstrate a movement but is not accepted as anatomical truth without human review.
- Cardio uses recognizable activity-specific visuals rather than a red full-body anatomy placeholder.
- Every visual has a meaningful localized alt description or is marked decorative when adjacent text supplies the same information.
- Static optimized WebP/AVIF assets are bundled locally; no runtime image-generation or image API cost is introduced.

## 8. Bottom Navigation and Safe Areas

- ClientShell is the sole bottom-navigation owner.
- Navigation is horizontally centered, has consistent 16px side gutters, and sits at the safe-area edge without an unexplained additional gap.
- Content padding equals navigation height plus safe area plus a small reading buffer; it does not create a large empty lower canvas.
- Reselecting the active Workout tab navigates to `/dashboard/workout` and resets nested presentation state while preserving a recoverable live session.
- Nested full-screen utilities may hide the bottom navigation when it would conflict with a focused task.

## 9. Theme and Accessibility

- All text/background pairs meet WCAG AA for normal text in both themes.
- Image text is avoided unless backed by a deterministic contrast surface.
- Focus order follows visual order; overlays trap focus and restore it on close.
- All icon-only actions receive a visible label, accessible name, or placement under More.
- Touch targets are at least 44×44 CSS pixels.
- Reduced motion replaces spatial transitions with immediate or short opacity changes.
- Route and state changes are announced through page titles/headings and, where needed, an `aria-live` status.

## 10. Data and Recovery

- Draft content is stored locally with a versioned schema and user-scoped key; no empty database session is created.
- Starting live creates one session idempotently.
- Completed sets continue to persist immediately for crash safety.
- Pause/resume state and accumulated active time survive refresh.
- Finishing uses existing verified write helpers and clears recovery state only after success.
- Existing workout history remains readable without migration.
- No API calls or paid AI processing are added to the live workout flow.

## 11. Motion

- Route changes: 180–240ms directional transform/opacity, transform-only.
- Sheets/utilities: 180–240ms bottom rise with backdrop; no decorative choreography.
- Completion and state transitions provide a single decisive response.
- Bottom navigation targets never move under the finger.

## 12. Testing and Acceptance Criteria

### State behavior

- Choosing any mode/template creates only a draft.
- Closing the picker never leaves an empty active workout.
- Database session creation occurs only on explicit live start or confirmed retrospective save.
- Pause stops active elapsed time; resume continues from accumulated time.
- Finish always requires confirmation and cannot silently persist an empty session.

### Navigation

- Reselecting Workout from any nested workout route returns to Workout Home.
- Browser Back and visible Back produce predictable previous-stage behavior.
- Active live state remains recoverable after Home, refresh, and app relaunch.
- Bottom navigation neither floats excessively nor covers the final interactive row on representative iPhones.

### Visuals and themes

- Full figures and movement equipment fit at 320, 375, 390, and 430px widths.
- Strength/Cardio and anatomy-card text meets contrast in light and dark themes.
- No black-field fallback is presented as a specific movement.
- Exercise detail identifies primary/secondary muscles and shows technique content.

### Logging

- A user can add Bench Press, enter weight/reps, start live, complete a set, pause, resume, report pain, use the calculator, and finish without encountering an unlabeled destructive control.
- Offline/transient write failure retains unsaved/recoverable state and communicates the failure.
- Historical sessions, PRs, rest targets, supersets, routines, and unit conversion remain correct.

### Verification scope

- Unit tests for state transitions, draft recovery, elapsed-time accumulation, plate calculations, and asset resolution.
- Component tests for Home, template preview, Build, Review, Live, Pain Flag, calculator, and active-tab reselection.
- End-to-end mobile tests in light and dark modes for the complete draft-to-finish journey.
- Screenshot regression checks at the production viewport represented by Nik's captures.
- Typecheck, lint, focused tests, full test suite, production build, deploy smoke test, and post-deploy canary.

## 13. Non-Goals

- Replacing the Personal Best design language.
- Changing nutrition, messaging, coach programming, or workout-history semantics beyond shared navigation fixes.
- Introducing runtime AI image generation.
- Diagnosing injuries or presenting anatomical imagery as medical advice.
- Migrating historical workout records without a demonstrated compatibility need.

## 14. Rollout

1. Implement behind code-level compatibility boundaries while preserving existing data helpers.
2. Verify draft/live state behavior locally and in browser automation.
3. Validate light and dark mobile screenshots.
4. Merge only after full CI and review.
5. Deploy to production with smoke tests for authentication, Workout Home, Build, Live, persistence, and history.
6. Run canary monitoring and retain a direct rollback path to the previous workout page.

## 15. Implementation Record

**Verified code release candidate:** `7e011f673d8d593c1b9fc0b5b9c7a2240590d9ed`
**Local verification date:** 2026-08-25

- Static gates: `git diff --check`, TypeScript, and ESLint all exited 0; ESLint reported 45 existing warnings and 0 errors.
- Focused workout, exercise, client-shell, navigation, and live-workout suites: 29 files and 259 tests passed.
- Full Vitest suite with Node local-storage support: 256 files and 1,923 tests passed; 1 file and 46 tests were intentionally skipped.
- Production build: Next.js 16.2.12 compiled successfully and generated 70 static pages using documented non-secret local Supabase placeholders.
- Performance, theme, paid-AI, and workout-asset guards passed. The deterministic asset check covered 20 alpha WebPs totaling 778,430 runtime bytes.
- Authenticated mobile Playwright: the scoped Workout Workspace V2 suite passed 10/10 and removed its disposable users. The journey made no paid-provider requests.
- Visual evidence: Home, Preview, Build, Browser, Detail, Review, Live, Paused, Pain, Plate, Finish, and Completed were captured and inspected at a 390×844 CSS viewport in light and dark themes (1,170×2,532 device-pixel images).
- Impeccable detector: no findings in the changed workout surfaces or release-evidence spec.

The default repository-wide authenticated Playwright matrix was also sampled while diagnosing the scoped runner. It passed 73/76; three failures outside this workout scope remain in the microphone/PWA prompt and settings unit-control flows. The scoped runner now forwards explicit Playwright specs and options verbatim, while preserving the existing default matrix when no arguments are supplied.

CI, pull-request review, production deployment, and post-deploy canary evidence are not part of this local record and remain required before production promotion.
