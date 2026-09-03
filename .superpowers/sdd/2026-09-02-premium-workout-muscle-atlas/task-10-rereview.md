# Task 10 re-review — decoded motion verification

**Result: CLEAN**

Reviewed `97efe84f666314cdc6129ea269a8a60eb9cc0c64` against
`040d893` without changing implementation.

## P1 disposition

The original P1 is closed. The shared decoder-backed validator invokes
`ffprobe -count_frames` and FFmpeg `framemd5` for every shipped V3 WebM. It
requires VP9, decoded 960x540 dimensions, exactly 2 fps, a two-second duration,
and exactly four frames. It rejects non-distinct setup/work/finish decoded
frames and requires frame four to equal frame two exactly.

The media build check regenerates the expected records from decoded output and
compares the full manifest, while also recomputing SHA-256 values for source,
master, poster, and motion, checks native source dimensions against provenance
and manifest, and confirms the 3840x2160 master is truthfully labelled
`deterministic-upscale`.

The focused Vitest suite independently recomputes the same four checksum
classes and decodes every shipped motion asset. Its repeated-frame, wrong-codec,
wrong-size, corrupt-media, and hash-mismatch cases are created under a unique
`mkdtempSync()` directory in the system temporary directory and deleted in a
`finally` block; they do not overwrite tracked media and are safe for concurrent
runs.

## Evidence

- `node scripts/visual/build-workout-v3-media.mjs --check` — pass: `Validated 16 workout-v3 media records.`
- `NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/workout-v3-asset-quality.test.ts` — pass: 1 file, 17 tests.
- `git diff --check 040d893..97efe84f666314cdc6129ea269a8a60eb9cc0c64` — pass.
- Manifest inspection confirms 16 assets, all VP9 at 960x540 / 2 fps / 2 seconds, with `setup`, `work`, and `finish` decoded hashes pairwise distinct and frame four equal to frame two; every master is labelled `deterministic-upscale`.

## Scope

The worktree contains concurrent Task 10b component, locale, geometry, package,
and untracked-asset changes. They are outside this fix diff and were preserved;
they do not affect the Task 10 decoder validation files reviewed here.
