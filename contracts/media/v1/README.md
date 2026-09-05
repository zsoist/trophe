# Media package v1

`manifest.schema.json` is byte-identical to the R1 distributed schema. AG1 owns this interface; incompatible changes require a new version and AG2 coordination.

Run `node scripts/media/validate-package.mjs /absolute/private/package` from the repository. Publication additionally requires `--publication /absolute/private/reviews.json`. Do not put originals, reviews, licenses or credentials in the checkout. Candidate packages are not publication approvals.

The artifact roster is a UTF-8 JSON array, sorted by ASCII path. Each entry has exactly these keys in this insertion order: `path`, `sha256`, `bytes`. JSON has no whitespace or trailing newline. SHA-256 hashes those bytes. File hashes are computed independently over the actual bytes. Tests use synthetic gray images in temporary directories; they are never production technique media.

Publication evidence is loaded separately by the operator from `reviews/`. It contains `reviews` (the matching review fields plus a nonempty `decision_source` identifying the human decision/evidence) and `licenses` (`reference`, `redistribution_allowed: true`, `artifact_set_sha256`, `decision_source`). The operator must inspect the real records, permissions and reviewer designation; JSON cannot prove a human's identity. Agents must not invent records. Every passed review must bind to the current roster hash.

Intake enforces schema, exact exercise/equipment identity from `EXERCISE_MEDIA_REGISTRY`, path/file allowlists, no symlinks, no undeclared payload, SHA-256, sizes, image decode, video format/codec/dimensions/fps/duration and sample decode. It never runs code from a package. GLB is explicitly held pending deformable geometry validation and device QA; do not label a candidate GLB approved because its header is valid.

Current catalogue identities: `curl` / `Standing Dumbbell Biceps Curl` / `Dumbbell`; `bench-press` / `Barbell Bench Press` / `Barbell`; `squat` / `Barbell Back Squat` / `Barbell`. Temporal labels use existing localized keys `workout.detail_phase_setup`, `workout.detail_phase_work`, `workout.detail_phase_finish`. No medical/anatomical claims are inferred from media.

Video activation is off unless `NEXT_PUBLIC_WORKOUT_MEDIA_V4=1` and a reviewed record is committed in `APPROVED_VIDEO_RELEASE`. That list ships empty. Unknown/incompatible records fall back to the previous release. Publish only approved derivatives under immutable `public/workout-v4/<build_key>/` paths, with manifest/checksums in the same PR. Never replace bytes under an existing URL. Revert the application release or rebuild with the flag off for rollback; do not alter workout data or migrate the database as a media rollback.

The legacy static adapter now requires equipment, matching the canonical resolver. Missing or mixed equipment falls back to anatomy instead of guessing. No 3D library or model is downloaded by this change.

## Local preview and staged release

`node scripts/media/preview-package.mjs /private/candidate` validates the package, bundles the real `ExerciseMotion` and eight-locale provider, then serves an in-memory snapshot on an ephemeral `127.0.0.1` port. Host/Origin checks, no-store, CSP and an exact asset allowlist prevent network publication and arbitrary file access. The candidate tier is accepted only with the reviewer-only prop; normal consumers cannot claim verified technique from it. This is an isolated component preview, not authenticated full-app E2E or production bundle measurement. The small esbuild dependency is dev-only.

`node scripts/media/prepare-release.mjs PACKAGE PRIVATE_EVIDENCE NEW_OUTPUT_DIRECTORY` validates publication gates and stages immutable derivatives, sanitized public manifests, checksums and activation records. It refuses existing output, rechecks source hashes during copying and does not deploy. Human review records stay private. Inspect/copy the staged release in an ordinary reviewed PR only after G3. GLB and final candidate promotion remain blocked on their own gates.

## Private VISUAL-02 inspection

The same loopback preview exposes candidate identity/build/video and manifest hashes, pause, approximate timeline seeking, 0.25x/0.5x/1x playback, zoom/pan and reset below the image. HTTP byte ranges support actual browser seeks; these are not frame-exact exports. Reduced motion retains the real component's poster behavior. This operator UI is bundled only by the private script and is not imported by the live logger.

Use `--before PRIVATE_PREVIOUS_PACKAGE` for an independently validated previous version and `--review-evidence PRIVATE_INDEX.json` for declared diagnostics outside both packages. The private sidecar is `{ "version": "trophe.private-review/1", "items": [...] }`; it does not extend the frozen publication schema. Each render-export item declares `path` relative to the index, `bytes`, `sha256`, `label`, `category`, `source_kind: "render_export"`, `source_sha256` (video), `build_key`, `asset_id`, `release_id`, `frame_index` or `pts_seconds`, and `recipe_ref`. Source identity must match one of the loaded packages. Index/PTS/recipe remain attributed to the exporter; inspecting a hash is not proof of geometry or technique.

Unlinked recording images instead declare `source_kind: "screen_recording"`, `source_sha256`, `binding_status: "unverified"`, and `recording_seconds`. They display as unlinked recording evidence, never as an HD source render or master-clip PTS. Image derivatives allow PNG/WebP/JPG, 8 MiB each, 4096² pixels, 64 entries/64 MiB total; symlinks, traversal and hash/MIME mismatches fail closed. Candidate snapshots are separately capped at 64 MiB. Evidence stays private and the viewer does not create human approvals or publication records.
