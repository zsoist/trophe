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

Remote SSH Cycles/OptiX canary passed. EEVEE failed in noninteractive SSH, then passed an actual 640×360 render and a continuous 720p clip in the interactive Windows session on the RTX 4060 Ti. The 720p clip decoded to 120 distinct frames over 4 seconds; task terminal status was independently reconciled. Unreal installation and an interactive editor canary remain pending. Mac heavy work is held by the program's boot-disk reserve. The user authorized a pending-review HD candidate for the single curl consumer milestone. Public promotion still requires the visual review gate and designated human technique approval. No food or other exercise production is in this checkpoint.

These are execution recipes and a safety boundary, not a completed factory release. Runner/package modules, complete scene tests and an immutable intake-compatible handoff remain outstanding. Program-private evidence is tracked in `control/ag2/` and `factory-work/evidence/`.
