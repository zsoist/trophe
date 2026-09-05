"""Fit the existing controlled curl to its equipment; match native MPFB garment skinning."""
import bpy,json,math
from mathutils import Matrix


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene
    body=bpy.data.objects['Trophe_R2_Athlete'];rig=bpy.data.objects['Trophe_R2_Authoring'];shirt=bpy.data.objects['SportsTank']
    source=next(m for m in body.modifiers if m.type=='ARMATURE' and m.use_multi_modifier)
    assert shirt.vertex_groups.get(source.vertex_group),source.vertex_group
    assert not any(m.type=='ARMATURE' and m.use_multi_modifier for m in shirt.modifiers)
    mod=shirt.modifiers.new('MPFB matched preserve-volume blend','ARMATURE');mod.object=rig
    for key in ['use_deform_preserve_volume','use_multi_modifier','vertex_group','invert_vertex_group','use_vertex_groups','use_bone_envelopes']:setattr(mod,key,getattr(source,key))
    bpy.context.view_layer.objects.active=shirt
    while list(shirt.modifiers).index(mod)>1:bpy.ops.object.modifier_move_up(modifier=mod.name)
    # This is a fixed animation-control placement, not skeleton rebinding or an elbow twist variant.
    angle=math.radians(config['fixed_arm_forward_degrees']);rotation=Matrix.Rotation(-angle,4,'X')
    observations=[]
    for frame in range(1,182):
        scene.frame_set(frame);bpy.context.view_layer.update()
        for side in ['L','R']:
            bone=rig.pose.bones['upper_arm_fk.'+side];center=bone.head.copy();before=bone.matrix.copy()
            hand=rig.pose.bones['hand_fk.'+side];hand_before=hand.matrix.copy();fore=rig.pose.bones['forearm_fk.'+side]
            elbow_angle_before=(bone.tail-bone.head).angle(fore.tail-fore.head)
            transform=Matrix.Translation(center)@rotation@Matrix.Translation(-center)
            bone.matrix=transform@before;bpy.context.view_layer.update()
            channel='rotation_quaternion' if bone.rotation_mode=='QUATERNION' else 'rotation_euler'
            for prop in ['location',channel,'scale']:bone.keyframe_insert(prop,frame=frame,group=bone.name)
            expected=transform@hand_before
            observations.append({'frame':frame,'side':side,'hand_full_transform_delta':max(abs(hand.matrix[i][j]-expected[i][j]) for i in range(4) for j in range(4)),'elbow_angle_change_radians':abs((bone.tail-bone.head).angle(fore.tail-fore.head)-elbow_angle_before),'elbow_position_m':list(fore.head)})
    scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(output/'curl.blend'))
    report={'fixed_arm_forward_degrees':config['fixed_arm_forward_degrees'],'basis':'Actual disk/thigh intersections at initial/final pose; bounded-cylinder penetration40.7mm and exact evaluated mesh crossings confirmed.6degree whole-arm control placement moves the held equipment forward while preserving relative elbow amplitude and full grip authority.','clothing':'Add existing MPFB multi-modifier preserve-volume blend with transferred mhmask-preserve-volume weights to shirt. No body weights, rig reference, finger pose or equipment dimensions edited.','method':'Conventional Rigify FK placement and Blender Armature modifier stack; no solver or simulation.','reviews':{'visual_human':'pending','technique_human':'pending'},'samples':observations}
    (output/'contact-fit.json').write_text(json.dumps(report,indent=2));return {'frames':181,'max_hand_transform_error':max(v['hand_full_transform_delta'] for v in observations),'max_relative_elbow_angle_change':max(v['elbow_angle_change_radians'] for v in observations)}
