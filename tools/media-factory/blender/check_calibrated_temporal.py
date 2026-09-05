import os
import bpy, json, hashlib, numpy as np
from pathlib import Path
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
base = root / 'factory-work/evidence/visual-02'
out = base / 'elbow-calibrated-reference-01'
regions = {}
data = {}
transforms = {}
report = {'references': {'original_rest': 'Immutable original skeleton bone.matrix_local; used only to select fixed anatomical vertex IDs, not the temporal denominator.', 'animated_frame1': 'Evaluated authoring pose at t=0, frame1. Variant reference bone matrices equal this pose.', 'initial_surface': 'Original base frame1 shape keys + PreserveVolume armature; masks/subdivision disabled only for stable vertex correspondence. Common reference for BOTH stages.'}, 'sources': {}, 'regions': {}, 'stages': {}}
for stage, folder in [('base', 'refine-v3-02'), ('calibrated', 'elbow-calibrated-reference-01')]:
    src = base / folder / 'curl.blend'
    bpy.ops.wm.open_mainfile(filepath=str(src))
    s = bpy.context.scene
    h = bpy.data.objects['Athlete01']
    r = bpy.data.objects['Athlete01_ExportRig']
    edges = np.array([list(e.vertices) for e in h.data.edges])
    faces = [list(p.vertices) for p in h.data.polygons]
    top = (len(h.data.vertices), edges.tolist(), faces)
    if stage == 'base':
        topology = top
        visible = {v.index for v in h.data.vertices if any((h.vertex_groups[g.group].name == 'body' and g.weight > 0.5 for g in v.groups))}
        for side in ['l', 'r']:
            for region, joint, radius, names in [('elbow', r.data.bones['lowerarm_' + side].head_local, 0.065, ['upperarm_' + side, 'lowerarm_' + side]), ('wrist', r.data.bones['hand_' + side].head_local, 0.06, ['lowerarm_' + side, 'hand_' + side])]:
                ids = [v.index for v in h.data.vertices if v.index in visible and (v.co - joint).length < radius and any((h.vertex_groups[g.group].name in names and g.weight > 0.1 for g in v.groups))]
                es = np.array([e for e in edges if all((int(i) in ids for i in e))])
                regions[region + '_' + side] = (ids, es)
                report['regions'][region + '_' + side] = {'vertex_ids': ids, 'edge_ids': es.tolist(), 'selection': 'Fixed BASE original vertex IDs; visible body group >0.5; same IDs evaluated throughout both stages.'}
    else:
        assert top == topology
    for m in h.modifiers:
        if m.type != 'ARMATURE':
            m.show_viewport = False
    pts = []
    mats = []
    for f in range(1, 182):
        s.frame_set(f)
        bpy.context.view_layer.update()
        eo = h.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = eo.to_mesh()
        pts.append(np.array([list(v.co) for v in me.vertices]))
        eo.to_mesh_clear()
        mats.append(np.array([np.array(b.matrix) for b in r.pose.bones] + [np.array(bpy.data.objects[n].matrix_world) for n in ['CTRL_grip_l', 'CTRL_grip_r', 'Dumbbell_l', 'Dumbbell_r']]))
    data[stage] = np.array(pts)
    transforms[stage] = np.array(mats)
    report['sources'][stage] = {'path': str(src), 'sha256': hashlib.sha256(src.read_bytes()).hexdigest(), 'units': 'meters', 'unit_scale': s.unit_settings.scale_length, 'world_matrix': np.array(h.matrix_world).tolist(), 'topology_matches': True}
print('EVALUATED_BOTH181', flush=True)
for stage, p in data.items():
    rows = []
    for name, (ids, es) in regions.items():
        lengths = np.linalg.norm(p[:, es[:, 0]] - p[:, es[:, 1]], axis=2)
        common = np.linalg.norm(data['base'][0, es[:, 0]] - data['base'][0, es[:, 1]], axis=1)
        ratios = lengths / common
        delta = np.linalg.norm(p[:, ids] - data['base'][:, ids], axis=2)
        for f in range(181):
            q = ratios[f]
            rows.append({'region': name, 'frame': f + 1, 'pts_seconds': f / 30, 'ratio_common_frame1': {'min': float(q.min()), 'p05': float(np.percentile(q, 5)), 'median': float(np.median(q)), 'p95': float(np.percentile(q, 95)), 'max': float(q.max()), 'min_edge': es[q.argmin()].tolist(), 'max_edge': es[q.argmax()].tolist(), 'below_0_5': int(sum(q < 0.5)), 'above_2': int(sum(q > 2))}, 'delta_vs_base_same_frame_m': {'max': float(delta[f].max()), 'p95': float(np.percentile(delta[f], 95))}, 'bbox_extent_m': np.ptp(p[f, ids], axis=0).tolist()})
        report['stages'].setdefault(stage, {})[name] = {'frame1_delta_vs_base_m': float(delta[0].max()), 'loop_position_error_m': float(np.linalg.norm(p[-1, ids] - p[0, ids], axis=1).max()), 'loop_forward_backward_velocity_difference_m_s': float(np.linalg.norm((p[1, ids] - p[0, ids]) * 30 - (p[-1, ids] - p[-2, ids]) * 30, axis=1).max()), 'peak_step_surface_displacement_m': float(np.linalg.norm(np.diff(p[:, ids], axis=0), axis=2).max())}
    report['stages'][stage]['samples'] = rows
report['authoring_bones_grip_prop_fullmatrix_max_delta'] = float(np.abs(transforms['calibrated'] - transforms['base']).max())
assert report['authoring_bones_grip_prop_fullmatrix_max_delta'] < 1e-06
report['visible_skin_frame1_max_delta_m'] = float(np.linalg.norm(data['calibrated'][0, list(visible)] - data['base'][0, list(visible)], axis=1).max())
report['limitations'] = ['Edge distributions do not certify surface quality, joint technique or absence of self-intersections.', 'Finite-difference endpoint velocity is sampled at 30fps; not equated with analytic zero derivative.']
np.savez_compressed(out / 'evaluated-skin-181.npz', base=data['base'], calibrated=data['calibrated'])
(out / 'temporal-qa.json').write_text(json.dumps(report, indent=2))
print('QA_COMPLETE', report['visible_skin_frame1_max_delta_m'])
