# Task 10b — anatomically contoured muscle atlas report

## Outcome

Replaced the geometric block atlas with a React-owned, interactive front/back
SVG renderer using the pinned `body-muscles@1.0.0` data only. The atlas now
uses 23 licensed surface mappings and three explicitly marked deep-location
guides (`rotator-cuff`, `rhomboids`, and `brachialis`). No imperative
`BodyChart`, runtime fetch, unsafe HTML, glow, or AI anatomy is used.

## TDD evidence

RED was recorded before the renderer change:

```text
tests/components/muscle-atlas.test.tsx
Unable to find an element by: [data-testid="atlas-region-pectoralis-major"]
```

The test required a published-source marker and deep-guide distinction that the
former geometric atlas did not expose. A second RED for the independent map
contract failed because `@/lib/workout/atlas-geometry` did not yet exist.

GREEN command:

```text
npx vitest run tests/components/muscle-atlas.test.tsx tests/workout/atlas-geometry.test.ts tests/workout/anatomy.test.ts
3 passed, 22 passed
```

The new tests independently assert all 26 regions, the 23/3 source split,
fine-grained published path IDs, deep-guide DOM contract, canonical posterior
views, interaction, and the minimum hit geometry.

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
- `THIRD_PARTY_NOTICES.md` records `body-muscles` 1.0.0, its exact npm
  integrity, Apache-2.0 license, NOTICE attribution, source URL, and renderer
  modifications. It also records the OpenStax/Wikimedia provenance links used
  for non-diagnostic guide wording.

## Accessibility, motion, and themes

- One focusable `<g role="button">` is rendered per region; its constituent
  paths are not focusable. Click, Enter, and Space activate it; focus alone
  does not select it.
- Controls use `aria-pressed`; controlled selections intentionally cross views.
  A unique `useId`-derived summary connects each figure to localized selected
  role/source information, and a screen-reader table accompanies the semantic
  role list.
- Transparent circular targets are 44px-equivalent at both 296px and compact
  212px render heights and remain inside each viewBox.
- Motion is one 220ms opacity/4px signed horizontal transition with separate
  front/back keyframes that both end at the visible resting state. Reduced
  motion disables animation and transitions. Role treatment remains distinct
  without color alone; deep-guide dots are an additional, orthogonal cue.
- CSS uses existing surface/content/performance tokens, with no hard-coded
  white/black body assumptions.

## Verification

Passed:

```text
npx vitest run tests/components/muscle-atlas.test.tsx tests/workout/atlas-geometry.test.ts tests/workout/anatomy.test.ts
npx eslint components/workout/MuscleAtlas.tsx lib/workout/atlas-geometry.ts lib/workout/anatomy.ts tests/components/muscle-atlas.test.tsx tests/workout/atlas-geometry.test.ts tests/workout/anatomy.test.ts
npm run typecheck
git diff --check
```

The wider atlas consumer run passed all atlas/anatomy/home/detail/localization
tests except an unrelated concurrent media assertion in
`exercise-picker-atlas.test.tsx`: it expects `/workout-v2/exercises/bench-press.webp`
while the current media resolver returns `/workout-v3/posters/bench-press.webp`.
That file was not edited for this task.

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
