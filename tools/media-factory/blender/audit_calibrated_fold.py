import os
import bpy, json, numpy as np, math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
out = root / 'factory-work/evidence/visual-02/elbow-calibrated-reference-01'
q = json.loads((out / 'temporal-qa.json').read_text())
data = np.load(out / 'evaluated-skin-181.npz')
bpy.ops.wm.open_mainfile(filepath=str(root / 'factory-work/evidence/visual-02/refine-v3-02/curl.blend'))
h = bpy.data.objects['Athlete01']
h.data.calc_loop_triangles()
visible = {v.index for v in h.data.vertices if any((h.vertex_groups[g.group].name == 'body' and g.weight > 0.5 for g in v.groups))}
tris = [tuple(t.vertices) for t in h.data.loop_triangles if all((i in visible for i in t.vertices))]
report = {'method': 'Fixed visible skin IDs and loop-triangle correspondence. Self BVH broad phase, exclude any triangles sharing vertex; segment-triangle Moller intersection confirmation with interior segment parameter. Coplanar cases excluded; not full-body collision certification.', 'regions': {}, 'samples': []}

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
    if 1e-06 < k < 1 - 1e-06:
        return (a + k * d).tolist()
    return None
for reg, rr in q['regions'].items():
    ids = set(rr['vertex_ids'])
    ts = [t for t in tris if any((i in ids for i in t))]
    adj = {}
    for ti, t in enumerate(ts):
        for a, b in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])]:
            adj.setdefault(tuple(sorted((a, b))), []).append(ti)
    common = {tuple(sorted(e)) for e in rr['edge_ids']}
    adj = {e: v for e, v in adj.items() if len(v) == 2 and e in common}
    report['regions'][reg] = {'triangle_count': len(ts), 'fixed_common_edges': len(adj)}
    for stage in ['base', 'calibrated']:
        arr = data[stage]
        for fi, p in enumerate(arr):
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
                    hits.append({'triangles': [ts[a], ts[b]], 'points_m': points})
            pts = p[np.array(ts)]
            norm = np.cross(pts[:, 1] - pts[:, 0], pts[:, 2] - pts[:, 0])
            norm /= np.maximum(np.linalg.norm(norm, axis=1)[:, None], 1e-15)
            angles = [(math.degrees(math.acos(float(np.clip(np.dot(norm[a], norm[b]), -1, 1)))), e) for e, (a, b) in adj.items()]
            worst = max(angles)
            report['samples'].append({'region': reg, 'stage': stage, 'frame': fi + 1, 'intersection_pair_count': len(hits), 'intersections': hits, 'max_adjacent_triangle_normal_angle_deg': worst[0], 'max_dihedral_edge': worst[1]})
        print('FOLD_REGION_DONE', reg, stage, flush=True)
report['localized_limit'] = {}
for stage in ['base', 'calibrated']:
    row = next((x for x in q['stages'][stage]['samples'] if x['region'] == 'elbow_l' and x['frame'] == 73))
    edge = row['ratio_common_frame1']['min_edge']
    ids = set(edge)
    for t in tris:
        if any((i in edge for i in t)):
            ids.update(t)
    pts = data[stage][72, list(ids)]
    report['localized_limit'][stage] = {'minimum_edge_ids': edge, 'base_frame1_length_m': float(np.linalg.norm(data['base'][0, edge[0]] - data['base'][0, edge[1]])), 'peak_length_m': float(np.linalg.norm(data[stage][72, edge[0]] - data[stage][72, edge[1]])), 'peak_midpoint_m': ((data[stage][72, edge[0]] + data[stage][72, edge[1]]) * 0.5).tolist(), 'one_ring_vertex_ids': sorted(ids), 'one_ring_extent_m': np.ptp(pts, axis=0).tolist(), 'endpoint_deform_weights': [{h.vertex_groups[g.group].name: g.weight for g in h.data.vertices[i].groups if h.vertex_groups[g.group].name in bpy.data.objects['Athlete01_ExportRig'].data.bones} for i in edge]}
(out / 'fold-audit.json').write_text(json.dumps(report, indent=2))
print('FOLD_AUDIT_COMPLETE')
