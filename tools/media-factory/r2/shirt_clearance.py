"""Localized native outside-surface constraint on diagnosed armhole fabric only."""
import bpy,json
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
from localize_contact import mesh_data


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene
    body=bpy.data.objects['Trophe_R2_Athlete'];shirt=bpy.data.objects['SportsTank']
    collision=body.copy();collision.name='R2_GarmentCollider';scene.collection.objects.link(collision);collision.hide_render=True;collision.display_type='WIRE'
    for mod in list(collision.modifiers):
        if mod.type=='MASK' and mod.vertex_group in {'CoveredBySportswear','TrainerCoverage'}:collision.modifiers.remove(mod)
    attribute=shirt.data.attributes.new('r2_garment_rest_position','FLOAT_VECTOR','POINT')
    kd=KDTree(len(shirt.data.vertices))
    for i,v in enumerate(shirt.data.vertices):attribute.data[i].vector=v.co;kd.insert(v.co,i)
    kd.balance();core=set();diagnosis=[]
    for frame in config['frames']:
        scene.frame_set(frame);bpy.context.view_layer.update();p,t,_=mesh_data(collision);tree=BVHTree.FromPolygons([Vector(v) for v in p],t,all_triangles=True)
        ev=shirt.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();bad=[]
        for v in mesh.vertices:
            point=shirt.matrix_world@v.co;near,normal,_,_=tree.find_nearest(point);signed=(point-near).dot(normal)
            if signed<.001:
                rest=mesh.attributes['r2_garment_rest_position'].data[v.index].vector
                _,i,_=kd.find(rest);core.add(i);bad.append({'evaluated_vertex':v.index,'signed_clearance_m':signed,'raw_nearest_vertex':i})
        ev.to_mesh_clear();diagnosis.append({'frame':frame,'vertices_needing_clearance':bad})
    adjacency={v.index:set() for v in shirt.data.vertices}
    for edge in shirt.data.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    # A two-ring core margin prevents subdivision interpolation from weakening the diagnosed area.
    full=set(core)
    for _ in range(2):full|={j for i in full for j in adjacency[i]}
    feather={j for i in full for j in adjacency[i]}-full
    group=shirt.vertex_groups.new(name='R2 armhole clearance')
    group.add(sorted(full),1.,'REPLACE')
    if feather:group.add(sorted(feather),.5,'REPLACE')
    mod=shirt.modifiers.new('Localized native fabric clearance','SHRINKWRAP');mod.target=collision
    mod.wrap_method='NEAREST_SURFACEPOINT';mod.wrap_mode='OUTSIDE';mod.offset=.003;mod.vertex_group=group.name
    bpy.context.view_layer.objects.active=shirt
    # After surface subdivision, before physical thickness. Original body/rig are unchanged.
    bpy.ops.object.modifier_move_up(modifier=mod.name)
    scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(output/'curl.blend'))
    record={'method':'Blender Shrinkwrap nearest surface, Outside mode,3mm exclusion offset; diagnosed local fabric only, after subdivision before thickness. Native body collision duplicate has garment-coverage masks removed and is excluded from renders. No body movement, weights or rig changes.','manual':'https://docs.blender.org/manual/en/5.2/modeling/modifiers/deform/shrinkwrap.html','raw_shirt_vertices':len(shirt.data.vertices),'core_vertices':sorted(core),'full_weight_vertices':sorted(full),'feather_vertices':sorted(feather),'diagnosis':diagnosis,'limits':'Outside classification can be unreliable at sharp folds; requires actual triangle and temporal/visual QA. No claim of cloth pressure or friction simulation.','human_reviews':'pending'}
    (output/'shirt-clearance.json').write_text(json.dumps(record,indent=2));return {'core':len(core),'full_weight':len(full),'feather':len(feather),'raw_shirt_vertices':len(shirt.data.vertices)}
