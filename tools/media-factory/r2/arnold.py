"""Standing Arnold press study: independent dumbbells drive native Rigify IK."""
import bpy, json, math
import numpy as np
from mathutils import Matrix, Vector
from cohort import empty, material, cylinder, key
from playback_qa import points
from surface_qa import check


def ease(x):
    x=max(0.,min(1.,x));return x*x*x*(10-15*x+6*x*x)


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    scene=bpy.context.scene;rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];shoes=bpy.data.objects['Trophe_R2_Trainers']
    assert not any(m.type=='MASK' and m.vertex_group=='CoveredBySportswear' for m in body.modifiers)
    scene.frame_set(91);bpy.context.view_layer.update();relation={};rotations={};tracked={};skin=points(body)
    for side,suffix in [('l','L'),('r','R')]:
        anchor=bpy.data.objects['R2_Grip_'+side];hand=rig.pose.bones['hand_fk.'+suffix]
        relation[side]=(rig.matrix_world@hand.matrix).inverted()@anchor.matrix_world
        rotation=anchor.matrix_world.to_3x3().to_4x4();axis=(rotation@relation[side].inverted()).to_3x3()@Vector((0,1,0))
        rotations[side]=Matrix.Rotation(math.pi/2-math.atan2(axis.z,axis.y),4,'X')@rotation
        local=(np.c_[skin,np.ones(len(skin))]@np.array(anchor.matrix_world.inverted()).T)[:,:3]
        ids=np.where((abs(local[:,0])<.075)&(abs(np.linalg.norm(local[:,1:],axis=1)-.014)<.002))[0]
        assert len(ids)>10;tracked[side]=(ids,local[ids].copy())
    assert rig.animation_data.drivers;rig.animation_data.action=None
    for obj in list(scene.objects):
        if obj.name.startswith(('Dumbbell','R2_Grip')):bpy.data.objects.remove(obj,do_unlink=True)
    steel=material('Arnold brushed steel',(.20,.23,.26),.75);rubber=material('Arnold rubber discs',(.045,.05,.055),.1)
    anchors={};targets={};shoulders={}
    for side,suffix in [('l','L'),('r','R')]:
        anchor=empty('R2_Grip_'+side);anchor.rotation_mode='QUATERNION';anchors[side]=anchor
        cylinder('DumbbellPart Arnold handle '+side,0,.014,.18,steel,anchor)
        for sign in [-1,1]:
            cylinder('DumbbellPart Arnold disc '+side,sign*.115,.065,.055,rubber,anchor)
            cylinder('DumbbellPart Arnold endcap '+side,sign*.15,.025,.015,steel,anchor)
        target=empty('Arnold wrist target '+side);target.parent=anchor;target.matrix_basis=relation[side].inverted();targets[side]=target
        parent=rig.pose.bones['upper_arm_parent.'+suffix];parent['IK_FK']=0.;parent['IK_Stretch']=0.;parent['pole_vector']=True
        hand=rig.pose.bones['hand_ik.'+suffix];c=hand.constraints.new('COPY_TRANSFORMS');c.name='Arnold dumbbell owns complete wrist transform';c.target=target;c.owner_space='WORLD';c.target_space='WORLD'
        shoulders[side]=rig.pose.bones['shoulder.'+suffix].matrix.copy()
    shirt=bpy.data.objects['SportsTank'];group=shirt.vertex_groups.new(name='Arnold shoulder garment clearance')
    for v in shirt.data.vertices:
        if v.co.z>1.18:group.add([v.index],min(1,(v.co.z-1.18)/.07),'REPLACE')
    wrap=shirt.modifiers.new('Native Arnold shoulder textile fit','SHRINKWRAP');wrap.target=body;wrap.vertex_group=group.name;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.004
    bodyids={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
    regions={s:[v.index for v in body.data.vertices if v.index in bodyids and sign*v.co.x>.07 and 1.13<v.co.z<1.54] for s,sign in [('shoulder_arm_l',1),('shoulder_arm_r',-1)]}
    rows=[];sole0=None;initial=None;pose_checks=[];previous_rotation={}
    for frame in range(1,182):
        scene.frame_set(frame);phase=(frame-1)/180.;u=phase*2 if phase<=.5 else 2-2*phase;q=ease(u);turn=ease(q/.72)
        for side,suffix,sign in [('l','L',1),('r','R',-1)]:
            shoulder=rig.pose.bones['shoulder.'+suffix];base=shoulders[side];pivot=base.translation
            shoulder.matrix=Matrix.Translation(pivot)@Matrix.Rotation(-sign*math.radians(8)*q,4,'Y')@Matrix.Translation(-pivot)@base;key(shoulder,frame)
            # A continuous outward arc, with inward recovery at the top; no torso sway.
            x=.19+.23*math.sin(math.pi*q)+.055*q;y=-.29+.25*q;z=1.49+.582*q
            anchors[side].matrix_world=Matrix.Translation((sign*x,y,z))@Matrix.Rotation(sign*math.pi*turn,4,'Z')@rotations[side]
            if side in previous_rotation:anchors[side].rotation_quaternion.make_compatible(previous_rotation[side])
            previous_rotation[side]=anchors[side].rotation_quaternion.copy()
            for prop in ['location','rotation_quaternion','scale']:anchors[side].keyframe_insert(prop,frame=frame)
        bpy.context.view_layer.update()
        for side,suffix,sign in [('l','L',1),('r','R',-1)]:
            wrist=targets[side].matrix_world.translation;shoulder=rig.matrix_world@rig.pose.bones['ORG-upper_arm.'+suffix].head
            elbow_hint=wrist-Vector((0,0,rig.data.bones['ORG-forearm.'+suffix].length))
            pole=(shoulder+wrist)/2+4*(elbow_hint-(shoulder+wrist)/2)
            control=rig.pose.bones['upper_arm_ik_target.'+suffix];control.matrix.translation=rig.matrix_world.inverted()@pole;key(control,frame)
        bpy.context.view_layer.update();skin=points(body);sole=points(shoes)
        if sole0 is None:sole0=sole.copy();initial=skin.copy()
        row={'frame':frame,'elevation_phase':q,'rotation_phase':turn,'shoe_motion_m':float(np.max(np.linalg.norm(sole-sole0,axis=1))),'grips':{},'joints':{}}
        for side,suffix in [('l','L'),('r','R')]:
            ids,ref=tracked[side];local=(np.c_[skin,np.ones(len(skin))]@np.array(anchors[side].matrix_world.inverted()).T)[:,:3]
            row['grips'][side]={'tracked_points':len(ids),'drift_m':float(np.max(np.linalg.norm(local[ids]-ref,axis=1)))}
            s=rig.matrix_world@rig.pose.bones['ORG-upper_arm.'+suffix].head;e=rig.matrix_world@rig.pose.bones['ORG-forearm.'+suffix].head;w=rig.matrix_world@rig.pose.bones['ORG-hand.'+suffix].head
            row['joints'][side]={'shoulder_m':list(s),'elbow_m':list(e),'wrist_m':list(w),'elbow_flex_deg':math.degrees((e-s).angle(w-e)),'target_error_m':(w-targets[side].matrix_world.translation).length}
        rows.append(row)
        if frame in [1,31,46,61,91,121,136,151,181]:pose_checks.append({'frame':frame,'regions':check(body,regions)})
        if frame%30==0:print('ARNOLD_FRAME',frame,flush=True)
    closure=float(np.max(np.linalg.norm(skin-initial,axis=1)))
    for obj in [rig,*anchors.values()]:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for p in fc.keyframe_points:p.interpolation='BEZIER';p.handle_left_type='AUTO_CLAMPED';p.handle_right_type='AUTO_CLAMPED'
                        fc.modifiers.new('CYCLES')
    scene.frame_start=1;scene.frame_end=180;scene.render.fps=30;scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'arnold.blend'))
    report={'variant':'standing bilateral Arnold dumbbell press','frames':181,'render_frames':180,'fps':30,'duration_s':6,'authority':'independent dumbbell -> complete wrist target -> native Rigify IK; original fitted fingers retained','reference':'https://macrosinc.net/exercises/shoulders/dumbbell-arnold-press/','limits':['Authoring study, not clinical ROM or muscle activation simulation.','Native clavicle elevation is an authored shoulder-girdle approximation, not complete scapulothoracic biomechanics.','New movement human reviews pending.'],'closure_position_m':closure,'rows':rows,'pose_checks':pose_checks,'skin_regions':regions}
    (output/'arnold.json').write_text(json.dumps(report,indent=2));return {'frames':181,'closure_m':closure,'max_grip_drift_m':max(g['drift_m'] for r in rows for g in r['grips'].values()),'max_target_error_m':max(g['target_error_m'] for r in rows for g in r['joints'].values())}
