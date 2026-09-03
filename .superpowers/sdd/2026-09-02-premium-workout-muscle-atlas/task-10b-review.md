# Task 10b adversarial review

**Commit reviewed:** `c8f04b5968b1eefb2010935fa0b7a4380ba71e72`
**Verdict:** `CHANGES_REQUESTED`

The licensed 23-surface / three-deep-guide split is explicit and truthful, all
published path IDs exist on their declared side, the package is exactly pinned,
and the renderer does not instantiate `BodyChart`, fetch geometry, inject HTML,
or ship the package's glow. The remaining issues are interaction and information
completeness problems that are visible in core workout flows.

## Findings

### P1 — The visual muscles are usually not the actual tap targets, and common targets overlap

**Evidence:** `components/workout/MuscleAtlas.tsx:36-40` makes one transparent
circle the only pointer target while every visible muscle path has
`pointerEvents="none"`. `lib/workout/atlas-geometry.ts:44-69` places that single
circle at the midpoint between bilateral muscles. It also assigns identical
centres to quadriceps/adductors (`[17, 52]`) and forearm flexors/extensors
(`[54, 35]`), and near-identical centres to biceps/brachialis (`[17, 27]` versus
`[17, 26]`). In the curated squat, the later adductor circle completely covers
the quadriceps circle; in bench press, push-up, overhead press, pull-up, row, and
curl, the 44px circles overlap substantially. Published biceps contours are
centred around x=6 and x=25.7, while their only hit circle is centred at x=17,
so tapping much of either highlighted arm does nothing.

**Impact:** On a phone, a user can tap the highlighted anatomy and get no
selection, or select the wrong muscle. Some muscles are pointer-inaccessible in
real exercise combinations despite remaining keyboard-focusable.

**Required fix:** Keep one accessible `<g>` per muscle, but give bilateral and
spatially separated contours multiple transparent hit shapes within that one
control (or an equivalent union), aligned to the visible geometry. Resolve
overlap deterministically so each highlighted muscle has a reachable area. Add
tests that exercise representative points/non-overlap for squat, curl, bench,
and forearms; the current radius/inside-viewBox assertion at
`tests/components/muscle-atlas.test.tsx:141-169` does not establish that the
visible contour is tappable.

### P1 — Switching sides hides part of the exercise's activation story

**Evidence:** `components/workout/MuscleAtlas.tsx:49-50` derives both
`roleActivations` and the compact count from `visibleActivations`. The visible
legend at lines 77-80 and screen-reader table at line 81 therefore contain only
the current side. `tests/components/muscle-atlas.test.tsx:86-95` explicitly
codifies that side-only behavior. A front-view bench press omits triceps and the
rotator-cuff guide; the back view omits pectoralis. The hidden table also repeats
the same partial list already exposed by the semantic `<ul>` instead of adding a
complete equivalent.

**Impact:** Users and assistive-technology users can read an incomplete set of
primary, secondary, and stabilizing roles and may reasonably interpret omitted
muscles as not involved. This contradicts the brief's requirement that the role
list remain complete and understandable when activations cross views.

**Required fix:** Keep the figure side-specific, but make the role summary cover
all activations, grouped or tagged by Front/Back. Selecting a role from the
opposite side should intentionally switch the figure. For `homeCompact`, show the
leading selected role plus a count across the full activation set, not only the
visible side. Expose one complete semantic list/table rather than duplicate
partial semantics.

### P2 — The neutral anatomy context is below non-text contrast in both themes

**Evidence:** `app/globals.css:1758` mixes the neutral body fill at only 13% and
its outline at 35% over `--workout-surface-subtle`. Using the committed theme
values, the isolated contrast is approximately 1.20:1 fill / 1.71:1 stroke in
light mode and 1.26:1 / 1.94:1 in dark mode, below the 3:1 graphical-object
target. Isolated renders at 320px and 390px confirmed that torso, limb, and joint
context becomes very faint, especially around outlined stabilizers.

**Impact:** The colored region remains visible, but users with low vision lose
the body landmarks needed to understand where it sits, reducing the atlas's
informational value.

**Required fix:** Raise the neutral silhouette/outline to a tokenized contrast
that preserves hierarchy while reaching roughly 3:1 for the meaningful body
context in both themes. Recheck primary, secondary, stabilizer, selected, and
deep-guide states at 320px.

### P2 — New summary/deep-guide copy is present in eight locales but not grammatically robust or covered by the completeness contract

**Evidence:** `components/workout/MuscleAtlas.tsx:53-57` inserts the standalone
view-button noun into the summary template. This produces constructions such as
Spanish `Anatomía Frente`, Greek `Ανατομία Μπροστά`, Italian `Anatomia Fronte`,
and similarly awkward compounds in other overlays. The invariant translated
`Deep` adjective can also disagree with plural muscle names. The five new keys
at `lib/i18n.tsx:977-981` are absent from `EXERCISE_PICKER_COPY_KEYS` at
`lib/i18n.tsx:1806-1855`, and tests cover region labels plus only an English deep
string, not the new full summaries across all eight locales.

**Impact:** The exact area introduced to prevent language mixing can still sound
machine-composed, and missing future overlay strings would evade the existing
completeness guard.

**Required fix:** Use dedicated grammatical front/back summary phrases (or
locale-owned descriptors), make the deep marker a stable noun phrase such as
"Deep location" in each locale, add every new key to the completeness set, and
assert rendered summary/deep-guide copy in all eight locales.

## Verification evidence

- Focused atlas/anatomy/detail/home suites: **33 passed**.
- Wider six-file consumer run: **1 unrelated failure** remains in
  `exercise-picker-atlas.test.tsx:193` because it expects the superseded V2
  poster while the current resolver returns the accepted V3 poster.
- Targeted ESLint: passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- `npm ls body-muscles --depth=0`: exact `body-muscles@1.0.0`.
- Emitted client atlas data is about 12 KB gzip across two lazy chunks; no
  `BodyChart`, `body-chart-container`, or glow/filter token was found.
- Isolated exact-geometry renders were inspected at 320px/390px in light/dark,
  including front/back and all three deep guides. These were not authenticated
  application screenshots; app-route visual QA remains blocked by the missing
  Supabase environment noted in the implementation report.

## Positive checks to preserve

- All 26 IDs resolve explicitly: 23 licensed surfaces and exactly three honest
  `deep-location-guide` records.
- Fine distinctions (upper/lower trapezius, gluteus medius/maximus,
  gastrocnemius/soleus, forearm flexors/extensors, tibialis anterior) point to
  exact published IDs on the correct source view.
- The notice preserves version, integrity, Apache-2.0/NOTICE attribution,
  source URL, and the renderer/mapping modifications.
- Keyboard Enter/Space/click, `aria-pressed`, unique summary IDs, restrained
  220ms direction-aware motion, and a fully static reduced-motion branch are
  implemented without glow, pulse, bounce, or 3D motion.
