"""Reference-led incline press revision; motion and textile changes remain separable."""
import bpy,json,math
import numpy as np
from mathutils import Matrix,Vector,Quaternion
from incline import ease
from cohort import key
from playback_qa import points


def motion(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;r=bpy.data.objects['Trophe_R2_Authoring'];b=bpy.data.objects['Trophe_R2_Athlete']
    s.frame_set(100);bpy.context.view_layer.update();anchors={};targets={};orientations={};lengths={};shoulders={}
    for side,sign in [('L',1),('R',-1)]:
        a=bpy.data.objects['Incline dumbbell '+side];target=bpy.data.objects['Incline wrist target '+side];anchors[side]=a;targets[side]=target
        head=lambda n:r.matrix_world@r.pose.bones[n+'.'+side].head
        sh=head('ORG-upper_arm');e=head('ORG-forearm');w=head('ORG-hand');shoulders[side]=sh.copy();lengths[side]=((e-sh).length,(w-e).length)
        old=a.matrix_world.to_quaternion();shaft=old@Vector((1,0,0));orientations[side]=(shaft.rotation_difference(Vector((1,0,0)))@old).to_matrix().to_4x4()
        a.animation_data.action=None
    r.animation_data.action=None
    # Preserve calibrated native forearm constraints, grip/hand relation and skin.
    for obj in s.objects:
        if obj.name.startswith('Incline weight head'):
            obj.scale.x=obj.scale.y=config.get('disc_radius_m',.085)/.065
        if obj.name.startswith('Incline weight'):
            for mat in obj.data.materials:
                if mat.use_nodes:
                    p=mat.node_tree.nodes.get('Principled BSDF')
                    if p and 'rubber' in mat.name.lower():p.inputs['Roughness'].default_value=.37
    rows=[];initial=None;previous=None
    for f in range(1,182):
        s.frame_set(f);t=(f-1)/180
        # Three seconds descent,0.2s controlled reversal,2.5s ascent,0.3s reset.
        q=ease(t/.50) if t<=.50 else (1. if t<=.5333333333 else (1-ease((t-.5333333333)/.4166666667) if t<=.95 else 0.))
        for side,sign in [('L',1),('R',-1)]:
            upper,fore=lengths[side];sh=shoulders[side]
            top=Vector((sign*.025,.025,math.sqrt(upper*upper-.025**2-.025**2))).normalized()
            bottom=(Vector((sign*math.sin(math.pi/4),-math.cos(math.pi/4)*math.cos(math.pi/6),-math.cos(math.pi/4)*math.sin(math.pi/6)))-Vector((0,-.5,.8660254))*config.get('bottom_extension',.12)).normalized()
            direction=Quaternion().slerp(top.rotation_difference(bottom),q)@top
            elbow=sh+direction*upper;wrist=elbow+Vector((0,0,fore))
            orientation=orientations[side];offset=(orientation@targets[side].matrix_basis).translation
            a=anchors[side];a.matrix_world=Matrix.Translation(wrist-offset)@orientation
            for prop in ['location','rotation_quaternion','scale']:a.keyframe_insert(prop,frame=f)
            mid=(sh+wrist)/2;pb=r.pose.bones['upper_arm_ik_target.'+side];pb.matrix.translation=r.matrix_world.inverted()@(mid+4*(elbow-mid));key(pb,f)
        bpy.context.view_layer.update();p=points(b)
        if initial is None:initial=p.copy()
        row={'frame':f,'descent':q,'surface_step_m':float(np.linalg.norm(p-previous,axis=1).max()) if previous is not None else 0,'sides':{}};previous=p.copy()
        for side in ['L','R']:
            head=lambda n:r.matrix_world@r.pose.bones[n+'.'+side].head
            sh=head('ORG-upper_arm');e=head('ORG-forearm');w=head('ORG-hand');h=r.matrix_world@r.pose.bones['ORG-hand.'+side].tail
            row['sides'][side]={'elbow_flex_deg':math.degrees((e-sh).angle(w-e)),'shoulder':list(sh),'elbow':list(e),'wrist':list(w),'dumbbell_center':list(anchors[side].matrix_world.translation),'wrist_target_error_m':(w-targets[side].matrix_world.translation).length,'forearm_from_vertical_deg':math.degrees((w-e).angle(Vector((0,0,1)))),'hand_bone_axis_deg':math.degrees((w-e).angle(h-w))}
        rows.append(row)
    for obj in [r,*anchors.values()]:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type='AUTO_CLAMPED';k.handle_right_type='AUTO_CLAMPED'
                        fc.modifiers.new('CYCLES')
    s.frame_set(1);s.frame_end=180;s.render.fps=30;bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    report={'reference':'User-supplied StrengthLog screen recording09-06-2026 19:26:39; NASM incline chest press posture/controlled descent. No inferred joint angles measured from2D footage.','change':'Upper arm arc about fixed shoulder, lower towards upper chest; forearms nearly vertical, shafts horizontal instead of forced bone-axis alignment that tilted the weights. Existing calibrated grasp and wrist relation kept.','wrist_note':'Metacarpal bone axis has a fixed anatomical/model offset in the existing grasp; zero bone-axis angle is not imposed as an anatomical wrist criterion.','frames':180,'closure_frame':181,'duration_s':6,'disc_radius_m':config.get('disc_radius_m',.085),'bottom_extension':config.get('bottom_extension',.12),'rows':rows,'closure_surface_m':float(np.linalg.norm(p-initial,axis=1).max()),'human_reviews':'pending'}
    (out/'motion-refinement.json').write_text(json.dumps(report,indent=2));return {'max_surface_step_m':max(x['surface_step_m'] for x in rows),'wrist_target_error_m':max(v['wrist_target_error_m'] for x in rows for v in x['sides'].values())}
