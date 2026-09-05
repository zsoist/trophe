"""Recut the armhole pattern so fabric does not include the body's axillary fold."""
import bpy,bmesh,json,math
from mathutils import Vector
from garment_binding import coordinates


def finish_coverage(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    body=bpy.data.objects['Trophe_R2_Athlete'];removed=[]
    for mod in list(body.modifiers):
        if mod.type=='MASK' and mod.vertex_group=='CoveredBySportswear':
            removed.append({'name':mod.name,'group':mod.vertex_group});body.modifiers.remove(mod)
    assert removed,'Expected previous textile coverage mask'
    bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(output/'curl.blend'))
    record={'removed':removed,'reason':'The redesigned and smoothed armhole no longer matches the historical vertex-ID textile mask. Positive cloth/body clearance was already checked against the full under-garment skin. Render that complete skin to prevent coverage holes.','preserved':'mesh coordinates, weights, rig/action, garments, equipment, helpers and trainer coverage masks','human_reviews':'pending'}
    (output/'coverage-finish.json').write_text(json.dumps(record,indent=2));return record


def check_coverage(config,output):
    def snapshot(path):
        bpy.ops.wm.open_mainfile(filepath=path);body=bpy.data.objects['Trophe_R2_Athlete'];rows={}
        for frame in [1,37,73,115,181]:
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
            ids=[a.value for a in mesh.attributes['diagnostic_source_id'].data]
            rows[frame]={i:body.matrix_world@v.co for i,v in zip(ids,mesh.vertices)};ev.to_mesh_clear()
        return rows
    before=snapshot(config['comparison_source']);after=snapshot(config['animation_source']);rows=[]
    for frame in before:
        assert set(before[frame])<=set(after[frame]);delta=max((p-after[frame][i]).length for i,p in before[frame].items())
        assert delta<1e-6,delta
        rows.append({'frame':frame,'preserved_vertices':len(before[frame]),'restored_skin_vertices':len(after[frame])-len(before[frame]),'common_surface_max_delta_m':delta})
    report={'method':'Original source IDs on evaluated skin, identical pose frames, common surface coordinates compared before/after removal of textile MASK. No body/garment/rig source rewrite.','samples':rows,'passed':True}
    (output/'coverage-check.json').write_text(json.dumps(report,indent=2));return report


def coverage_regression(config,output):
    """Test missing visible skin with camera rays, independently from collision counters."""
    from mathutils.bvhtree import BVHTree
    def capture(path):
        bpy.ops.wm.open_mainfile(filepath=path);bpy.context.scene.frame_set(73);bpy.context.view_layer.update()
        trees={};body_ids=set();anchors={s:bpy.data.objects['R2_Grip_'+s].matrix_world.translation.copy() for s in ['l','r']}
        for obj in bpy.context.scene.objects:
            if obj.type!='MESH' or obj.hide_render:continue
            ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();mesh.calc_loop_triangles()
            coords=[obj.matrix_world@v.co for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles]
            trees[obj.name]=BVHTree.FromPolygons(coords,tris,all_triangles=True)
            if obj.name=='Trophe_R2_Athlete':
                body_ids={a.value for a in mesh.attributes['diagnostic_source_id'].data}
                native={v.index for v in obj.data.vertices if any(obj.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
                assert body_ids<=native,'Helper geometry exposed'
            ev.to_mesh_clear()
        body=bpy.data.objects['Trophe_R2_Athlete']
        masks=[m.vertex_group for m in body.modifiers if m.type=='MASK']
        return trees,body_ids,anchors,masks
    old,old_ids,anchors,old_masks=capture(config['comparison_source'])
    new,new_ids,_,new_masks=capture(config['animation_source'])
    assert 'CoveredBySportswear' in old_masks and 'CoveredBySportswear' not in new_masks
    assert sorted(m for m in old_masks if m!='CoveredBySportswear')==sorted(new_masks)
    assert old_ids<new_ids
    def closest(trees,origin,direction):
        found=(None,float('inf'))
        for name,tree in trees.items():
            hit,normal,face,distance=tree.ray_cast(origin,direction,10)
            if hit is not None and distance<found[1]:found=(name,distance)
        return found
    views=[]
    for s,sign in [('l',1),('r',-1)]:
        target=anchors[s]
        views.append(('grip-'+s,target+Vector((sign*.15,-.25,.18)),target,.25))
        views.append(('armhole-front-'+s,Vector((sign*.6,-.65,1.5)),Vector((sign*.14,-.10,1.35)),.38))
        views.append(('armhole-back-'+s,Vector((sign*.6,.65,1.5)),Vector((sign*.14,.06,1.35)),.38))
    rows=[]
    for name,position,target,scale in views:
        rotation=(target-position).to_track_quat('-Z','Y').to_matrix();direction=(target-position).normalized();missing=[];same=0
        for y in range(48):
            for x in range(48):
                origin=position+rotation@Vector(((x+.5-24)/48*scale,(y+.5-24)/48*scale,0))
                a=closest(old,origin,direction);b=closest(new,origin,direction)
                if b[0]=='Trophe_R2_Athlete':
                    if a[0]!=b[0] or a[1]-b[1]>.001:missing.append({'pixel':[x,y],'old_frontmost':a[0],'depth_gap_m':a[1]-b[1] if a[0] else None})
                    elif abs(a[1]-b[1])<1e-6:same+=1
        rows.append({'view':name,'camera_position':list(position),'target':list(target),'orthographic_scale':scale,'rays':48*48,'original_missing_skin_rays':len(missing),'unchanged_skin_rays':same,'examples':missing[:8]})
    assert sum(r['original_missing_skin_rays'] for r in rows)>0,'Case did not reproduce the source01 visible hole'
    report={'passed':True,'frame':73,'method':'Orthographic camera rays against actual renderable evaluated surfaces. Source01 loses a frontmost skin hit that exists after restoring original skin. This detects absent coverage, not self-intersections.','source_missing_case_reproduced':True,'restored_skin_vertices':len(new_ids-old_ids),'helpers_exposed':False,'preserved_masks':new_masks,'views':rows,'scope':'Bounded regression for obsolete textile MASK at exposed armholes; visible stills remain required for edge/material judgement.'}
    (output/'coverage-regression.json').write_text(json.dumps(report,indent=2));return report


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
