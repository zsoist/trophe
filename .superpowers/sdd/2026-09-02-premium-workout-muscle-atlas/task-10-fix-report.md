# Task 10 fix — decoded motion verification

## TDD evidence

- RED: the quality test first requested an isolated decoder-validator module and failed with `Cannot find module ...workout-v3-media-validation.mjs`.
- GREEN: the new validator decodes every shipped WebM and the focused quality test passes all 17 cases.

## Mechanical contract

`node scripts/visual/build-workout-v3-media.mjs --check` now requires FFmpeg and ffprobe with actionable availability errors. For every one of the 16 shipped loops it verifies:

- VP9 codec, 960×540 decoded dimensions, 2 fps, exact 2-second duration, and four decoded frames;
- decoded-pixel `framemd5` evidence that setup/work/finish are pairwise distinct and fourth frame exactly equals work;
- actual SHA-256 for source/master/poster/motion matches the manifest;
- source native dimensions agree with both provenance and manifest; 3840×2160 masters are still truthfully marked `deterministic-upscale`.

The quality test independently recomputes all four checksum classes and decodes all loops. Its temporary, non-worktree fixtures prove rejection for repeated-phase VP9, wrong-codec, wrong-size, corrupt, and hash-mismatched media. No tracked media file is overwritten during the negative test.

## Result

The motion encoder now uses lossless VP9 frames so the fourth decoded work frame is pixel-identical to the second while preserving all declared 900 kB per-loop budgets. Manual review booleans remain present as human visual evidence; the mechanically testable video and integrity claims no longer rely on them.

## Verification

- `node scripts/visual/build-workout-v3-media.mjs --check` — pass (all 16 records).
- Focused V3/V2 quality and resolver tests — pass (145 tests).
- Targeted ESLint, paid-AI guard, prompt provenance scan, and `git diff --check` — pass.
- `npx tsc --noEmit` was run and remains blocked by unrelated in-progress Task 10b files which import the absent `components/workout/MuscleAtlas` and use untyped callbacks; no Task 10 fix file caused a TypeScript diagnostic.
