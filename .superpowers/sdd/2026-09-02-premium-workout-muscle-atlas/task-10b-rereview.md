# Task 10b fix re-review

**Base:** `c8f04b5968b1eefb2010935fa0b7a4380ba71e72`

**Fix reviewed:** `1c56a73ddf042c326e61b1a7444ff8dfd2f9e259`

**Verdict:** `CHANGES_REQUESTED`

The fix closes the incomplete-role, neutral-context contrast, grammatical
front/back summary, deep-guide wording, and locale-key coverage findings. The
new SVG-coordinate resolver also produces one deterministic owner independent
of activation order. Two release-significant touch-geometry defects remain,
however, including one that the report currently claims is covered. The new
role-action accessible sentence also needs one final localization correction.

## Findings

### P1 — Compact mode clips the advertised 44 px targets for 15 hit centres

**Evidence:** `components/workout/MuscleAtlas.tsx:71` increases the atlas radius
from 7 to 10 when `homeCompact` is true. At the committed compact height of 212
px, that radius is correctly about 22.8 CSS px, but many centres are less than
10 SVG units from a horizontal viewBox edge. For example, biceps uses x=7 and
x=28 in the front `0..35` viewBox, and posterior deltoid uses x=44 and x=65 in
the back `37..72` viewBox (`lib/workout/atlas-geometry.ts:49,56`). Their circles
extend to x=-3/38 and x=34/75 respectively. The interaction plane itself ends
at the viewBox edge (`components/workout/MuscleAtlas.tsx:103`), so the clipped
portion is not an actionable extension of the SVG.

An independent bounds scan found 15 clipped compact centres across anterior
deltoid, middle deltoid, posterior deltoid, biceps, triceps, both forearm
groups, and quadriceps. A biceps side, for example, exposes only about 38.7 CSS
px of its nominal 45.6 px horizontal target. The existing bounds test at
`tests/components/muscle-atlas.test.tsx:184-205` renders only the default
296 px / radius-7 configuration; it never renders `homeCompact`. This conflicts
with both the brief's compact/full in-bounds contract and the implementation
report's statement that both sizes are covered.

**Impact:** Several muscles on the compact Workout Home atlas fall below the
required intact touch area exactly where one-handed mobile use needs it most.

**Required fix:** Keep every effective compact target inside its viewBox—by
using in-bounds centres/shape unions or an equivalent resolver region that
retains a real 44 px target—and parameterize the bounds test over the 296 px
full and 212 px compact renders.

### P1 — The left forearm extensor contour resolves to flexors

**Evidence:** The published `forearm-extensors-left` contour occupies roughly
x=37.998..40.625 around y=35, while `forearm-flexors-left` occupies roughly
x=39.814..42.870. The committed resolver centres are nevertheless `[44,35]`
for flexors and `[45,35]` for extensors
(`lib/workout/atlas-geometry.ts:59-60`), both to the right of the actual left
extensor contour. At SVG point `[39,35]`—inside the extensor contour and outside
the flexor contour—`resolveAtlasHit(['forearm-flexors',
'forearm-extensors'], 'back', [39,35], 7)` returns
`forearm-flexors`. Points `[40,35]`, `[41,35]`, and `[42,35]` do too.

The focused test at `tests/workout/atlas-geometry.test.ts:49-50` proves only
that each self-authored centre wins at its exact coordinate. Its claimed
extensor point `[45,35]` is not on the published left extensor path, so it does
not establish bilateral contour ownership. Ordering is deterministic, but the
left visual contour is still owned incorrectly.

**Impact:** In a forearm exercise that activates flexors and extensors, tapping
the visible left extensor anatomy selects the wrong muscle. The extensor remains
reachable on the opposite arm, so superficial tests pass while bilateral use
does not.

**Required fix:** Align each side's flexor/extensor zones to points inside the
actual published paths and add assertions using known interior SVG coordinates
on both arms. Preserve the current canonical tie-breaking and exactly-one
selection behavior.

### P2 — Role-action accessible copy is still template-fragmented

**Evidence:** `workout.atlas_role_action` is present in all eight dictionaries,
but its rendered English name is, for example, `Show Pectoralis major: primary
muscle, Front`; German renders `Großer Brustmuskel anzeigen: primärer Muskel,
Ansicht Vorderseite`. The capitalized side fragment in English and `Ansicht
Vorderseite` construction in German are not complete natural-language
instructions. The eight-locale render test at
`tests/components/muscle-atlas.test.tsx:243-262` covers summaries/deep copy, and
the region-label matrix covers role nouns, but no test renders the newly added
role-action sentence in all locales.

**Impact:** Screen-reader users hear noticeably machine-composed navigation
copy in the exact cross-side action introduced by this fix.

**Required fix:** Make each locale own the full natural action phrase (for
example, English `Show Pectoralis major, primary muscle, in front view` and
German with `Vorderansicht`/`Rückansicht`) and render/assert representative
front/back action names in all eight locales.

## Prior findings now closed

- **Complete role story:** full mode exposes one semantic list containing every
  activation with Front/Back tags; choosing an opposite-side item changes the
  figure and calls `onSelect`. `homeCompact` reports the remainder from the full
  activation set rather than only the visible side.
- **Exactly-one pointer behavior:** actual pointer-up coordinates are converted
  through `getScreenCTM` (with a bounded fallback), the resolver returns one
  scalar owner, and the interaction hit shapes themselves do not emit an
  additional pointer click. The component assertion records one callback.
- **Order independence:** nearest-distance scoring plus canonical-ID tie-break
  returns the same owner when activation order is reversed.
- **Contrast:** independent WCAG luminance calculation gives dark fill/stroke
  3.97:1/5.84:1 and light fill/stroke 3.84:1/5.91:1 against the actual atlas
  context surfaces.
- **Summary/deep copy:** dedicated front/back sentences and stable deep-location
  noun phrases render correctly in EN/ES/EL/DE/FR/IT/NL/PT, and every new key is
  in `EXERCISE_PICKER_COPY_KEYS` and the eight-locale presence guard.
- **Anatomy truth:** all 26 IDs remain explicit: 23 licensed surface mappings
  and exactly three visibly/accessibly identified deep-location guides. Fine
  path distinctions and posterior triceps remain intact.
- **Licensing/provenance:** `body-muscles` remains exactly pinned to 1.0.0 with
  the expected SHA-512 integrity, Apache-2.0/NOTICE attribution, source and
  modification notice. No copied body photo, AI anatomy, runtime fetch,
  `dangerouslySetInnerHTML`, imperative `BodyChart`, or glow/filter path was
  introduced.
- **Motion and focus:** front/back transitions are separate 220 ms opacity/4 px
  transforms that end fully visible; reduced motion removes animation and
  transitions. One focusable group exists per muscle, constituent paths are not
  focusable, focus alone does not select, and Enter/Space/click remain covered.
- **Performance:** geometry is module-level data, selection work is bounded to
  the small active set, and the package remains side-effect-free/zero-runtime-
  dependency. The implementation report's emitted bundle scan found only the
  data chunks and no `BodyChart`/glow symbols.

## Verification evidence

- Focused atlas/anatomy/detail/home/i18n run: **8 files, 71 tests passed**.
- Targeted ESLint: **passed**.
- `npm run typecheck`: **passed**.
- `git diff --check`: **passed**.
- `npm ls body-muscles --depth=0`: exact `body-muscles@1.0.0`.
- Wider consumer check: **59 passed, 3 known stale assertions failed** (one V2
  poster expectation and two V2 mock-copy expectations); none is caused by the
  Task 10b fix.
- Live authenticated screenshot QA remains unavailable for the already
  documented missing local Supabase environment. This re-review therefore does
  not upgrade the report's visual-QA limitation.

No implementation files were edited during this re-review.
