"""Existing noncoplanar intersection check, reused for fixed visible skin regions."""
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

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

def check(body, regions):
    if not body.data.attributes.get('diagnostic_source_id'):
        attr=body.data.attributes.new('diagnostic_source_id','INT','POINT')
        for i,v in enumerate(attr.data):v.value=i
    bodyids={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
    evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
    original=np.array([a.value for a in mesh.attributes['diagnostic_source_id'].data]);p=np.array([list(v.co) for v in mesh.vertices]);assert len(set(original))==len(original)
    alltris=[tuple(t.vertices) for t in mesh.loop_triangles if all(int(original[i]) in bodyids for i in t.vertices)]
    result={}
    for name,ids in regions.items():
        ids=set(ids);ts=[t for t in alltris if any(int(original[i]) in ids for i in t)]
        tree=BVHTree.FromPolygons([Vector(v) for v in p],ts,all_triangles=True)
        pairs=sorted({tuple(sorted((a,b))) for a,b in tree.overlap(tree) if a!=b and not set(ts[a])&set(ts[b])});hits=[]
        for a,b in pairs:
            A=p[list(ts[a])];B=p[list(ts[b])];points=[]
            for x,y in [(A,B),(B,A)]:
                for i,j in [(0,1),(1,2),(2,0)]:
                    hit=segment_hit(x[i],x[j],y)
                    if hit is not None:points.append(hit)
            if points:hits.append({'triangles':[[int(original[i]) for i in ts[a]],[int(original[i]) for i in ts[b]]],'points_m':points})
        result[name]={'triangles':len(ts),'intersection_pairs':len(hits),'hits':hits}
    evaluated.to_mesh_clear();return result
