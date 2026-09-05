"""Recut the armhole pattern so fabric does not include the body's axillary fold."""
import bpy,bmesh,json,math
from mathutils import Vector
from garment_binding import coordinates


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene
    body=bpy.data.objects['Trophe_R2_Athlete'];shirt=bpy.data.objects['SportsTank']
    binding=json.loads(open(config['binding_source'],encoding='utf-8-sig').read())['body_bind_ids'];assert len(binding)==len(shirt.data.vertices)
    attr=shirt.data.attributes.new('R2 garment body bind','INT','POINT')
    for i,v in enumerate(attr.data):v.value=binding[i]
    settings=config['armhole'];before={'vertices':len(shirt.data.vertices),'faces':len(shirt.data.polygons)}
    def outside(co):
        z=(co.z-settings['center_z'])/settings['vertical_radius']
        if abs(z)>=1:return False
        limit=settings['outer_x']-settings['inset']*math.sqrt(1-z*z)
        return abs(co.x)>limit
    bm=bmesh.new();bm.from_mesh(shirt.data)
    remove=[f for f in bm.faces if any(outside(v.co) for v in f.verts)]
    removed=[{'center':list(f.calc_center_median()),'vertices':[list(v.co) for v in f.verts]} for f in remove]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    # Only the newly cut armhole border: keep neck, straps, hem and interior fixed.
    edge_verts=[v for v in bm.verts if v.is_boundary and abs(v.co.x)>.10 and 1.245<v.co.z<1.48]
    initial_edge={v:v.co.copy() for v in edge_verts}
    for _ in range(config.get('boundary_smooth_iterations',0)):
        bmesh.ops.smooth_vert(bm,verts=edge_verts,factor=.5,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    smoothing={'native_operator':'bmesh.ops.smooth_vert','iterations':config.get('boundary_smooth_iterations',0),'factor':.5,'boundary_vertices':len(edge_verts),'max_displacement_m':max(((v.co-p).length for v,p in initial_edge.items()),default=0)}
    bm.to_mesh(shirt.data);bm.free();shirt.data.update()
    if config.get('rest_border_clearance_m'):
        # Finish the tailored rest pattern on the actual rest skin after smoothing.
        # Applying only this native modifier leaves the authoring rig and motion editable.
        rig=bpy.data.objects['Trophe_R2_Authoring'];old_pose=rig.data.pose_position
        rig.data.pose_position='REST'
        collider=body.copy();scene.collection.objects.link(collider)
        for mod in list(collider.modifiers):
            if mod.type=='MASK' and mod.vertex_group in {'CoveredBySportswear','TrainerCoverage'}:collider.modifiers.remove(mod)
        group=shirt.vertex_groups.new(name='R2 rest armhole finish')
        selected=[v.index for v in shirt.data.vertices if abs(v.co.x)>.085 and 1.235<v.co.z<1.48]
        group.add(selected,1,'REPLACE')
        wrap=shirt.modifiers.new('Rest pattern fit','SHRINKWRAP');wrap.target=collider;wrap.vertex_group=group.name
        wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=config['rest_border_clearance_m']
        shirt.modifiers.move(len(shirt.modifiers)-1,0)
        bpy.ops.object.select_all(action='DESELECT');shirt.select_set(True);bpy.context.view_layer.objects.active=shirt
        bpy.context.view_layer.update();bpy.ops.object.modifier_apply(modifier=wrap.name)
        rig.data.pose_position=old_pose;bpy.data.objects.remove(collider,do_unlink=True);bpy.context.view_layer.update()
        smoothing['rest_fit']={'native_modifier':'SHRINKWRAP nearest surface / above surface, applied before armature','clearance_m':config['rest_border_clearance_m'],'vertices':len(selected),'reference':'original skeleton rest with current body shape keys; not animated frame1'}
    edges={}
    for face in shirt.data.polygons:
        for edge in face.edge_keys:edges[edge]=edges.get(edge,0)+1
    boundary={v for e,count in edges.items() if count==1 for v in e}
    border_attr=shirt.data.attributes['BoundEdge']
    for v in shirt.data.vertices:
        distance=min((v.co-shirt.data.vertices[j].co).length for j in boundary)
        border_attr.data[v.index].value=max(0,min(1,(.018-distance)/.018))
    current=[a.value for a in shirt.data.attributes['R2 garment body bind'].data]
    covered=set(range(len(shirt.data.vertices)))-boundary
    for _ in range(2):covered={i for i in covered if all(j in covered for e in edges if i in e for j in e)}
    shape=coordinates(body);coverage=body.vertex_groups['CoveredBySportswear'];keep={v.index for v in body.data.vertices if shape[v.index].z<1.075 and any(g.group==coverage.index and g.weight>.5 for g in v.groups)}
    coverage.remove(list(range(len(body.data.vertices))));coverage.add(sorted(keep|{current[i] for i in covered}),1,'REPLACE')
    if config.get('shell_clamp'):
        for mod in shirt.modifiers:
            if mod.type=='SOLIDIFY':
                mod.thickness_clamp=1.;mod.use_thickness_angle_clamp=True
                smoothing['shell_finish']={'type':'native Solidify thickness/angle clamp','thickness_m':mod.thickness,'clamp':mod.thickness_clamp,'reason':'six static crossings disappear when Solidify alone is disabled; rest pattern itself has no detected crossings'}
    if config.get('shell_mode')=='complex':
        for mod in shirt.modifiers:
            if mod.type=='SOLIDIFY':
                mod.solidify_mode='NON_MANIFOLD';mod.nonmanifold_thickness_mode='CONSTRAINTS'
                smoothing['shell_mode']='native complex / constraints; thickness unchanged'
    elif config.get('shell_mode')=='surface':
        for mod in list(shirt.modifiers):
            if mod.type=='SOLIDIFY':shirt.modifiers.remove(mod)
        smoothing['shell_mode']='double-sided textile surface; no volumetric fabric thickness claimed'
    scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(output/'curl.blend'))
    record={'cause':'Raw weighted garment still intersects at the axillary body fold with either nearest or exact binding; smoothing amplifies it. The original body-derived selection retained fold geometry which should lie in the armhole opening.','intervention':'One localized armhole-pattern recut, preserving neckline/straps/waist and matching current body weights. Recompute bound-edge trim and skin coverage; no live Shrinkwrap, no body/hand/motion edits.','armhole':settings,'before':before,'after':{'vertices':len(shirt.data.vertices),'faces':len(shirt.data.polygons)},'removed_faces':removed,'body_bind_ids':current,'human_reviews':'pending','adopted':False}
    record['boundary_finish']=smoothing
    if config.get('rest_border_clearance_m'):
        record['intervention']+=' Rest-space native Shrinkwrap was applied only to fit the finished pattern; no live Shrinkwrap remains.'
    (output/'garment-pattern.json').write_text(json.dumps(record,indent=2));return {'removed_faces':len(removed),'before':before,'after':record['after'],'boundary_finish':smoothing}
