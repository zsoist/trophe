"""Reuse the tested native jersey fit/binding on an existing compatible athlete.

No exercise pose changes. New derivatives keep their own identity and reviews.
"""
import bpy,json
import numpy as np
from playback_qa import points


def projection_comparison(config,out):
    """Isolate the existing rest-fit projection; never adopt by pair count alone."""
    from localize_contact import mesh_data
    from bench_qa import crossings
    from compare_baseline import studio,place
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring'];c=bpy.data.objects['SportsTank']
    wraps=[m for m in c.modifiers if m.type=='SHRINKWRAP'];assert len(wraps)==1
    for m in c.modifiers:
        if m.type=='SOLIDIFY':m.show_viewport=m.show_render=False
    cam=studio(s);cam.data.sensor_fit='VERTICAL';place(cam,(1.5,-2,1.8),(0,0,1.4),.95)
    s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
    rows=[]
    for pose,frame in [('REST',1),('POSE',1),('POSE',73)]:
        r.data.pose_position=pose;s.frame_set(frame)
        for enabled in [True,False]:
            for m in wraps:m.show_viewport=m.show_render=enabled
            bpy.context.view_layer.update();bd=mesh_data(b);cd=mesh_data(c)
            rows.append({'skeleton_state':pose,'frame':frame,'projection':enabled,'body_crossings':crossings(bd,cd),'self_crossings':crossings(cd,cd,same=True)})
            name=f'{pose.lower()}-{frame:03d}-projection-{int(enabled)}.png';s.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
    result={'scope':'Same raw garment, body, rig, subdivision, camera and light. Only native Shrinkwrap fit toggled; shell disabled in both. REST is original skeleton state; POSE frame1 is animated start. Diagnostic only, no new master adopted.','rows':rows,'human_reviews':'pending'}
    (out/'projection-comparison.json').write_text(json.dumps(result,indent=2))
    return {'rows':[{k:(len(v) if isinstance(v,list) else v) for k,v in row.items()} for row in rows],'adopted':False}


def sleeveless_pattern(config,out):
    """Reuse the demonstrated armhole recut on the fitted core neckline pattern."""
    import bmesh,math
    from incline_refine import garment_surface_bind
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring'];old=bpy.data.objects['SportsTank']
    before={}
    for f in [1,37,73,115,181]:s.frame_set(f);bpy.context.view_layer.update();before[f]=points(b)
    s.frame_set(1);r.data.pose_position='REST'
    for m in old.modifiers:
        if m.type=='SOLIDIFY':m.show_viewport=m.show_render=False
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();mesh=bpy.data.meshes.new_from_object(old.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
    cloth=bpy.data.objects.new('Recut native jersey',mesh);s.collection.objects.link(cloth);cloth.matrix_world=old.matrix_world.copy();bpy.data.objects.remove(old,do_unlink=True);cloth.name='SportsTank'
    settings=config['armhole'];bm=bmesh.new();bm.from_mesh(mesh)
    def outside(co):
        z=(co.z-settings['center_z'])/settings['vertical_radius']
        limit=settings['outer_x']-settings['inset']*math.sqrt(max(0,1-z*z)) if abs(z)<1 else settings['outer_x']
        return co.z>settings['lower_z'] and abs(co.x)>limit
    removed=[f for f in bm.faces if any(outside(v.co) for v in f.verts)]
    count=len(removed);assert count
    bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    edge=[v for v in bm.verts if v.is_boundary and abs(v.co.x)>.095 and settings['lower_z']<v.co.z<1.54]
    original={v:v.co.copy() for v in edge}
    for _ in range(3):bmesh.ops.smooth_vert(bm,verts=edge,factor=.5,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    delta=max(((v.co-p).length for v,p in original.items()),default=0)
    for v in bm.verts:v.select=v in original
    bm.to_mesh(mesh);bm.free();mesh.update()
    group=cloth.vertex_groups.new(name='Recut armhole edge fit');group.add([v.index for v in mesh.vertices if v.select],1.,'REPLACE')
    wrap=cloth.modifiers.new('Rest armhole finish only','SHRINKWRAP');wrap.target=b;wrap.vertex_group=group.name;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.004
    bpy.ops.object.select_all(action='DESELECT');cloth.select_set(True);bpy.context.view_layer.objects.active=cloth;bpy.ops.object.modifier_apply(modifier=wrap.name)
    edges={}
    for face in mesh.polygons:
        for e in face.edge_keys:edges[e]=edges.get(e,0)+1
    boundary={i for e,n in edges.items() if n==1 for i in e};attr=mesh.attributes['Sportswear binding']
    for v in mesh.vertices:attr.data[v.index].value=max(0.,1.-min((v.co-mesh.vertices[j].co).length for j in boundary)/.012)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'rest-pattern.blend'))
    binding=out/'native-binding';binding.mkdir();garment_surface_bind(dict(config,animation_source=str(out/'rest-pattern.blend')),binding)
    cloth=bpy.data.objects['SportsTank'];b=bpy.data.objects['Trophe_R2_Athlete'];s=bpy.context.scene
    for m in list(cloth.modifiers):
        if m.type=='SOLIDIFY':cloth.modifiers.remove(m)
    rows=[]
    for f,p in before.items():
        s.frame_set(f);bpy.context.view_layer.update();d=float(np.linalg.norm(points(b)-p,axis=1).max());assert d<1e-6;rows.append({'frame':f,'body_delta_m':d})
    s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'athlete.blend'))
    record={'cause':'Projected core short sleeves retain axillary fold; full-cycle crossings localized there. Removing projection exposes torso skin through cloth and is rejected.','intervention':'Native local armhole recut as demonstrated in original Curl pattern; preserve crew neckline and waist, smooth only cut border3iterations and refit border4mm in skeletonREST. Rebind native SurfaceDeform after topology change. No skin deletion, body/rig/motion/grip change.','representation':'Sleeveless double-sided textile surface; intentional open armholes, no fabric volume simulation.','removed_faces':count,'border_vertices':len(original),'border_smoothing_max_m':delta,'armhole':settings,'body_comparison':rows,'human_reviews':'pending','technical_passed':False}
    (out/'sleeveless-pattern.json').write_text(json.dumps(record,indent=2));return record


def border_finish(config,out):
    """Finish only the observed cut-edge stair steps with native mesh smoothing."""
    from localize_contact import mesh_data
    from bench_qa import crossings
    from compare_baseline import studio,place
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];c=bpy.data.objects['SportsTank']
    counts={}
    for p in c.data.polygons:
        for e in p.edge_keys:counts[e]=counts.get(e,0)+1
    boundary={i for e,n in counts.items() if n==1 for i in e}
    chosen=[i for i in boundary if abs(c.data.vertices[i].co.x)>.095 and 1.22<c.data.vertices[i].co.z<1.54]
    assert chosen;group=c.vertex_groups.new(name='Visible armhole border finish');group.add(chosen,1.,'REPLACE')
    mod=c.modifiers.new('Native local armhole border finish','SMOOTH');mod.vertex_group=group.name;mod.factor=.5;mod.iterations=10
    cam=studio(s);cam.data.sensor_fit='VERTICAL';place(cam,(1.5,-2,1.8),(0,0,1.4),.95);s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
    rows=[];base={}
    for enabled in [False,True]:
        mod.show_viewport=mod.show_render=enabled
        for f in [1,37,73,115,181]:
            s.frame_set(f);bpy.context.view_layer.update();bd=mesh_data(b);cd=mesh_data(c)
            if not enabled:base[f]=(bd[0].copy(),cd[0].copy())
            delta=np.linalg.norm(cd[0]-base[f][1],axis=1);assert np.linalg.norm(bd[0]-base[f][0],axis=1).max()<1e-6
            unchanged=[i for i in range(len(delta)) if i not in chosen];assert delta[unchanged].max()<1e-6
            rows.append({'frame':f,'finish':enabled,'body_crossing_pairs':len(crossings(bd,cd)),'self_crossing_pairs':len(crossings(cd,cd,same=True)),'border_displacement_max_m':float(delta.max()),'outside_region_max_m':float(delta[unchanged].max())})
            if f in [1,73]:s.render.filepath=str(out/f'finish-{int(enabled)}-{f:03d}.png');bpy.ops.render.render(write_still=True)
    s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'athlete.blend'))
    record={'scope':'Native SMOOTH applied after stable surface binding to actual116-ish armhole border vertices only; neck/waist/interior/body/rig/motion unchanged. No new projection or shell. Compares same camera/light and5criticalposes.','vertices':chosen,'factor':.5,'iterations':10,'rows':rows,'human_reviews':'pending','technical_passed':False};(out/'border-finish.json').write_text(json.dumps(record,indent=2));return record


def movement_contrast(config,out):
    """Economic same-piece contrast; preexisting skin defects are not garment deltas."""
    from localize_contact import mesh_data
    from bench_qa import crossings
    from compare_baseline import studio,place
    rows=[];before={};preset=config['camera']
    for label,source in [('before',config['comparison_source']),('after',config['animation_source'])]:
        bpy.ops.wm.open_mainfile(filepath=source);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];c=bpy.data.objects['SportsTank'];cam=studio(s);cam.data.sensor_fit='VERTICAL';place(cam,preset['position'],preset['target'],preset['ortho_scale']);s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
        for f in config['frames']:
            s.frame_set(f);bpy.context.view_layer.update();bd=mesh_data(b);cd=mesh_data(c);grips={n:np.array(bpy.data.objects[n].matrix_world) for n in config['grasp_objects']}
            if label=='before':before[f]=(bd[0].copy(),grips)
            delta=float(np.linalg.norm(bd[0]-before[f][0],axis=1).max());grip_delta=max(float(abs(m-before[f][1][n]).max()) for n,m in grips.items());assert delta<1e-6 and grip_delta<1e-6
            rows.append({'version':label,'frame':f,'cloth_body_crossings':crossings(bd,cd),'cloth_self_crossings':crossings(cd,cd,same=True),'body_delta_from_common_base_m':delta,'grasp_matrix_delta_from_common_base':grip_delta,'body_masks':[(m.name,m.vertex_group,m.show_render) for m in b.modifiers if m.type=='MASK']})
            s.render.filepath=str(out/f'{label}-{f:03d}.png');bpy.ops.render.render(write_still=True)
    record={'scope':'Same core garment and localized native armhole hypothesis, before/after identical camera/light/poses. Only3poses on second movement; not full-cycle certification. Source body evaluated surface and full dumbbell transforms compared to common base, preserving preexisting skin defects. No approval or production adoption.','rows':rows,'human_reviews':'pending','adopted':False};(out/'movement-contrast.json').write_text(json.dumps(record,indent=2));return {'rows':[{k:len(v) if isinstance(v,list) else v for k,v in r.items()} for r in rows],'adopted':False}


def run(config,out):
    from incline_refine import garment,garment_surface_bind
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;body=bpy.data.objects['Trophe_R2_Athlete'];before={}
    original_masks=[(m.name,m.vertex_group,m.show_render) for m in body.modifiers if m.type=='MASK']
    for f in [1,46,91,136,181]:s.frame_set(f);bpy.context.view_layer.update();before[f]=points(body)
    fit=out/'native-fit';fit.mkdir();fit_result=garment(config,fit)
    binding=out/'native-binding';binding.mkdir();bind_result=garment_surface_bind(dict(config,animation_source=str(fit/'incline.blend')),binding)
    cloth=bpy.data.objects['SportsTank']
    for m in list(cloth.modifiers):
        if m.type=='SOLIDIFY':cloth.modifiers.remove(m)
    body=bpy.data.objects['Trophe_R2_Athlete'];s=bpy.context.scene;rows=[]
    for f,source in before.items():
        s.frame_set(f);bpy.context.view_layer.update();delta=float(np.linalg.norm(points(body)-source,axis=1).max());assert delta<1e-6,(f,delta);rows.append({'frame':f,'unchanged_body_surface_max_m':delta})
    masks=[(m.name,m.vertex_group,m.show_render) for m in body.modifiers if m.type=='MASK'];assert masks==original_masks
    s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'athlete.blend'))
    record={'shared_components':['MPFB core sports top fit','native persistent SurfaceDeform binding','two-sided textile surface without unstable shell'],'body_rig_motion_equipment':'Preserved; evaluated body correspondence checked at5poses, source animation retained','masks_preserved':masks,'comparisons':rows,'garment_fit':fit_result,'binding':bind_result,'scope':'New independent garment revision; prior body/clip bytes and approvals remain unchanged','human_reviews':'pending'}
    (out/'sportswear.json').write_text(json.dumps(record,indent=2));return {'body_preserved':True,'native_bound':True,'garment_review_required':True}
