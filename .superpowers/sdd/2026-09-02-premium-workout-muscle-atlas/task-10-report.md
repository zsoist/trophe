# Task 10 — verified premium motion media

## Evidence

- RED: `npx vitest run tests/components/workout-v3-asset-quality.test.ts` failed before implementation because `public/workout-v3/manifest.json` did not exist.
- GREEN: `node scripts/visual/build-workout-v3-media.mjs --check` validates all 16 source/provenance/master/poster/motion records and fails when files, byte budgets, prompt provenance, or manifest output are stale.
- GREEN: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/workout-v3-asset-quality.test.ts tests/components/workout-asset-quality.test.ts tests/workout/exercise-media.test.ts tests/components/workout-asset-resolver.test.ts` passed: 144 tests.
- GREEN: prompt provenance scan found `48 rasters, 0 missing`.
- GREEN: `npx tsc --noEmit`, targeted ESLint, and `git diff --check` passed. (The project ESLint configuration ignores the media build script; it reported no error.)

## Cohort and media contract

All records were generated with the built-in image generation tool, one distinct call per exercise (with one targeted replacement for the initially rejected machine chest press). Every accepted source is a neutral-light, three-phase contact sheet: setup, controlled work, finish. The build splits real source panels into a 2 fps ping-pong `setup → work → finish → work` WebM; it does not pan or zoom a still.

| Slug | Source native | Master | Poster / motion bytes |
| --- | --- | --- | --- |
| bench-press | 2172×724 | 3840×2160 | 10,726 / 23,346 |
| incline-press | 2167×725 | 3840×2160 | 12,822 / 26,169 |
| smith-bench-press | 1823×863 | 3840×2160 | 12,346 / 24,785 |
| machine-chest-press | 1774×887 | 3840×2160 | 16,170 / 34,598 |
| floor-press | 1774×887 | 3840×2160 | 5,790 / 12,532 |
| pec-deck | 1693×929 | 3840×2160 | 14,300 / 30,605 |
| cable-fly | 1774×887 | 3840×2160 | 15,742 / 31,863 |
| push-up | 1774×887 | 3840×2160 | 6,316 / 14,653 |
| dip | 1731×909 | 3840×2160 | 7,980 / 16,471 |
| pull-up | 1536×1024 | 3840×2160 | 9,492 / 18,450 |
| row | 1672×941 | 3840×2160 | 9,254 / 20,618 |
| overhead-press | 1691×930 | 3840×2160 | 7,648 / 14,746 |
| curl | 1536×1024 | 3840×2160 | 7,404 / 14,900 |
| triceps-extension | 1536×1024 | 3840×2160 | 9,864 / 18,328 |
| squat | 1774×887 | 3840×2160 | 9,342 / 20,095 |
| deadlift | 1774×887 | 3840×2160 | 9,204 / 20,604 |

The masters are 8,294,400-pixel WebP canvases produced by deterministic contain-resampling from the native generated source panels. They are not native 4K captures. All records report `resampling: "deterministic-upscale"` truthfully. Each uses a 12% declared safe margin and `object-position: 50% 50%`; contain-resampling preserves full body and equipment at 320px and above.

## Review truth table

Every one of the 16 rows records `exerciseIdentity`, `equipmentIdentity`, `setupPhase`, `workPhase`, and `finishPhase` as `true` in its provenance sidecar and manifest. Machine chest press references only the corrected v2 source; the rejected first generation was removed and is not referenced.

## Provenance and activation

- Exact prompts: `assets/workout-v3/provenance/<slug>.json`; raster-verifier sidecars sit adjacent to each source/master/poster/motion file.
- Optimized assets: `public/workout-v3/posters/*` and `public/workout-v3/motion/*` ship. `assets/workout-v3` is excluded from Vercel with the sources and masters.
- `resolveExerciseMedia()` selects V3 only after its existing canonical-name and compatible-equipment checks pass. It serves `/workout-v3/posters/<slug>.webp` and `/workout-v3/motion/<slug>.webm`, otherwise preserves the V2 anatomy/fallback path. The row remains constrained to `Seated Cable Row` plus `Cable`; barbell and dumbbell rows do not activate V3.

## Honest limitations

The media demonstrates generated, visually reviewed technique phases, not medical or anatomical authority. Curated code-native muscle activations remain authoritative. Generated native source resolutions vary and are below 4K; masters are deterministic upscales. Three-frame, two-second loops are intentionally minimal and require the existing player controls/reduced-motion poster path for presentation behavior.

## Motion-verification fix

The media checker now decodes every shipped WebM with `ffprobe` and FFmpeg `framemd5`. It requires VP9, 960×540, 2 fps, two seconds, exactly four decoded frames, pairwise-distinct setup/work/finish decoded pixels, and a fourth decoded frame exactly equal to work (`setup → work → finish → work`). It recomputes source/master/poster/motion SHA-256 values against the checked-in manifest, validates native source dimensions against provenance, and rejects an untruthful source/master resampling declaration. Clear install guidance is emitted when FFmpeg or ffprobe is unavailable.
