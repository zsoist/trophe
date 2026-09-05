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


def ring(name,x,outer,inner,depth,mat,parent):
    vertices=[];faces=[];n=64
    for dx,radius in [(-depth/2,outer),(depth/2,outer),(-depth/2,inner),(depth/2,inner)]:
        vertices.extend([(x+dx,radius*math.cos(i*2*math.pi/n),radius*math.sin(i*2*math.pi/n)) for i in range(n)])
    for i in range(n):
        j=(i+1)%n
        faces.extend([(i,j,n+j,n+i),(2*n+j,2*n+i,3*n+i,3*n+j),(j,i,2*n+i,2*n+j),(n+i,n+j,3*n+j,3*n+i)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=parent;mesh.materials.append(mat)
    bevel=obj.modifiers.new('Finished ring edges','BEVEL');bevel.width=.001;bevel.segments=2
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
    setup=config.get('bench_setup',{});setup_record={}
    if exercise=='bench-press' and setup:
        neck=rig.pose.bones['neck'];head=rig.pose.bones['head'];old_head_rotation=(rig.matrix_world@head.matrix).to_3x3().to_4x4()
        neck_world=rig.matrix_world@neck.matrix;pivot=neck_world.translation.copy()
        rotated=Matrix.Translation(pivot)@Matrix.Rotation(math.radians(setup.get('neck_pitch_deg',0)),4,'X')@Matrix.Translation(-pivot)@neck_world
        neck.matrix=rig.matrix_world.inverted()@rotated;bpy.context.view_layer.update()
        head_world=rig.matrix_world@head.matrix;head.matrix=rig.matrix_world.inverted()@Matrix.Translation(head_world.translation)@old_head_rotation
        bpy.context.view_layer.update()
        shorts=bpy.data.objects['SportsShorts'];setup_record['shorts_modifiers_before']=[{'name':m.name,'type':m.type} for m in shorts.modifiers]
        setup_record['removed_short_shells']=[]
        if setup.get('shorts_surface'):
            for mod in list(shorts.modifiers):
                if mod.type=='SOLIDIFY':setup_record['removed_short_shells'].append(mod.name);shorts.modifiers.remove(mod)
        if setup.get('shorts_rest_self_union'):
            bpy.ops.object.select_all(action='DESELECT');shorts.select_set(True);bpy.context.view_layer.objects.active=shorts
            armatures=[(m,m.show_viewport,m.show_render) for m in shorts.modifiers if m.type=='ARMATURE']
            for mod,_,__ in armatures:mod.show_viewport=False;mod.show_render=False
            for mod in list(shorts.modifiers):
                if mod.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=mod.name)
            donor=shorts.copy();donor.data=shorts.data.copy();scene.collection.objects.link(donor);donor.select_set(False)
            for mod in list(donor.modifiers):donor.modifiers.remove(mod)
            count_before=len(shorts.data.vertices);donor_vertex_count=len(donor.data.vertices)
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.intersect_boolean(operation='UNION',use_self=True,solver='EXACT')
            bpy.ops.object.mode_set(mode='OBJECT')
            import bmesh
            bm=bmesh.new();bm.from_mesh(shorts.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(shorts.data);bm.free()
            if setup.get('shorts_body_weights'):
                bpy.data.objects.remove(donor,do_unlink=True)
                donor=body.copy();donor.data=body.data.copy();scene.collection.objects.link(donor);donor.select_set(False)
                for mod in list(donor.modifiers):
                    if mod.type=='ARMATURE':mod.show_viewport=False;mod.show_render=False
                donor_vertex_count=len(donor.data.vertices)
                bpy.context.view_layer.update()
            transfer=shorts.modifiers.new('Restore generated textile vertex weights','DATA_TRANSFER');transfer.object=donor;transfer.use_vert_data=True;transfer.data_types_verts={'VGROUP_WEIGHTS'};transfer.vert_mapping='POLYINTERP_NEAREST';transfer.mix_factor=1.;transfer.layers_vgroup_select_src='ALL';transfer.layers_vgroup_select_dst='NAME'
            bpy.ops.object.datalayout_transfer(modifier=transfer.name);bpy.ops.object.modifier_apply(modifier=transfer.name)
            assert len(donor.data.vertices)==donor_vertex_count,'Native multi-object edit must not mutate weight donor'
            names={b.name for b in rig.data.bones if b.use_deform}
            diagnostic={'donor_groups':[g.name for g in donor.vertex_groups],'donor_unweighted':[v.index for v in donor.data.vertices if not any(g.weight>0 and donor.vertex_groups[g.group].name in names for g in v.groups)],'repaired_unweighted':[{'id':v.index,'co':list(v.co),'groups':[(shorts.vertex_groups[g.group].name,g.weight) for g in v.groups]} for v in shorts.data.vertices if not any(g.weight>0 and shorts.vertex_groups[g.group].name in names for g in v.groups)]}
            (output/'shorts-weight-diagnostic.json').write_text(json.dumps(diagnostic,indent=2))
            bpy.data.objects.remove(donor,do_unlink=True)
            for mod,viewport,render in armatures:mod.show_viewport=viewport;mod.show_render=render
            assert all(any(g.weight>0 and shorts.vertex_groups[g.group].name in names for g in v.groups) for v in shorts.data.vertices),'Unweighted repaired textile vertices'
            setup_record['shorts_rest_union']={'native_operator':'mesh.intersect_boolean UNION/use_self/EXACT','reason':'Rest-pose surface already self-crosses at crotch; repair the existing sealed textile surface before animation. No rig/body edit.','vertices_before':count_before,'vertices_after':len(shorts.data.vertices),'weighted_vertices':sum(bool(v.groups) for v in shorts.data.vertices)}
    correction=None
    if setup.get('elbow_pose_smooth'):
        diagnostic=json.loads(open(config['diagnostic_source'],encoding='utf-8-sig').read());core={i for row in diagnostic['frames'] for region in row['skin_regions'].values() for hit in region['hits'] for tri in hit['triangles'] for i in tri}
        group=body.vertex_groups.new(name='Bench inner elbow pose fold');adj={v.index:set() for v in body.data.vertices}
        for edge in body.data.edges:
            a,b=edge.vertices;adj[a].add(b);adj[b].add(a)
        seen=set(core);rings=[set(core)]
        for _ in range(2):
            band={j for i in rings[-1] for j in adj[i]}-seen;rings.append(band);seen|=band
        for band,weight in zip(rings,[1.,2/3,1/3]):
            if band:group.add(sorted(band),weight,'REPLACE')
        correction=body.modifiers.new('Bench pose-dependent inner elbow fold','CORRECTIVE_SMOOTH' if setup.get('elbow_native_corrective') else 'SMOOTH');correction.vertex_group=group.name;correction.factor=0.;correction.iterations=5
        if setup.get('elbow_native_corrective'):
            correction.rest_source='BIND';correction.smooth_type='LENGTH_WEIGHTED'
            saved_pose=rig.data.pose_position;rig.data.pose_position='REST';bpy.context.view_layer.update()
            bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
            bpy.ops.object.correctivesmooth_bind(modifier=correction.name);bpy.context.view_layer.update();assert correction.is_bind
            rig.data.pose_position=saved_pose;bpy.context.view_layer.update()
        setup_record['elbow_pose_corrective']={'native_modifier':correction.type,'reference':'Original skeleton REST with active body shape and masks; frame1 factor0 preserves animated initial surface','core_source_ids':sorted(core),'feather_rings':[sorted(v) for v in rings[1:]],'iterations':5,'factor_at_top':0,'factor_at_bottom':setup['elbow_pose_smooth'],'meaning':'Local soft-tissue fold response to flexion, not activation or a force simulation; body/hand weights unchanged.'}
    if setup.get('tank_native_fit'):
        shirt=bpy.data.objects['SportsTank'];group=shirt.vertex_groups.new(name='Bench shoulder textile fit')
        for v in shirt.data.vertices:
            if v.co.z>1.18:group.add([v.index],min(1,(v.co.z-1.18)/.07),'REPLACE')
        wrap=shirt.modifiers.new('Native shoulder garment clearance','SHRINKWRAP');wrap.target=body;wrap.vertex_group=group.name;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.004
        setup_record['tank_fit']='Native above-surface Shrinkwrap on shoulder/chest panel with lower falloff,4mm; no cloth physics claimed.'
    bar=empty('R2 shared bar authority');grips={};targets={}
    steel=material('R2 brushed steel',(.20,.23,.26),.75);rubber=material('R2 rubber',(.045,.05,.055),.1)
    cylinder('R2 bar shaft',0,.014,1.55,steel,bar)
    for sign in [-1,1]:
        if setup.get('collars'):
            ring('R2 plate',sign*.83,.16,.0255,.03,rubber,bar)
            ring('R2 collar',sign*.863,.042,.0251,.036,steel,bar)
            latch=cube('R2 collar closed lever',(sign*.863,0,.046),(.028,.025,.016),rubber);latch.parent=bar
        else:cylinder('R2 plate',sign*.83,.16,.03,rubber,bar)
        cylinder('R2 sleeve',sign*.84,.025,.23,steel,bar)
    if exercise=='bench-press':
        pad=material('R2 bench fabric',(.07,.09,.11))
        cube('R2 bench pad',(0,setup.get('pad_y',.20),setup.get('pad_z',.41)),(.32,1.22,.07),pad)
        for y in [-.29,.68]:
            cube('R2 bench leg',(0,y,.205),(.08,.08,.34),steel);cube('R2 bench base',(0,y,.035),(.52,.13,.06),rubber)
    for side,suffix in [('l','L'),('r','R')]:
        arm=rig.pose.bones['upper_arm_parent.'+suffix];arm['IK_FK']=0.;arm['IK_Stretch']=0.;arm['pole_vector']=True
        leg=rig.pose.bones['thigh_parent.'+suffix];leg['IK_FK']=0.;leg['IK_Stretch']=0.;leg['pole_vector']=True
        sign=1 if side=='l' else -1
        grip=empty('R2 shared grip '+side);grip.parent=bar
        orientation=Matrix.Rotation(math.pi,4,'Y')@anchor_rotation[side]
        if setup.get('calibrate_grip_roll'):
            axis=(orientation@relation[side].inverted()).to_3x3()@Vector((0,1,0))
            roll=math.pi/2-math.atan2(axis.z,axis.y)
            orientation=Matrix.Rotation(roll,4,'X')@orientation
            setup_record['grip_roll_'+side]={'angle_deg':math.degrees(roll),'reference':'Metacarpal bone sagittal projection aligned to vertical forearm intent. Rotate full hand/grip about cylindrical shaft; no finger-angle rewrite or moving handle away from fingers.'}
        grip.matrix_basis=Matrix.Translation((sign*(setup.get('grip_half_width_m',.31) if exercise=='bench-press' else .43),0,0))@orientation
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
    rig.update_tag();bpy.context.view_layer.update();samples=[];initial_sole=None;top=1.10
    if exercise=='bench-press' and setup.get('top_elbow_flexion_deg'):
        shoulder=rig.matrix_world@rig.pose.bones['ORG-upper_arm.L'].head
        upper=rig.data.bones['ORG-upper_arm.L'].length;fore=rig.data.bones['ORG-forearm.L'].length
        desired=math.sqrt(upper*upper+fore*fore+2*upper*fore*math.cos(math.radians(setup['top_elbow_flexion_deg'])))
        offset=(grips['l'].matrix_basis@relation['l'].inverted()).translation
        top=shoulder.z+math.sqrt(desired*desired-(offset.x-shoulder.x)**2-(.48+offset.y-shoulder.y)**2)-offset.z
        setup_record['computed_top_bar_z_m']=top
    for frame in range(1,182):
        scene.frame_set(frame)
        phase=(frame-1)/180.;u=phase*2 if phase<=.5 else (1-phase)*2;q=u*u*u*(10-15*u+6*u*u)
        if exercise=='bench-press':bar.matrix_world=Matrix.Translation((0,.48-.18*q,top-(top-setup.get('bottom_bar_z',.77))*q))
        else:
            movement=Matrix.Translation((0,.16*q,-.42*q))@Matrix.Translation(base_torso.translation)@Matrix.Rotation(math.radians(25)*q,4,'X')@Matrix.Translation(-base_torso.translation)
            torso.matrix=movement@base_torso;bar.matrix_world=movement@Matrix.Translation((0,.105,1.43))
        bpy.context.view_layer.update()
        if correction:
            correction.factor=setup['elbow_pose_smooth']*q;correction.keyframe_insert('factor',frame=frame)
            bpy.context.view_layer.update()
        if exercise=='bench-press' and setup.get('stacked_elbow_poles'):
            for side,suffix in [('l','L'),('r','R')]:
                shoulder=rig.matrix_world@rig.pose.bones['ORG-upper_arm.'+suffix].head;wrist=targets[side].matrix_world.translation
                desired_elbow=wrist-Vector((0,0,rig.data.bones['ORG-forearm.'+suffix].length))
                midpoint=(shoulder+wrist)/2;pole=midpoint+(desired_elbow-midpoint)*4
                control=rig.pose.bones['upper_arm_ik_target.'+suffix];control.matrix.translation=rig.matrix_world.inverted()@pole;key(control,frame)
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
    for obj in [rig,bar]+([body] if correction else []):
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
    record['bench_setup']=setup;record['bench_setup_result']=setup_record
    (output/'cohort.json').write_text(json.dumps(record,indent=2));return {'exercise':exercise,'frames':181,'max_grip_drift_m':max(c['max_grip_drift_m'] for f in samples for c in f['contacts'].values()),'minimum_shoe_z_m':min(f['shoe_min_z_m'] for f in samples),'bench_setup_result':setup_record}
