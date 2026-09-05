"""Localize existing contact findings on actual evaluated surfaces, without repairs."""
import bpy,json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from surface_qa import segment_hit


def mesh_data(obj):
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
    p=np.array([list(obj.matrix_world@v.co) for v in me.vertices]);tri=[tuple(t.vertices) for t in me.loop_triangles]
    original=[a.value for a in me.attributes['diagnostic_source_id'].data] if me.attributes.get('diagnostic_source_id') else None
    ev.to_mesh_clear();return p,tri,original


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene
    body=bpy.data.objects['Trophe_R2_Athlete'];shirt=bpy.data.objects['SportsTank']
    if config.get('diagnostic_disable_solidify'):
        for mod in shirt.modifiers:
            if mod.type=='SOLIDIFY':mod.show_viewport=False;mod.show_render=False
    collider=body.copy();scene.collection.objects.link(collider);collider.hide_render=True
    for mod in list(collider.modifiers):
        if mod.type=='MASK' and mod.vertex_group in {'CoveredBySportswear','TrainerCoverage'}:collider.modifiers.remove(mod)
    def mods(obj):
        return [{'name':m.name,'type':m.type,**({k:getattr(m,k) for k in ['use_deform_preserve_volume','use_multi_modifier','vertex_group','invert_vertex_group','use_vertex_groups','use_bone_envelopes']} if m.type=='ARMATURE' else {})} for m in obj.modifiers]
    report={'deform_stacks':{'body':mods(body),'shirt':mods(shirt)},'frames':[]}
    for frame in config['frames']:
        scene.frame_set(frame);bpy.context.view_layer.update();p,t,orig=mesh_data(collider);tree=BVHTree.FromPolygons([Vector(v) for v in p],t,all_triangles=True);hits=[]
        for obj in scene.objects:
            if not obj.name.startswith('DumbbellPart'):continue
            if max(v.co.z for v in obj.data.vertices)-min(v.co.z for v in obj.data.vertices)>.1:continue
            pp,tt,_=mesh_data(obj);ptree=BVHTree.FromPolygons([Vector(v) for v in pp],tt,all_triangles=True)
            for a,b in tree.overlap(ptree):
                A=p[list(t[a])];B=pp[list(tt[b])];points=[]
                for x,y in [(A,B),(B,A)]:
                    for i,j in [(0,1),(1,2),(2,0)]:
                        v=segment_hit(x[i],x[j],y)
                        if v is not None:points.append(v)
                if points:hits.append({'object':obj.name,'body_triangle_source_ids':[orig[i] for i in t[a]],'points_m':points})
        sp,st,_=mesh_data(shirt);penetration=[]
        for i,point in enumerate(sp):
            near,normal,face,distance=tree.find_nearest(Vector(point));signed=float((Vector(point)-near).dot(normal))
            if signed<-.001:penetration.append({'evaluated_shirt_vertex':i,'position_m':point.tolist(),'signed_clearance_m':signed,'body_triangle_source_ids':[orig[v] for v in t[face]]})
        cloth_tree=BVHTree.FromPolygons([Vector(v) for v in sp],st,all_triangles=True)
        cloth_body=[];cloth_self=[]
        for a,b in tree.overlap(cloth_tree):
            A=p[list(t[a])];B=sp[list(st[b])]
            if any(segment_hit(x[i],x[j],y) is not None for x,y in [(A,B),(B,A)] for i,j in [(0,1),(1,2),(2,0)]):cloth_body.append([a,b])
        for a,b in cloth_tree.overlap(cloth_tree):
            if a>=b or set(st[a])&set(st[b]):continue
            A=sp[list(st[a])];B=sp[list(st[b])]
            if any(segment_hit(x[i],x[j],y) is not None for x,y in [(A,B),(B,A)] for i,j in [(0,1),(1,2),(2,0)]):cloth_self.append([a,b])
        report['frames'].append({'cloth_body_intersection_pairs':cloth_body,'cloth_body_world_centers':[np.mean(p[list(t[a])],axis=0).tolist() for a,b in cloth_body],'cloth_self_intersection_pairs':cloth_self,'cloth_self_world_centers':[np.mean(sp[list(st[a])],axis=0).tolist() for a,b in cloth_self],'frame':frame,'actual_disc_intersections':hits,'shirt_negative_vertices':penetration})
    (output/'localization.json').write_text(json.dumps(report,indent=2))
    return {'frames':len(report['frames']),'actual_disc_pairs':sum(len(f['actual_disc_intersections']) for f in report['frames']),'shirt_negative_vertices_max':max(len(f['shirt_negative_vertices']) for f in report['frames'])}
