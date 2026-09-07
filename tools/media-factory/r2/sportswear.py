"""Reuse the tested native jersey fit/binding on an existing compatible athlete.

No exercise pose changes. New derivatives keep their own identity and reviews.
"""
import bpy,json
import numpy as np
from playback_qa import points


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
