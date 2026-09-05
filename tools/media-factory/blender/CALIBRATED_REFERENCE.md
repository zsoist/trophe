# One calibrated reference experiment — not adopted

`ELBOW_CALIBRATED_REFERENCE_01` preserves the immutable `refine-v3-02` master. It changes the deformation reference only. It does not adopt swing-only, repaint weights, sculpt a new athlete, change grip controls, or change motion curves.

The original skeleton bind/rest pose, animated frame 1, and evaluated initial skin are different references. For each existing bone, the derivative deformer's bind matrix is the authoring matrix at frame 1. Its pose copies the original authoring matrix throughout the cycle. The derivative mesh is the exact initial evaluated shape plus skinning, with later masks retained. Thus its skinning transform starts at identity while authoring trajectories stay unchanged. The same 53 bone names and parents and the same weights are retained. Editable phenotype shape keys remain in the immutable source; they are baked in this derivative.

Run with `TROPHE_PROGRAM_ROOT` set to the private program root and Blender 5.2.1 LTS. Recipes deliberately refuse to replace the build directory. These parameterized files correspond to executed private recipes through the private recipe-code-map record.

1. `calibrate_elbow_reference.py`: build the single derivative, assert frame 1 and weights.
2. `check_calibrated_temporal.py`: verify all 181 evaluated poses, fixed common elbow/wrist skin IDs and full authoring/grip/prop matrices; write stable-coordinate cache.
3. `render_calibrated_comparison.py`: matched native closeups and complete arm views.
4. `check_calibrated_contact.py`: evaluated handle clearance and fixed skin-point motion, both hands through the cycle.
5. `render_calibrated_clip.py`: bounded 384×480, 180-frame, 30-fps Cycles CPU diagnostic.
6. `audit_calibrated_fold.py`: preliminary fixed source triangulation and local compression/weight footprint. This is not the final render-surface collision result.
7. `audit_calibrated_final_surface.py`: authoritative local collision audit for this experiment: all enabled final modifiers, per-frame evaluated triangulation, source-ID correspondence. Noncoplanar segment/triangle intersections are confirmed after BVH broad phase; adjacent/shared-vertex pairs excluded. Coplanar/full-body coverage is not certified.
8. `render_calibrated_localization.py`: native render with projected red confirmed intersection segments and blue minimum-ratio edge. Hidden segments are projected annotations, not skin color or visible protrusions.

Results: frame 1 body maximum delta 1.14 micrometers; authoring/grip/prop matrix delta zero across 181 poses; wrist surface delta below 1.6 micrometers. Contact retains the existing 1-mm tolerance. At peak flexion left elbow common-base p95 edge ratio falls 1.643→1.470, but the minimum worsens 0.406→0.388. Final evaluated local self-intersections remain in both elbows (frames 38–126), with more intersecting triangle pairs in some sampled poses. Wrist regions have zero detected pairs in the tested method. These are not medical technique judgments.

Decision: mixed geometric result, not a new consumer candidate. The calibration demonstrates a contribution from bind/reference orientation, but it does not solve local fold compression or volume handling. Preserve all existing versions. Before changing weights or geometry, use the recorded local rings, final-surface intersection segments, and same-pose images; do not infer a unique remaining cause from one extreme edge or a triangle-pair count. Human visual and technique reviews remain pending.

Verification performed: actual Blender recipes completed with exit 0; full-cycle topology/identity/continuity and contact checks; intersection routine crossing/outside/beyond-segment/coplanar-exclusion cases; AST-preserving parameterization; decoded clip metadata and distinct frames. No app/schema/consumer change is part of this experiment.
