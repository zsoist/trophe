"""Local Arnold wrist and anatomy revision; immutable source and native Rigify kept."""
import bpy,json,math
import numpy as np
from mathutils import Vector,Matrix
from playback_qa import points
from garment_binding import coordinates
from compare_baseline import studio,place


def inspect(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete']
    rows=[]
    for f in [1,16,31,46,61,76,91,121,151,181]:
        s.frame_set(f);bpy.context.view_layer.update();r={'frame':f,'sides':{}}
        for side,suffix in [('l','L'),('r','R')]:
            pt=lambda n:rig.matrix_world@rig.pose.bones[n+'.'+suffix].head
            elbow=pt('ORG-forearm');wrist=pt('ORG-hand');knuckle=pt('ORG-f_middle.01');fore=wrist-elbow;palm=knuckle-wrist
            r['sides'][side]={'elbow':list(elbow),'wrist':list(wrist),'middle_knuckle':list(knuckle),'forearm_palm_axis_angle_deg':math.degrees(fore.angle(palm)),'hand_bone_axis_angle_deg':math.degrees(fore.angle(rig.matrix_world.to_3x3()@(rig.pose.bones['ORG-hand.'+suffix].tail-rig.pose.bones['ORG-hand.'+suffix].head)))}
        rows.append(r)
    (out/'inspection.json').write_text(json.dumps({'rows':rows,'shape_keys':[(k.name,k.value) for k in body.data.shape_keys.key_blocks],'modifiers':[(m.name,m.type) for m in body.modifiers]},indent=2))
    cam=studio(s);s.render.engine='BLENDER_EEVEE';s.render.resolution_x=720;s.render.resolution_y=720;cam.data.sensor_fit='VERTICAL'
    for side in ['l','r']:
        for f in [1,46,91]:
            s.frame_set(f);bpy.context.view_layer.update();t=bpy.data.objects['R2_Grip_'+side].matrix_world.translation
            place(cam,t+Vector((.28 if side=='l' else -.28,-.42,.13)),t,.42);s.render.filepath=str(out/('hand-'+side+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
    rig.data.pose_position='REST';bpy.context.view_layer.update();place(cam,(2,-4,1.65),(0,0,1.42),1.12);s.render.filepath=str(out/'rest-three-quarter.png');bpy.ops.render.render(write_still=True)
    rig.data.pose_position='POSE';s.frame_set(46);bpy.context.view_layer.update();place(cam,(2,-4,1.65),(0,0,1.42),1.12);s.render.filepath=str(out/'mid-three-quarter.png');bpy.ops.render.render(write_still=True)
    return {'angles':rows,'diagnostic_only':True}


def bell(x,c,w):return math.exp(-((x-c)/w)**2)
def fade(x,a,b):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)


def revise(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];shoes=bpy.data.objects['Trophe_R2_Trainers']
    original=[];anchors={side:bpy.data.objects['R2_Grip_'+side] for side in ['l','r']};relations={side:bpy.data.objects['Arnold wrist target '+side].matrix_basis.inverted() for side in anchors}
    # Read every baseline pose before changing the action; no feedback dependency.
    for f in range(1,182):
        s.frame_set(f);bpy.context.view_layer.update();row={}
        for side,suffix in [('l','L'),('r','R')]:
            hand=rig.matrix_world@rig.pose.bones['ORG-hand.'+suffix].matrix;wrist=hand.translation;elbow=rig.matrix_world@rig.pose.bones['ORG-forearm.'+suffix].head;knuckle=rig.matrix_world@rig.pose.bones['ORG-f_middle.01.'+suffix].head
            swing=(knuckle-wrist).normalized().rotation_difference((wrist-elbow).normalized())
            corrected=Matrix.Translation(wrist)@swing.to_matrix().to_4x4()@hand.to_3x3().to_4x4()
            row[side]={'anchor':corrected@relations[side],'wrist':wrist.copy(),'elbow':elbow.copy(),'before_deg':math.degrees((knuckle-wrist).angle(wrist-elbow))}
        original.append(row)
    for anchor in anchors.values():anchor.animation_data.action=None;anchor.rotation_mode='QUATERNION'
    previous={};wrist_rows=[]
    for f,base in enumerate(original,1):
        s.frame_set(f)
        for side,anchor in anchors.items():
            anchor.matrix_world=base[side]['anchor']
            if side in previous:anchor.rotation_quaternion.make_compatible(previous[side])
            previous[side]=anchor.rotation_quaternion.copy()
            for prop in ['location','rotation_quaternion','scale']:anchor.keyframe_insert(prop,frame=f)
        bpy.context.view_layer.update()
        for side,suffix in [('l','L'),('r','R')]:
            wrist=rig.matrix_world@rig.pose.bones['ORG-hand.'+suffix].head;elbow=rig.matrix_world@rig.pose.bones['ORG-forearm.'+suffix].head;knuckle=rig.matrix_world@rig.pose.bones['ORG-f_middle.01.'+suffix].head
            wrist_rows.append({'frame':f,'side':side,'before_angle_deg':base[side]['before_deg'],'after_angle_deg':math.degrees((knuckle-wrist).angle(wrist-elbow)),'wrist_path_delta_m':(wrist-base[side]['wrist']).length,'elbow_path_delta_m':(elbow-base[side]['elbow']).length})
    for anchor in anchors.values():
        for layer in anchor.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for p in fc.keyframe_points:p.interpolation='BEZIER';p.handle_left_type='AUTO_CLAMPED';p.handle_right_type='AUTO_CLAMPED'
                        fc.modifiers.new('CYCLES')
    # Local rest-form sculpt. Reduce the inherited generic inflation before adding
    # anatomically oriented cap/front/back forms; never alter fingers or neck centre.
    coords=coordinates(body);keys=body.data.shape_keys.key_blocks;basis=keys[0];old=[k for k in keys if k.name.startswith('Preserved R1:')]
    body_ids={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
    sculpt=body.shape_key_add(name='Arnold V2 localized arm anatomy',from_mix=False);sculpt.value=1.;changes=[]
    for i in body_ids:
        p=coords[i];delta=Vector((0,0,0));side='L' if p.x>0 else 'R';sign=1 if p.x>0 else -1
        bone=rig.data.bones['ORG-upper_arm.'+side];a=bone.head_local;axis=bone.tail_local-a;t=(p-a).dot(axis)/axis.length_squared;radial=p-(a+axis*t);length=radial.length
        support=fade(abs(p.x),.12,.18)*fade(t,-.22,-.08)*(1-fade(t,.80,.97))
        if support>0 and length>1e-6 and 1.15<p.z<1.57:
            old_delta=sum(((k.data[i].co-k.relative_key.data[i].co)*k.value for k in old),Vector())
            delta-=old_delta*(.70*support)
            n=radial/length;lat=Vector((-axis.z,0,axis.x)).normalized()*sign
            lateral=max(0,n.dot(lat));front=max(0,-n.y);back=max(0,n.y)
            cap=.012*bell(t,.10,.21)*lateral**2+.007*bell(t,.12,.19)*(front**2+back**2)
            insertion=-.0035*bell(t,.35,.10)*lateral**3
            septum=-.004*bell(t,.59,.23)*lateral**6
            delta+=n*(cap+insertion+septum)*support
            delta.y+=(-.013*bell(t,.57,.19)*front**3+.011*bell(t,.49,.23)*back**3)*support
            delta+=lat*(.004*bell(t,.49,.24)*back*lateral*support)
        # Small superior-back trapezius bridge; cervical centre and face untouched.
        if .07<abs(p.x)<.22 and p.y>0 and 1.42<p.z<1.59:
            ridge=bell(abs(p.x),.135,.055)*bell(p.z,1.565-.60*abs(p.x),.033)*fade(p.y,0,.04)
            delta.z+=.004*ridge;delta.y+=.002*ridge
        sculpt.data[i].co=basis.data[i].co+delta
        if delta.length>1e-7:changes.append({'id':i,'delta_m':list(delta)})
    assert all(abs(coords[c['id']].x)>.07 and coords[c['id']].z>1.15 for c in changes)
    bpy.context.view_layer.update();s.frame_set(1)
    report={'source':config['animation_source'],'wrist_change':'Baked minimal swing aligns wrist-to-middle-knuckle line with evaluated forearm; full grip and dumbbell rotate together about the preserved wrist trajectory. Finger controls and rig weights unchanged.','wrist_rows':wrist_rows,'anatomy':'Local authored shape key replaces70% of inherited generic arm inflation only inside feathered patch, introduces separated lateral/anterior/posterior deltoid cap, biceps/triceps fronts and side septum; small trapezius transition outside neck centre. This is rest-form sculpt, not activation or pose corrective.','changed_vertices':changes,'max_shape_delta_m':max(Vector(c['delta_m']).length for c in changes),'human_reviews':'pending'}
    (out/'revision.json').write_text(json.dumps(report,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(out/'arnold.blend'))
    return {'changed_vertices':len(changes),'max_sculpt_delta_m':report['max_shape_delta_m'],'max_wrist_path_delta_m':max(r['wrist_path_delta_m'] for r in wrist_rows),'max_elbow_path_delta_m':max(r['elbow_path_delta_m'] for r in wrist_rows),'max_after_palm_angle_deg':max(r['after_angle_deg'] for r in wrist_rows)}
