"""Small shared-bar cohort draft using native Rigify IK and explicit contact authorities."""
import bpy, json, math
import numpy as np
from mathutils import Matrix, Vector
from playback_qa import points


def empty(name):
    obj=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(obj);return obj


def material(name,color,metal=0):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;p=mat.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.4
    return mat


def cube(name,position,size,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position);obj=bpy.context.object;obj.name=name;obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(mat)
    bevel=obj.modifiers.new('Rounded equipment edge','BEVEL');bevel.width=.012;bevel.segments=3
    return obj


def cylinder(name,x,radius,depth,mat,parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth,rotation=(0,math.pi/2,0))
    obj=bpy.context.object;obj.name=name;obj.parent=parent;obj.location=(x,0,0);obj.data.materials.append(mat)
    bevel=obj.modifiers.new('Machined edge','BEVEL');bevel.width=.002;bevel.segments=2
    for poly in obj.data.polygons:poly.use_smooth=True
    return obj


def key(bone,frame):
    channel='rotation_quaternion' if bone.rotation_mode=='QUATERNION' else 'rotation_euler'
    for prop in ['location',channel,'scale']:bone.keyframe_insert(prop,frame=frame,group=bone.name)


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];exercise=config['exercise']
    assert exercise in {'bench-press','squat'}
    # Preserve fitted finger controls and the complete hand-to-handle relationship.
    relation={};anchor_rotation={};tracked={};skin=points(body)
    for side,suffix in [('l','L'),('r','R')]:
        anchor=bpy.data.objects['R2_Grip_'+side];hand=rig.pose.bones['hand_fk.'+suffix]
        relation[side]=(rig.matrix_world@hand.matrix).inverted()@anchor.matrix_world
        anchor_rotation[side]=anchor.matrix_world.to_3x3().to_4x4()
        local=(np.c_[skin,np.ones(len(skin))]@np.array(anchor.matrix_world.inverted()).T)[:,:3]
        radial=np.linalg.norm(local[:,1:],axis=1);ids=np.where((abs(local[:,0])<.075)&(abs(radial-.014)<.002))[0]
        tracked[side]=(ids,local[ids].copy());assert len(ids)>10
    # Native Rigify drivers own IK/FK switching: clear only the previous action.
    assert rig.animation_data and rig.animation_data.drivers
    rig.animation_data.action=None
    for obj in list(scene.objects):
        if obj.name.startswith(('Dumbbell','R2_Grip')):bpy.data.objects.remove(obj,do_unlink=True)
    torso=rig.pose.bones['torso'];base_torso=torso.matrix.copy()
    feet={s:rig.pose.bones['foot_fk.'+s].matrix@rig.data.bones['foot_fk.'+s].matrix_local.inverted()@rig.data.bones['foot_ik.'+s].matrix_local for s in ['L','R']}
    source_parents={o.name:o.parent.name if o.parent else None for o in scene.objects if o.type=='MESH' or o==rig}
    placement=empty('R2 whole character placement')
    members={o for o in scene.objects if o.type=='MESH' or o==rig}
    for obj in members:
        if obj.parent not in members:
            world=obj.matrix_world.copy();obj.parent=placement;obj.matrix_world=world
    if exercise=='bench-press':placement.matrix_world=Matrix.Translation((0,-.95,.56))@Matrix.Rotation(-math.pi/2,4,'X')
    bpy.context.view_layer.update()
    bar=empty('R2 shared bar authority');grips={};targets={}
    steel=material('R2 brushed steel',(.20,.23,.26),.75);rubber=material('R2 rubber',(.045,.05,.055),.1)
    cylinder('R2 bar shaft',0,.014,1.55,steel,bar)
    for sign in [-1,1]:
        cylinder('R2 plate',sign*.83,.16,.03,rubber,bar);cylinder('R2 sleeve',sign*.84,.025,.23,steel,bar)
    if exercise=='bench-press':
        pad=material('R2 bench fabric',(.07,.09,.11))
        cube('R2 bench pad',(0,.20,.41),(.32,1.22,.07),pad)
        for y in [-.29,.68]:
            cube('R2 bench leg',(0,y,.205),(.08,.08,.34),steel);cube('R2 bench base',(0,y,.035),(.52,.13,.06),rubber)
    for side,suffix in [('l','L'),('r','R')]:
        arm=rig.pose.bones['upper_arm_parent.'+suffix];arm['IK_FK']=0.;arm['IK_Stretch']=0.;arm['pole_vector']=True
        leg=rig.pose.bones['thigh_parent.'+suffix];leg['IK_FK']=0.;leg['IK_Stretch']=0.;leg['pole_vector']=True
        sign=1 if side=='l' else -1
        grip=empty('R2 shared grip '+side);grip.parent=bar
        grip.matrix_basis=Matrix.Translation((sign*(.31 if exercise=='bench-press' else .43),0,0))@Matrix.Rotation(math.pi,4,'Y')@anchor_rotation[side]
        target=empty('R2 wrist target '+side);target.parent=grip;target.matrix_basis=relation[side].inverted();targets[side]=target;grips[side]=grip
        hand=rig.pose.bones['hand_ik.'+suffix];constraint=hand.constraints.new('COPY_TRANSFORMS');constraint.name='Shared bar owns hand target';constraint.target=target;constraint.owner_space='WORLD';constraint.target_space='WORLD'
        foot=rig.pose.bones['foot_ik.'+suffix]
        if exercise=='bench-press':
            foot.matrix=Matrix.Translation((sign*.22,.486,.49))@Matrix.Rotation(math.pi/2,4,'X')@rig.data.bones[foot.name].matrix_local.to_3x3().to_4x4()
        else:foot.matrix=feet[suffix]
        pole=rig.pose.bones['thigh_ik_target.'+suffix];pole.matrix.translation=(sign*.22,-.85,.5) if exercise=='squat' else (sign*.22,-.6,.5)
        arm_pole=rig.pose.bones['upper_arm_ik_target.'+suffix]
        world_pole=Vector((sign*.75,.20,.43)) if exercise=='bench-press' else Vector((sign*.70,.32,1.14))
        arm_pole.matrix.translation=rig.matrix_world.inverted()@world_pole
    rig.update_tag();bpy.context.view_layer.update();samples=[];initial_sole=None
    for frame in range(1,182):
        scene.frame_set(frame)
        phase=(frame-1)/180.;u=phase*2 if phase<=.5 else (1-phase)*2;q=u*u*u*(10-15*u+6*u*u)
        if exercise=='bench-press':bar.matrix_world=Matrix.Translation((0,.48-.18*q,1.10-.33*q))
        else:
            movement=Matrix.Translation((0,.16*q,-.42*q))@Matrix.Translation(base_torso.translation)@Matrix.Rotation(math.radians(25)*q,4,'X')@Matrix.Translation(-base_torso.translation)
            torso.matrix=movement@base_torso;bar.matrix_world=movement@Matrix.Translation((0,.105,1.43))
        bpy.context.view_layer.update()
        for prop in ['location','rotation_euler','scale']:bar.keyframe_insert(prop,frame=frame,group='Shared bar')
        key(torso,frame)
        p=points(body);sole=points(bpy.data.objects['Trophe_R2_Trainers'])
        if initial_sole is None:initial_sole=sole
        contacts={}
        for side,suffix in [('l','L'),('r','R')]:
            ids,reference=tracked[side];local=(np.c_[p,np.ones(len(p))]@np.array(grips[side].matrix_world.inverted()).T)[:,:3]
            contacts[side]={'tracked_points':len(ids),'max_grip_drift_m':float(np.max(np.linalg.norm(local[ids]-reference,axis=1))),'wrist_target_error_m':(rig.matrix_world@rig.pose.bones['ORG-hand.'+suffix].head-targets[side].matrix_world.translation).length}
        samples.append({'frame':frame,'phase':q,'contacts':contacts,'shoe_min_z_m':float(sole[:,2].min()),'shoe_motion_m':float(np.max(np.linalg.norm(sole-initial_sole,axis=1)))})
        if frame%30==0:print('R2_COHORT_FRAME',exercise,frame,flush=True)
    for obj in [rig,bar]:
        action=obj.animation_data.action
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for point in fc.keyframe_points:point.interpolation='BEZIER';point.handle_left_type='AUTO_CLAMPED';point.handle_right_type='AUTO_CLAMPED'
                        fc.modifiers.new('CYCLES')
    scene.frame_start=1;scene.frame_end=180;scene.render.fps=30;scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'draft.blend'))
    record={'exercise':exercise,'source_mesh_parents':source_parents,'whole_character_placement':'common root for rig and all top-level meshes; armature modifier alone does not carry an unparented garment through an object-space placement','duration_s':6,'fps':30,'render_frames':180,'closure_frame':181,'authority':'independent shared bar -> two rigid grip anchors -> wrist targets -> native Rigify IK; no competing hand parents or feedback','curve':'quintic eased descent3s/ascent3s; fixed camera; no added sway/noise','stage':'draft requiring support/contact/deformation and human review','human_reviews':'pending','cloth':'fitted garment skinning; no simulation claimed','samples':samples}
    (output/'cohort.json').write_text(json.dumps(record,indent=2));return {'exercise':exercise,'frames':181,'max_grip_drift_m':max(c['max_grip_drift_m'] for f in samples for c in f['contacts'].values()),'minimum_shoe_z_m':min(f['shoe_min_z_m'] for f in samples)}
