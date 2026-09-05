"""Discriminate garment binding from surface smoothing using original tailored correspondence."""
import bpy,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from localize_contact import mesh_data
from surface_qa import segment_hit


def coordinates(obj):
    keys=obj.data.shape_keys.key_blocks;p=[v.co.copy() for v in keys[0].data]
    for key in list(keys)[1:]:
        for i,v in enumerate(key.data):p[i]+=(v.co-key.relative_key.data[i].co)*key.value
    return p


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene
    body=bpy.data.objects['Trophe_R2_Athlete'];shirt=bpy.data.objects['SportsTank'];rig=bpy.data.objects['Trophe_R2_Authoring']
    with bpy.data.libraries.load(config['form_source'],link=False) as (available,requested):requested.objects=['Athlete01']
    original=requested.objects[0];shape=coordinates(original);bodyid=original.vertex_groups['body'].index
    ids={v.index for v in original.data.vertices if any(g.group==bodyid and g.weight>.5 for g in v.groups)}
    def selected(p):
        x,y,z=p;x=abs(x)
        if z<1.025 or z>1.60:return False
        limit=.205 if z<1.31 else .205-(min(z,1.435)-1.31)/.125*.054
        if x>limit:return False
        if z>(1.485 if y<0 else 1.525) and x<.077:return False
        return True
    faces=[list(f.vertices) for f in original.data.polygons if all(i in ids and selected(shape[i]) for i in f.vertices)]
    bound=sorted({i for f in faces for i in f});mapping={v:i for i,v in enumerate(bound)}
    assert len(bound)==len(shirt.data.vertices),(len(bound),len(shirt.data.vertices))
    assert [[mapping[i] for i in f] for f in faces]==[list(f.vertices) for f in shirt.data.polygons]
    names={b.name for b in rig.data.bones if b.use_deform}|{'mhmask-preserve-volume'}
    expected=[];before=[]
    for i,source_id in enumerate(bound):
        expected.append({body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[source_id].groups if body.vertex_groups[g.group].name in names})
        before.append({shirt.vertex_groups[g.group].name:g.weight for g in shirt.data.vertices[i].groups if shirt.vertex_groups[g.group].name in names})
    differences=[sum(abs(a.get(n,0)-b.get(n,0)) for n in set(a)|set(b)) for a,b in zip(expected,before)]
    collision=body.copy();scene.collection.objects.link(collision);collision.hide_render=True
    for m in list(collision.modifiers):
        if m.type=='MASK' and m.vertex_group in {'CoveredBySportswear','TrainerCoverage'}:collision.modifiers.remove(m)
    rows=[]
    for binding in ['nearest','exact_tailored_correspondence']:
        if binding.startswith('exact'):
            for name in names:
                group=shirt.vertex_groups.get(name) or shirt.vertex_groups.new(name=name)
                group.remove(list(range(len(bound))))
                for i,weights in enumerate(expected):
                    if weights.get(name,0):group.add([i],weights[name],'REPLACE')
        for smooth in [False,True]:
            for m in shirt.modifiers:
                if m.type in {'SUBSURF','SOLIDIFY'}:m.show_viewport=smooth;m.show_render=smooth
            for frame in [1,73]:
                scene.frame_set(frame);bpy.context.view_layer.update();p,t,_=mesh_data(collision);sp,st,_=mesh_data(shirt)
                tree=BVHTree.FromPolygons([Vector(v) for v in p],t,all_triangles=True);ctree=BVHTree.FromPolygons([Vector(v) for v in sp],st,all_triangles=True)
                signed=[]
                for point in sp:
                    hit,normal,_,_=tree.find_nearest(Vector(point));signed.append(float((Vector(point)-hit).dot(normal)))
                pairs=[]
                for a,b in tree.overlap(ctree):
                    A=p[list(t[a])];B=sp[list(st[b])]
                    if any(segment_hit(x[i],x[j],y) is not None for x,y in [(A,B),(B,A)] for i,j in [(0,1),(1,2),(2,0)]):pairs.append([a,b])
                rows.append({'binding':binding,'surface_modifiers_enabled':smooth,'frame':frame,'min_vertex_clearance_m':min(signed),'negative_vertices_1mm':sum(v<-.001 for v in signed),'actual_body_intersection_pairs':len(pairs)})
    bpy.data.objects.remove(collision,do_unlink=True);bpy.data.objects.remove(original,do_unlink=True)
    scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(output/'curl.blend'))
    record={'source_topology_correspondence':'Exact original tank selection reproduced; every raw face and vertex index mapping asserted. Source body topology unchanged; copied complete current rig supplied weights plus native PV blend mask.','shirt_vertices':len(bound),'weight_l1_max':max(differences),'weight_l1_changed_above_001':sum(v>.01 for v in differences),'body_bind_ids':bound,'comparisons':rows,'human_reviews':'pending','adopted':False}
    (output/'binding-comparison.json').write_text(json.dumps(record,indent=2));return {'max_weight_l1_difference':max(differences),'comparisons':rows}
