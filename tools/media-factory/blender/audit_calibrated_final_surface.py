import os
import bpy, json, numpy as np, math, time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
out = root / 'factory-work/evidence/visual-02/elbow-calibrated-reference-01'
q = json.loads((out / 'temporal-qa.json').read_text())
report = {'method': 'Final evaluated mesh with original modifiers enabled, per-frame loop triangulation and source vertex correspondence attribute. BVH broad phase, shared-vertex pairs excluded, noncoplanar segment-triangle intersection confirmed. Fixed original visible-skin regions from base. Counts are intersecting triangle pairs, not independent holes.', 'sources': {}, 'samples': []}

def segment_hit(a, b, t):
    d = b - a
    e1 = t[1] - t[0]
    e2 = t[2] - t[0]
    p = np.cross(d, e2)
    det = np.dot(e1, p)
    if abs(det) < 1e-12:
        return None
    inv = 1 / det
    v = a - t[0]
    u = np.dot(v, p) * inv
    if u < 0 or u > 1:
        return None
    z = np.cross(v, e1)
    w = np.dot(d, z) * inv
    if w < 0 or u + w > 1:
        return None
    k = np.dot(e2, z) * inv
    return (a + k * d).tolist() if 1e-06 < k < 1 - 1e-06 else None
for stage, folder in [('base', 'refine-v3-02'), ('calibrated', 'elbow-calibrated-reference-01')]:
    bpy.ops.wm.open_mainfile(filepath=str(root / 'factory-work/evidence/visual-02' / folder / 'curl.blend'))
    s = bpy.context.scene
    h = bpy.data.objects['Athlete01']
    attr = h.data.attributes.new('diagnostic_source_id', 'INT', 'POINT')
    for i, v in enumerate(attr.data):
        v.value = i
    bodyids = {v.index for v in h.data.vertices if any((h.vertex_groups[g.group].name == 'body' and g.weight > 0.5 for g in v.groups))}
    report['sources'][stage] = {'modifiers': [{'name': m.name, 'type': m.type, 'viewport': m.show_viewport, 'render': m.show_render} for m in h.modifiers], 'camera_light': {'exposure': s.view_settings.exposure, 'look': s.view_settings.look, 'view_transform': s.view_settings.view_transform, 'lights': {o.name: {'matrix_world': np.array(o.matrix_world).tolist(), 'energy': o.data.energy, 'color': list(o.data.color)} for o in bpy.data.objects if o.type == 'LIGHT'}}}
    for f in range(1, 182):
        s.frame_set(f)
        bpy.context.view_layer.update()
        eh = h.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = eh.to_mesh()
        me.calc_loop_triangles()
        orig = np.array([a.value for a in me.attributes['diagnostic_source_id'].data])
        assert len(set(orig)) == len(orig), 'New/duplicated vertices require different correspondence audit'
        p = np.array([list(v.co) for v in me.vertices])
        alltris = [tuple(t.vertices) for t in me.loop_triangles if all((int(orig[i]) in bodyids for i in t.vertices))]
        for reg, rr in q['regions'].items():
            ids = set(rr['vertex_ids'])
            ts = [t for t in alltris if any((int(orig[i]) in ids for i in t))]
            tree = BVHTree.FromPolygons([Vector(v) for v in p], ts, all_triangles=True)
            pairs = sorted({tuple(sorted((a, b))) for a, b in tree.overlap(tree) if a != b and (not set(ts[a]) & set(ts[b]))})
            hits = []
            for a, b in pairs:
                A = p[list(ts[a])]
                B = p[list(ts[b])]
                points = []
                for x, y in [(A, B), (B, A)]:
                    for i, j in [(0, 1), (1, 2), (2, 0)]:
                        hit = segment_hit(x[i], x[j], y)
                        if hit is not None:
                            points.append(hit)
                if points:
                    hits.append({'original_triangle_ids': [[int(orig[i]) for i in ts[a]], [int(orig[i]) for i in ts[b]]], 'points_m': points})
            report['samples'].append({'stage': stage, 'region': reg, 'frame': f, 'intersection_pair_count': len(hits), 'intersections': hits, 'final_mesh_vertices': len(p), 'local_triangles': len(ts)})
        eh.to_mesh_clear()
    print('FINAL_SURFACE_STAGE_DONE', stage, flush=True)
assert report['sources']['base']['camera_light'] == report['sources']['calibrated']['camera_light']
(out / 'final-surface-audit.json').write_text(json.dumps(report, indent=2))
print('FINAL_SURFACE_AUDIT_COMPLETE')
