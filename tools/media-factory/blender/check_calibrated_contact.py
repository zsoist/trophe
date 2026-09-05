import os
import bpy, numpy as np, json, os
from pathlib import Path
r = Path(os.environ['TROPHE_PROGRAM_ROOT'])
out = r / 'factory-work/evidence/visual-02/elbow-calibrated-reference-01'
bpy.ops.wm.open_mainfile(filepath=str(out / 'curl.blend'))
h = bpy.data.objects['Athlete01']
s = bpy.context.scene
rows = []
for f in range(1, 182):
    s.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    eh = h.evaluated_get(dg)
    mesh = eh.to_mesh()
    mesh.calc_loop_triangles()
    verts = np.array([list(v.co) + [1] for v in mesh.vertices])
    tri = np.array([list(t.vertices) for t in mesh.loop_triangles])
    for side in ['l', 'r']:
        mat = np.array(bpy.data.objects['Dumbbell_' + side].matrix_world.inverted() @ h.matrix_world)
        p = (verts @ mat.T)[:, :3]
        t = p[tri]
        sel = np.all(np.abs(t[:, :, 0]) < 0.085, axis=1) & np.all(np.abs(t[:, :, 1]) < 0.07, axis=1) & np.all(np.abs(t[:, :, 2]) < 0.07, axis=1)
        q = t[sel, :, 1:]
        mins = []
        cross = []
        for i, j in [(0, 1), (1, 2), (2, 0)]:
            a = q[:, i]
            b = q[:, j]
            d = b - a
            frac = np.clip(-np.sum(a * d, axis=1) / np.maximum(np.sum(d * d, axis=1), 1e-20), 0, 1)
            near = a + frac[:, None] * d
            mins.append(np.linalg.norm(near, axis=1))
            cross.append(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0])
        d = np.min(mins, axis=0)
        cr = np.array(cross)
        inside = np.all(cr >= 0, axis=0) | np.all(cr <= 0, axis=0)
        d[inside] = 0
        clear = d - 0.014
        near = p[(np.abs(p[:, 0]) < 0.085) & (np.abs(p[:, 1]) < 0.07) & (np.abs(p[:, 2]) < 0.07)]
        rows.append({'frame': f, 'side': side, 'triangles': len(q), 'min_surface_clearance_m': float(clear.min()), 'triangles_below_minus_1mm': int(sum(clear < -0.001)), 'disk_axial_margin_m': float(0.0875 - np.max(np.abs(near[:, 0])))})
    eh.to_mesh_clear()
(out / 'surface-check.json').write_text(json.dumps({'method': 'Exact radial minimum over projected evaluated triangles fully inside handle axial span; finite disk margin on local hand-region vertices. Not a full-body self-collision proof.', 'tolerance_m': 0.001, 'samples': rows, 'passed': all((x['triangles_below_minus_1mm'] == 0 and x['disk_axial_margin_m'] > 0 for x in rows))}, indent=2))
print('WORST', min((x['min_surface_clearance_m'] for x in rows)))
import bpy, json, math, hashlib, time, numpy as np
from pathlib import Path
from mathutils import Vector
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
out = root / 'factory-work/evidence/visual-02/elbow-calibrated-reference-01'
source = out / 'curl.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
s = bpy.context.scene
h = bpy.data.objects['Athlete01']
r = bpy.data.objects['Athlete01_ExportRig']
rows = []
tracking = {}
maxdrift = {}
for f in range(1, 182):
    s.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    eh = h.evaluated_get(dg)
    me = eh.to_mesh()
    verts = np.array([list(v.co) + [1] for v in me.vertices])
    for side in ['l', 'r']:
        mat = np.array(bpy.data.objects['Dumbbell_' + side].matrix_world.inverted() @ h.matrix_world)
        p = (verts @ mat.T)[:, :3]
        rad = np.linalg.norm(p[:, 1:], axis=1)
        if f == 1:
            ids = np.where((np.abs(p[:, 0]) < 0.075) & (np.abs(rad - 0.014) < 0.002))[0]
            tracking[side] = {'ids': ids, 'initial': p[ids].copy(), 'min_radius': float(rad[ids].min()), 'max_radius': float(rad[ids].max())}
            maxdrift[side] = {'axial_m': 0.0, 'circumferential_m': 0.0, 'radial_m': 0.0}
        tr = tracking[side]
        q = p[tr['ids']]
        b = tr['initial']
        angle = np.arctan2(q[:, 2], q[:, 1]) - np.arctan2(b[:, 2], b[:, 1])
        angle = (angle + np.pi) % (2 * np.pi) - np.pi
        metrics = {'axial_m': float(np.max(np.abs(q[:, 0] - b[:, 0]))), 'circumferential_m': float(np.max(np.abs(angle)) * 0.014), 'radial_m': float(np.max(np.abs(np.linalg.norm(q[:, 1:], axis=1) - np.linalg.norm(b[:, 1:], axis=1))))}
        for k, v in metrics.items():
            maxdrift[side][k] = max(maxdrift[side][k], v)
        rows.append({'frame': f, 'side': side, **metrics})
    eh.to_mesh_clear()
(out / 'skin-contact-motion.json').write_text(json.dumps({'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'method': 'Track fixed evaluated skin vertex IDs initially within2mm radial band of14mm handle, in full actual dumbbell coordinates; circumferential distance on14mm radius. Not a force/friction simulation or comprehensive pressure/contact-area proof.', 'vertices_per_hand': {k: len(v['ids']) for k, v in tracking.items()}, 'max_drift': maxdrift, 'samples': rows}, indent=2))
print('CONTACT_TRACKING_COMPLETE', maxdrift)
