# Task 9 report — premium static workout artwork

## Delivered

- Accepted and integrated all 20 supplied Imagegen originals after original-detail inspection: eight anatomy/cardio assets and twelve exact technique assets.
- Preserved an accepted original copy at `public/workout-v2/masters/sources/<slug>.png`; retained the external generated sources untouched.
- Generated honest Sharp Lanczos3 + restrained-sharpening masters: anatomy/cardio at 2160×3240, techniques at 3240×2160. The manifest explicitly records each original source dimension and `master.upscaled: true` rather than describing the generated 1024×1536 assets as native 4K.
- Generated metadata-free WebP display derivatives (640×960 anatomy/cardio at quality 84; 1280×853 technique at quality 86). Largest derivative: 67,260 bytes, under the 450,000-byte budget.
- Added a deterministic optimize/check script and npm commands: `npm run assets:workout:optimize` and `npm run assets:workout:check`.
- Moved the semantic resolver to `/workout-v2`, kept the exact-technique allow-list strict, and preserved ambiguous-name anatomy fallback behavior. Cardio is labelled separately from anatomy.
- Updated `MovementVisual` for centered containment and theme-aware neutral light / raised-graphite surfaces.

## Inspection result

Every mapped source was viewed at original detail. All were accepted: no cropped subject/equipment endpoints, malformed hands/limbs, unsafe load/setup, unreadable background, text, watermark, or flashy/neon styling was found. No replacement request is required.

Representative post-processing inspection covered the chest anatomy WebP, squat technique WebP, and cardio master; containment and full equipment/figure framing were retained.

## Verification

- `npm run assets:workout:optimize`
- `npm run assets:workout:check`
- `npx vitest run tests/components/workout-asset-quality.test.ts tests/components/workout-asset-resolver.test.ts tests/components/personal-best-primitives.test.ts` — 98 passing
- `npm run typecheck`
- `npm run lint` — passed with the repository’s pre-existing 46 warnings and no errors
- `git diff --check`
