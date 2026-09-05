# Trophē media factory — execution checkpoint

Run only in a dedicated factory root with private masters and assets, under AG2's physical PC GPU lease. AG1 owns the app, canonical media contract, intake and deployment. Nothing here connects to a database, wakes/suspends a PC or sends notifications.

## Tested boundary

`python3 -m unittest discover -s tests/media-factory -v`

Seven tests cover path/symlink escape, duplicate jobs, foreign directories, incomplete outputs, incorrect hashes and ambiguous remote termination. `boundary.py` is a local helper, not a complete scheduler or a substitute for binary intake.

## Blender recipes

Pinned execution baseline: Blender 5.2.1 LTS, build `9e2066aef7ef`; MPFB 2.0.17 installed as `bl_ext.user_default.mpfb`. Set `BLENDER_USER_RESOURCES` to the factory's private preferences and `TROPHE_FACTORY_ROOT` to its existing root. Invoke with `blender --background --python-exit-code 17 --python SCRIPT`.

Recipes currently expect the private, official `makehuman_system_assets_cc0.zip` and preceding stage names. Every stage creates a fresh output directory and refuses to replace an existing directory. Preserve failed stages; use a new stage id for corrections.

- `build_athlete.py`: MPFB male body, compatible game-engine rig, neutral clothing and pose fixture. The rig is a draft, not professional technique validation.
- `build_curl.py`: continuous 120-frame skeletal recipe and four rendered inspection poses.
- `render_curl_720.py`: executed continuous 1280×720/30 fps/120-frame EEVEE candidate; explicit frame/loop deformation checks, partial output until render completion.
- `render_curl_hd.py`: native 1920×1080 derivative from the same source; human reviews stay pending.

The EEVEE scripts require a Windows interactive graphics session (a bounded, project-owned Scheduled Task can supply that context). They create a remote lease and deliberately leave it for the controller to reconcile against process identity and terminal task result before release. Do not run two scripts concurrently or infer lease expiry from the launcher's PID alone.

Blender scene scripts are separate from the application runtime. Source ingredients, `.blend`, `.glb`, installers, logs, license records and candidate renders stay outside this repository. Do not execute scripts received inside an incoming media package.

## Current limits

Remote SSH Cycles/OptiX canary passed. EEVEE failed in noninteractive SSH, then passed an actual 640×360 render and continuous 720p and native 1080p clips in the interactive Windows session on the RTX 4060 Ti. Both clips decoded to 120 distinct frames over 4 seconds; task terminal statuses were independently reconciled. The native HD job completed in 141.3 seconds. Unreal installation and an interactive editor canary remain pending. Mac heavy work is held by the program's boot-disk reserve. The user authorized a pending-review HD candidate for the single curl consumer milestone. Public promotion still requires the visual review gate and designated human technique approval. No food or other exercise production is in this checkpoint.

These are execution recipes and a safety boundary, not a completed factory release. Reusable runner/package modules and complete scene tests remain outstanding. The immutable single-curl candidate passed the frozen schema and AG1’s canonical intake function; independent consumer playback remains the next gate. Its human visual and technique reviews are pending. Program-private evidence is tracked in `control/ag2/` and `factory-work/evidence/`.

## VISUAL-02 correction checkpoint

The original candidate was not visually approved. `build_grip_v2.py` replaces the universal Euler finger pose with measured link lengths, per-digit cylinder clearance fitting, an opposition target for the thumb, and full-transform authoring controls. The control graph is hand control → hand/finger controls/dumbbell; forearm controls distribute wrist orientation. Earlier geometry iterations and renders remain private.

`check_grip_surface.py` runs in Blender with `TROPHE_PROGRAM_ROOT` pointing to the private program layout. It measures the radial minimum over evaluated triangles inside the handle span for both hands at all 121 sampled frames, with a declared 1 mm tolerance, plus disk axial margin. This is a bounded contact check, not a proof of all body self-collisions or professional technique.

`build_athlete_v2.py` uses the same private program layout. It preserves the MPFB source in the previous master, bakes the current phenotype into a new copy, adds an editable regional volume shape, constructs sportswear from compatible body topology, and replaces the obsolete trousers mask with garment coverage. Its visual direction remains provisional. No unchanged candidate approval is being requested.

The latest athlete revision smooths garment boundary loops against the actual body surface, keeps full leg geometry, and uses low-cut unbranded trainers with recalculated coverage. Eye texture comes from the existing CC0 system assets and is packed into the private master.

`build_curl_v2.py` authors a six-second fixed-supination bilateral curl using complete upper-arm, forearm and grip controls. Rise and descent use separate 2.4/3.6-second cubic Hermite phases. Frame 181 is a closure test, excluded from the 180 rendered frames. Adjacent pose values differ; the analytic endpoint velocity is zero, while the measured one-frame finite-difference mismatch is retained in the private recipe (about 0.0125 m/s). This is editorial motion construction, not coach approval. `render_curl_v2_720.py` creates the bounded Windows draft and leaves human reviews pending.
