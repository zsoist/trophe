# Task 10 review — premium media cohort

**Result: CHANGES_REQUESTED**

## Findings

### P1 — the automated contract does not verify that shipped “motion” is real motion

- [tests/components/workout-v3-asset-quality.test.ts:30](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/tests/components/workout-v3-asset-quality.test.ts:30)–[43](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/tests/components/workout-v3-asset-quality.test.ts:43) only assert manifest strings, reported review booleans, file existence/size, and master width. They never open a WebM, count frames, verify its dimensions/rate, or compare decoded frames.
- [scripts/visual/build-workout-v3-media.mjs:111](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/scripts/visual/build-workout-v3-media.mjs:111)–[122](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/scripts/visual/build-workout-v3-media.mjs:122) likewise validate only existence, prompt sidecars, 8MP master, and byte budgets; [130](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/scripts/visual/build-workout-v3-media.mjs:130) writes declared `durationSeconds`, `frameRate`, and phases without checking the encoded output. `review` is copied directly from the self-authored provenance at [132](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/scripts/visual/build-workout-v3-media.mjs:132).
- Consequently, a one-frame/static (or malformed-but-small) WebM plus matching sidecar/manifest could pass both `--check` and Vitest, violating the no-still-pan/zoom and independently validated phase requirements. Add decoder-backed validation (for example `ffprobe -count_frames` for VP9, 960×540, 2 fps, four frames, then `framemd5`/pixel hashes proving setup/work/finish differ) and make the test recompute checksums/provenance rather than trust manifest flags.

## Verified evidence

- Inspected all 16 native three-panel contact sheets (including the replacement machine chest press): the named movement and matching equipment are visible, each has distinct setup/work/finish poses, neutral plates, and no rejected asset is referenced.
- Decoded every optimized WebM with ffprobe/ffmpeg: each is VP9 960×540 with four distinct decoded frame hashes (`setup → work → finish → work`), so this commit’s shipped loops are genuine panel-derived motion rather than pan/zoom stills.
- Recomputed every source/master/poster/motion SHA-256 against `public/workout-v3/manifest.json`; all 16 records match. All masters are 3840×2160 and honestly label `deterministic-upscale`; all poster/motion assets are below their declared budgets. `.vercelignore` excludes `assets/workout-v3` while optimized public media remains deployable.
- Resolver activation is exact-name plus compatible-equipment gated in [lib/workout/exercise-media.ts:120](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/lib/workout/exercise-media.ts:120)–[145](/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902/lib/workout/exercise-media.ts:145); the V3 paths are selected only after that gate. The video consumer uses a poster-only reduced-motion path and `object-fit: contain` on theme surface variables.

## Commands run

- `node scripts/visual/build-workout-v3-media.mjs --check` — pass (16 records)
- `npx vitest run tests/components/workout-v3-asset-quality.test.ts tests/components/workout-asset-quality.test.ts tests/workout/exercise-media.test.ts tests/components/exercise-motion.test.tsx` — pass (91 tests)
- `npx tsc --noEmit` — pass
- prompt provenance scan — pass (48 rasters, 0 missing)
- paid-AI guard and `git diff --check` — pass
- `npm run build` compiled and type-checked, then stopped at unrelated prerender configuration: required `NEXT_PUBLIC_SUPABASE_URL` is absent.
