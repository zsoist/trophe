# Task 10b final fix re-review

**Base:** `1c56a73ddf042c326e61b1a7444ff8dfd2f9e259`

**Fix reviewed:** `d545fc49868b5ad10681459fb15d81bed8d90201`

**Verdict:** `CLEAN`

The final fix closes the compact target clipping, bilateral forearm ownership,
and complete role-action localization findings without reopening the atlas's
settled anatomy, truthfulness, role semantics, contrast, motion, accessibility,
or performance contracts.

## Target size, viewport, and visual-fit evidence

`atlasViewportFor()` adds symmetric horizontal room while preserving the
93-unit vertical viewBox and the committed 296 px / 212 px figure heights. An
independent geometry scan produced:

| Mode | View | ViewBox | Target diameter | Body scale basis | SVG width |
| --- | --- | --- | ---: | ---: | ---: |
| Full | Front | `0 0 35 93` | 44.56 px | 111.40 px | 111.40 px |
| Full | Back | `32 0 45 93` | 44.56 px | 111.40 px | 143.23 px |
| Compact | Front | `-3 0 41 93` | 45.59 px | 79.78 px | 93.46 px |
| Compact | Back | `29 0 51 93` | 45.59 px | 79.78 px | 116.26 px |

Every target union is inside its actual viewBox at both rendered sizes. Because
the viewBox height and CSS height remain unchanged, the body keeps the same
visual scale; the correction adds side breathing room instead of shrinking the
anatomy. In a real Chromium 320 px viewport with 16 px gutters, every SVG stayed
well inside the 288 px content width with no horizontal overflow. Published
front/back silhouettes retained their full head-to-foot bounds (approximately
0.07 px from the top through 210.97 px compact, and 0.09 px through 294.65 px
full) without clipping.

The parameterized component assertion independently checks every rendered hit
centre against the emitted front/back viewBox at both 296 px and 212 px, and
checks the converted diameter is at least 44 px. The view expansion is stable
per side rather than activation-order-dependent, so changing the highlighted
exercise does not move or rescale the body.

## Real pointer ownership evidence

The four published `body-muscles@1.0.0` forearm interiors were exercised in
headless Chromium using browser hit testing and real mouse gestures:

- left extensor `(39,35)` → `forearm-extensors-left`;
- left flexor `(41,35)` → `forearm-flexors-left`;
- right flexor `(64,35)` → `forearm-flexors-right`;
- right extensor `(66,35)` → `forearm-extensors-right`.

`document.elementFromPoint()` returned the expected published contour and
owner at all four coordinates with the DOM order forward and reversed. Each
real `mouse.click()` produced exactly one owner callback. The component tests
also exercise the two event paths directly: painted contours defer pointer-up
to their exact enclosing accessible region and select once on click, while the
surrounding transparent plane invokes the deterministic SVG-coordinate
resolver once. Reversing activation order preserves all four results. No
painted contour remains `pointer-events: none`, and constituent paths remain
non-focusable within one focusable control per muscle.

## Role-action and locale evidence

Front and back role actions are now separate locale-owned sentences rather than
an English-shaped side fragment. The rendered component test asserts exact
front-primary and back-secondary actions in EN, ES, EL, DE, FR, IT, NL, and PT.
The existing region-label matrix covers primary, secondary, and stabilizer role
noun phrases in the same eight languages.

An additional inventory probe composed all 48 role-action combinations (eight
locales × three roles × two views): every sentence resolved without leaked
placeholders. All 110 `EXERCISE_PICKER_COPY_KEYS` resolved in every locale, the
inventory had no duplicate keys, and both new action keys are explicitly in the
completeness set. No runtime use of the superseded fragmented action key
remains.

## Preserved contracts

- All 26 named regions remain explicit: 23 exact licensed surface mappings and
  three visibly/accessibly identified deep-location guides.
- Fine published distinctions, posterior triceps, source-kind metadata,
  package pin/integrity, Apache-2.0/NOTICE attribution, OpenStax rationale, and
  non-diagnostic wording remain unchanged.
- One complete cross-side semantic role list, controlled view switching,
  click/Enter/Space behavior, `aria-pressed`, unique summaries, and focus-only
  non-selection remain covered.
- Primary solid, secondary patterned/stroked, stabilizer dashed, selected
  non-color emphasis, and orthogonal deep-guide styling remain distinct.
- Neutral anatomy context remains above 3:1 in both themes. The 220 ms signed
  side transition ends fully visible; reduced motion remains fully static. No
  glow, pulse, bounce, filter, perpetual animation, or 3D spin was introduced.
- The renderer remains React-owned and data-only: no `BodyChart`, runtime fetch,
  unsafe HTML, copied body image, or AI anatomy path.

## Verification

Passed:

```text
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  tests/workout/atlas-geometry.test.ts \
  tests/components/muscle-atlas.test.tsx \
  tests/components/muscle-atlas-theme.test.ts \
  tests/i18n/exercise-picker-copy.test.ts \
  tests/components/exercise-detail-v3.test.tsx \
  tests/components/workout-atlas-home-i18n.test.tsx \
  tests/workout/anatomy.test.ts \
  tests/components/workout-home-v3.test.tsx
# 8 files passed, 84 tests passed

npx eslint components/workout/MuscleAtlas.tsx \
  lib/workout/atlas-geometry.ts \
  tests/components/muscle-atlas.test.tsx \
  tests/components/muscle-atlas-theme.test.ts \
  tests/components/exercise-detail-v3.test.tsx \
  tests/workout/atlas-geometry.test.ts \
  tests/i18n/exercise-picker-copy.test.ts \
  lib/i18n.tsx lib/locales/de.ts lib/locales/fr.ts lib/locales/it.ts \
  lib/locales/nl.ts lib/locales/pt.ts

npm run typecheck
git diff --check 1c56a73..d545fc4
npm ls body-muscles --depth=0
# body-muscles@1.0.0
```

The isolated Chromium pass supplements rather than replaces the already noted
application-route visual-QA limitation caused by missing local Supabase
environment variables. The later full screenshot matrix remains correctly
owned by Task 12. The Impeccable detector was not run; Task 12 retains its
single authorized detector pass.

No implementation files were edited during this re-review.
