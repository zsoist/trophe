# Task 11 — accessible motion, language, and shell integration

## Result

Task 11 integrates coherent workout localization, one restrained workout-route transition, predictable post-navigation focus, mobile-safe editing controls, and a physically bottom-aligned five-slot client navigation bar. English remains the first-run default while all eight supported locale selections remain usable.

The Impeccable skill and `reference/craft-floor.md` were read before the first UI edit. The Impeccable detector was not run; it remains reserved for Task 12.

## RED evidence

Before production edits, this focused command was run:

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/i18n/workout-atlas-copy.test.ts tests/i18n/i18n-provider.test.tsx tests/components/workout-route-transition.test.tsx tests/components/workout-accessibility-v3.test.tsx tests/components/client-shell-navigation.test.ts tests/components/client-secondary-theme-contract.test.ts
```

It produced nine contract failures covering missing workout copy, ignored `defaultLang`, unsafe/incorrect stored-language behavior, the absent route transition, incorrect bottom-nav geometry, five sub-16px mobile form controls, and missing localized exercise-specific control names. A subsequent complete-block fallback test also failed because the pure exercise-copy resolver did not yet exist. These failures were implementation-facing rather than snapshot churn.

## GREEN evidence

Fresh final focused-plus-regression run:

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/i18n/workout-atlas-copy.test.ts tests/i18n/i18n-provider.test.tsx tests/components/workout-route-transition.test.tsx tests/components/workout-accessibility-v3.test.tsx tests/components/client-shell-navigation.test.ts tests/components/client-secondary-theme-contract.test.ts tests/components/workout-home-v2.test.tsx tests/components/workout-home-v3.test.tsx tests/components/workout-v3-asset-quality.test.ts tests/components/exercise-detail-v3.test.tsx
```

Result: 10 files passed, 84 tests passed, zero failures.

Additional fresh gates:

- `npm run guard:theme` — passed; no dark-only, arbitrary white/black rgba or neutral hex, or functional text below 12px utilities.
- `npx tsc --noEmit` — passed.
- Targeted ESLint over every changed TypeScript/TSX source and test — passed with zero warnings/errors.
- `git diff --check` — passed.

The V3 asset-quality suite remained green, so no valid V3 media expectation was changed. The two obsolete Workout Home V2 expectations and their i18n mock inventory were updated to reflect the integrated home hierarchy; no production behavior was bent to satisfy them.

## Language semantics

- `I18nProvider` starts from its `defaultLang` (defaulting to English), accepts `setLang(language)`, persists when storage is available, and synchronizes `<html lang>`.
- A valid stored EN/ES/EL/FR/DE/IT/PT/NL locale is restored after mount. Invalid values fall back to the requested default. Storage read/write denial is caught so rendering and in-memory language switching remain available.
- The exact workout-key inventory is asserted across all eight dictionaries, including placeholder parity.
- Exercise instructions resolve as one authored block. ES or EL use their complete localized block when present; FR/DE/IT/PT/NL and missing ES/EL content use the complete English block. The UI never constructs prose from fragments in different languages.

## Motion and focus

- Workout child routes use one `AnimatePresence` surface owned by the workout layout. The outer client shell remains keyed only by the top-level dashboard section, avoiding double animation within workout routes.
- Forward navigation enters from `x: 18`; back/home enters from `x: -18`; duration is 220ms with a restrained ease. There are no staggered card entrances.
- Reduced motion uses `initial={false}`, no exit transform, and zero duration for an immediate visible swap.
- Initial hydration preserves the user's current focus. Subsequent client route changes focus the destination `main` landmark with `preventScroll`; existing dialog focus restoration remains untouched.
- Link semantics remain native for browser Back/Forward and modified/middle clicks. Active Workout reselect continues to replace the current workout child route with `/dashboard/workout`.

## Mobile geometry and controls

- The client nav is fixed at physical `bottom: 0`, spans `left: 0` to `right: 0`, retains safe-area padding, and uses `repeat(5, minmax(0, 1fr))` for equal destinations.
- Visible labels switch on only at 431px. Therefore the requested 320, 350, 375, 390, and 430px widths all use icon-only presentation without text clipping; every link keeps its localized `aria-label` and 56px target.
- Owned workout text inputs, number inputs, textareas, and selects now explicitly render at 16px or larger on mobile.
- Move earlier/later, replace, technique, and remove actions retain localized accessible names that include the relevant exercise. Media retains exercise-specific alternatives.
- The Task 7 theme contract is closed without weakening its form-size or named-control assertions. One 11px workout-calendar utility found by the guard was corrected to the established 12px floor.

## Browser limitation

A raw Playwright attempt could not start because public Supabase environment values were absent. The repository's bounded local-auth harness then started Supabase, the app, disposable authentication, and guaranteed cleanup successfully, but the legacy `light: complete release evidence journey` stopped before its interaction sequence: its first home wait requires a `Workout templates` button, while the seeded current product state truthfully rendered the newer recommended-workout home with a `Review plan` action. The snapshot confirms the destination `main` owned focus and the five icon-only navigation targets were present. Because the failure is a stale pre-Task-11 journey assumption rather than this task's implementation, the legacy E2E was not weakened or committed; Task 12 owns the authenticated browser release proof and stale journey refresh.

No generated media, database migrations, workout persistence semantics, recommendation ranking, or unrelated untracked files were changed by Task 11.
