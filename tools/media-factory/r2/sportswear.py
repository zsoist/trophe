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
