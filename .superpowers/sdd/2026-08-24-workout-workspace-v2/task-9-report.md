# Task 9 report — premium static workout artwork

## Delivered

- Accepted and integrated all 20 supplied Imagegen originals after original-detail inspection: eight anatomy/cardio assets and twelve exact technique assets.
- Preserved accepted original copies at `assets/workout-v2/sources/<slug>.png`; retained the external generated sources untouched.
- Generated honest Sharp Lanczos3 + restrained-sharpening alpha WebP masters: anatomy/cardio at 2160×3240, techniques at 3240×2160. The manifest explicitly records each original source dimension and `master.upscaled: true` rather than describing the generated 1024×1536 assets as native 4K.
- Generated metadata-free alpha WebP display derivatives (640×960 anatomy/cardio at quality 84; 1280×853 technique at quality 86), each under the 450,000-byte budget.
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

## Fix round 1 — deterministic alpha/runtime payload closure

- Replaced the accepted canonical `chest` and `squat` sources; both were re-inspected at original detail. Chest now keeps the primary chest region distinct with real frame margin; squat includes the athlete, complete rack, and bar endpoints.
- Moved the 20 accepted original PNGs to `assets/workout-v2/sources/` and the 20 high-resolution 2160×3240 / 3240×2160 masters to `assets/workout-v2/masters/` as high-quality alpha WebPs. `public/workout-v2/` now contains only the 20 runtime WebPs and manifest; `.vercelignore` excludes the build-only directory.
- The optimizer reads only those checked-in originals. It deterministically removes the warm studio matte, pads an alpha canvas by 12%, records separate source/output margins, decodes every image, verifies alpha/opaque content/dimensions/size, recomputes the full manifest, and validates SHA-256 hashes for source/master/display. It also has an explicit two-pass byte-idempotence probe.
- Actual sizes: source PNGs 32,737,079 bytes; high-resolution master WebPs 5,194,800 bytes; public runtime payload including manifest 777,330 bytes (under the 2 MiB deployment cap).
- Composite inspection passed on light and graphite-dark surfaces for the replacement chest and squat plus cable fly: all retain the complete subject/equipment while the dark graphite field is visibly exposed through alpha.
