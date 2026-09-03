# Task 10b — anatomically contoured muscle atlas report

## Outcome

Replaced the geometric block atlas with a React-owned, interactive front/back
SVG renderer using the pinned `body-muscles@1.0.0` data only. The atlas now
uses 23 licensed surface mappings and three explicitly marked deep-location
guides (`rotator-cuff`, `rhomboids`, and `brachialis`). No imperative
`BodyChart`, runtime fetch, unsafe HTML, glow, or AI anatomy is used.

The adversarial review follow-up is complete. Bilateral regions now have
contour-aligned hit zones, dense exercise combinations use a deterministic
nearest-owner resolver, and real SVG pointer coordinates feed that resolver
instead of relying on DOM paint order. A tap on an active published contour is
owned exactly by that contour, while taps in the surrounding transparent target
area use the resolver. The role list is complete across both sides, role actions
switch the figure intentionally, and compact mode counts the full activation
set. Neutral body context now clears 3:1 in both themes, and front/back/deep
copy is locale-owned and completeness-guarded in all eight supported languages.

## TDD evidence

RED was recorded before the renderer change:

```text
tests/components/muscle-atlas.test.tsx
Unable to find an element by: [data-testid="atlas-region-pectoralis-major"]
```

The test required a published-source marker and deep-guide distinction that the
former geometric atlas did not expose. A second RED for the independent map
contract failed because `@/lib/workout/atlas-geometry` did not yet exist.

The adversarial fixes were also developed from a focused RED:

```text
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  tests/workout/atlas-geometry.test.ts \
  tests/components/muscle-atlas.test.tsx \
  tests/components/muscle-atlas-theme.test.ts \
  tests/i18n/exercise-picker-copy.test.ts
4 files: 26 failed, 18 passed
```

Failures proved that the old implementation had no deterministic hit resolver,
no bilateral hit-centre contract, no complete cross-side role story, no
contrast-token proof, and no complete locale-owned front/back summary keys. An
additional component RED proved that removing SVG pointer routing left a real
viewport-coordinate gesture unable to select any muscle.

GREEN command:

```text
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  tests/workout/atlas-geometry.test.ts \
  tests/components/muscle-atlas.test.tsx \
  tests/components/muscle-atlas-theme.test.ts \
  tests/i18n/exercise-picker-copy.test.ts
4 files passed, 59 tests passed
```

The tests independently assert all 26 regions, the 23/3 source split,
fine-grained published path IDs, deep-guide DOM contract, canonical posterior
views, representative point ownership for bench, squat, curl, and both forearm
roles, activation-order independence, real SVG pointer routing with exactly one
selection, full role semantics, complete role-action sentences in eight
locales, and the minimum hit geometry independently at 296px and 212px.

The final re-review fixes also started with a focused RED. It reproduced a
compact posterior target clipped to `-3px`, the left extensor contour resolving
to flexors, missing exact source-contour ownership, and missing complete
locale-owned action sentences in all eight locales. The geometry and component
suite above is the subsequent GREEN result.

## Mapping and provenance

- 23 `licensed-surface` regions map explicitly to exact body-muscles path IDs.
  This includes separate upper/lower trapezius, gluteus medius/maximus,
  gastrocnemius/soleus, flexors/extensors, and tibialis anterior.
- `rotator-cuff`, `rhomboids`, and `brachialis` use clearly marked dotted
  `deep-location-guide` geometry only; they are not presented as surface
  contours.
- Curated activation data now places triceps and the forearm path-data regions
  on the posterior atlas view. Core `lib/workout/anatomy.ts` stays lightweight
  and has no visual-geometry/package import.
- Forearm representative points come from the published body-muscles contour
  interiors rather than hand-picked region centres. At `y=35`, flexors use
  `(41,35)` / `(64,35)` within published left/right x-bounds
  `39.814..42.870` / `61.764..65.204`; extensors use `(39,35)` / `(66,35)`
  within `37.998..40.625` / `64.075..67.002`.
- `THIRD_PARTY_NOTICES.md` records `body-muscles` 1.0.0, its exact npm
  integrity, Apache-2.0 license, NOTICE attribution, source URL, and renderer
  modifications. It also records the OpenStax/Wikimedia provenance links used
  for non-diagnostic guide wording.

## Accessibility, motion, and themes

- One focusable `<g role="button">` is rendered per region; its constituent
  paths are not focusable. Click, Enter, and Space activate it; focus alone
  does not select it.
- Each accessible muscle group may own multiple transparent, bilateral hit
  zones. Licensed and deep-guide contours are pointer-addressable and carry
  exact owner metadata, so a tap on a visible contour selects that owner even
  where neighbouring hit zones overlap. The figure's interaction plane handles
  surrounding taps by converting the gesture to SVG coordinates and choosing
  the closest eligible owner with canonical-ID tie-breaking. This preserves
  order-independent proximity behaviour without allowing DOM paint order to
  steal exact contour taps.
- Controls use `aria-pressed`; controlled selections and complete role-list
  actions intentionally cross views. The sole semantic role list includes all
  activations with localized Front/Back tags; the former duplicate partial
  screen-reader table is removed. `homeCompact` shows the selected/leading role
  and a remainder count based on the full set.
- Transparent targets are 44px-equivalent at both 296px and compact 212px
  render heights and remain wholly inside each viewBox. Each side receives the
  same view-aware horizontal expansion needed by its largest edge target, so
  posterior arm targets are not clipped and the body remains centred.
- Motion is one 220ms opacity/4px signed horizontal transition with separate
  front/back keyframes that both end at the visible resting state. Reduced
  motion disables animation and transitions. Role treatment remains distinct
  without color alone; deep-guide dots are an additional, orthogonal cue.
- Semantic anatomy-context tokens produce measured dark-theme contrast of
  3.97:1 fill / 5.84:1 stroke and light-theme contrast of 3.84:1 fill / 5.91:1
  stroke. The renderer consumes those tokens without hard-coded white/black or
  `color-mix` assumptions.

## Localization contract

- Dedicated grammatical front and back summary sentences report visible roles
  and the total exercise activation count. Role-action labels are also complete
  locale-owned front/back sentences; they are no longer assembled by inserting
  translated fragments into an English-shaped template.
- Deep guides use a stable localized noun phrase (for example, “Deep
  location”), followed by locale-owned explanatory copy rather than adjective
  composition.
- All new summary, side-tag, role-action, surface, and deep-guide keys are in
  `EXERCISE_PICKER_COPY_KEYS` and in the exact eight-locale completeness test.
- Rendered front summary, back summary, and selected deep-guide sentences are
  asserted verbatim for English, Spanish, Greek, German, French, Italian,
  Dutch, and Portuguese.

## Verification

Passed:

```text
NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/workout/atlas-geometry.test.ts tests/components/muscle-atlas.test.tsx tests/components/muscle-atlas-theme.test.ts tests/i18n/exercise-picker-copy.test.ts
npx eslint components/workout/MuscleAtlas.tsx lib/workout/atlas-geometry.ts tests/components/muscle-atlas.test.tsx tests/components/muscle-atlas-theme.test.ts tests/components/exercise-detail-v3.test.tsx tests/workout/atlas-geometry.test.ts tests/i18n/exercise-picker-copy.test.ts lib/i18n.tsx lib/locales/de.ts lib/locales/fr.ts lib/locales/it.ts lib/locales/nl.ts lib/locales/pt.ts
npm run typecheck
git diff --check
npm ls body-muscles --depth=0
```

An eight-file atlas/consumer verification passed 84 tests, including the V3
exercise-detail and workout-home consumers.

The current branch still has three independently reproducible unrelated stale
consumer assertions: `exercise-picker-atlas.test.tsx` expects the superseded V2
bench poster while the accepted resolver returns the V3 poster, and two
`workout-home-v2.test.tsx` cases expect labels no longer supplied by that test's
mock localization dictionary. The atlas consumer ambiguity introduced by the
new complete role action was repaired with a more precise map-region assertion;
`workout-home-v3.test.tsx` passes all 15 tests.

`npx next build --webpack` compiled the app and passed TypeScript before
prerendering later failed on the existing missing `NEXT_PUBLIC_SUPABASE_URL`.
The normal `npm run build` prebuild is blocked by the unrelated untracked
`public/sw 2.js` safeguard. Emitted chunk inspection found 0 occurrences of
`BodyChart`, `body-chart-container`, `feGaussianBlur`, or `url(#glow)` and two
data-only atlas chunks containing the mapped path IDs.

## Visual QA limitation

The local dev server started, but the available route returned HTTP 500 without
the required Supabase environment variables. Therefore no trustworthy light/
dark 320px or 390px application screenshots could be captured in this worktree.
The SVG sizing/hit-bound tests cover the 296px and compact 212px render sizes;
live visual screenshots should be captured once the local environment is
configured.

## Known limitations

`body-muscles` ships missing source-map source files, so Vitest logs source-map
warnings while running the imported data. This does not affect its data, the
renderer, typechecking, or production compilation.
