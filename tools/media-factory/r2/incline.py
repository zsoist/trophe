"""Incline dumbbell study: supported native Rigify IK, preserved cylindrical grip."""
import bpy,json,math
import numpy as np
from mathutils import Matrix,Vector
from cohort import empty,material,cylinder,cube,key
from playback_qa import points
from localize_contact import mesh_data
from surface_qa import check
from bench_qa import crossings,tree


def ease(t):
    t=max(0.,min(1.,t));return t*t*t*(10-15*t+6*t*t)


def run(config,out):
    # Use the proven cylindrical grasp, not the overhead cup hand pose.
    bpy.ops.wm.open_mainfile(filepath=config['grip_source'])
    s=bpy.context.scene;s.frame_set(91);bpy.context.view_layer.update()
    r=bpy.data.objects['Trophe_R2_Authoring'];skin=points(bpy.data.objects['Trophe_R2_Athlete'])
    relations={};rotations={};fingers={};tracked={}
    for side,short in [('L','l'),('R','r')]:
        anchor=bpy.data.objects['R2_Grip_'+short];hand=r.pose.bones['hand_fk.'+side]
        relations[side]=(r.matrix_world@hand.matrix).inverted()@anchor.matrix_world
        rotation=anchor.matrix_world.to_3x3().to_4x4()
        # Complete grasp rotates around the shaft; metacarpal aligns with vertical forearm.
        axis=(rotation@relations[side].inverted()).to_3x3()@Vector((0,1,0))
        rotations[side]=Matrix.Rotation(math.pi/2-math.atan2(axis.z,axis.y),4,'X')@rotation
        local=(np.c_[skin,np.ones(len(skin))]@np.array(anchor.matrix_world.inverted()).T)[:,:3]
        ids=np.where((abs(local[:,0])<.075)&(abs(np.linalg.norm(local[:,1:],axis=1)-.014)<.002))[0]
        assert len(ids)>10;tracked[side]=(ids,local[ids].copy())
    for b in r.pose.bones:
        if b.name.startswith(('f_index','f_middle','f_ring','f_pinky','thumb','palm')):fingers[b.name]=b.matrix_basis.copy()
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    s=bpy.context.scene;r=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];shoe=bpy.data.objects['Trophe_R2_Trainers']
    s.frame_set(1);bpy.context.view_layer.update();assert r.animation_data.drivers
    r.animation_data.action=None
    for b in r.pose.bones:b.matrix_basis=Matrix.Identity(4)
    for n,m in fingers.items():r.pose.bones[n].matrix_basis=m
    for side in ['L','R']:
        hand=r.pose.bones['hand_ik.'+side]
        for c in list(hand.constraints):
            if c.name.startswith(('Copa','Arnold','Shared bar','Incline')):hand.constraints.remove(c)
    for obj in list(s.objects):
        if obj.name.startswith(('Copa ','Dumbbell','R2_Grip','Arnold wrist','Neutral floor','Review camera')):bpy.data.objects.remove(obj,do_unlink=True)
    # Keep the approved native arm restoration and its angle-driven local elbow modifier.
    # Clear old exercise actions, retaining native rig and shape drivers.
    for obj in [body,bpy.data.objects['SportsTank'],bpy.data.objects['SportsShorts']]:
        if obj.animation_data:obj.animation_data.action=None
    members={o for o in s.objects if o.type=='MESH' or o==r}
    placement=empty('Incline whole character placement')
    for obj in members:
        if obj.parent not in members:
            world=obj.matrix_world.copy();obj.parent=placement;obj.matrix_world=world
    angle=math.radians(config.get('incline_deg',30));rot=Matrix.Rotation(angle-math.pi/2,4,'X')
    pelvis=Vector((0,0,.90));placement.matrix_world=Matrix.Translation(Vector((0,0,.52))-rot.to_3x3()@pelvis)@rot
    bpy.context.view_layer.update()
    for side,sign in [('L',1),('R',-1)]:
        for part in ['upper_arm','thigh']:
            pb=r.pose.bones[part+'_parent.'+side];pb['IK_FK']=0.;pb['IK_Stretch']=0.;pb['pole_vector']=True
        foot=r.pose.bones['foot_ik.'+side];foot.matrix=r.matrix_world.inverted()@Matrix.Translation((sign*.22,-.48,.073721))
        r.pose.bones['thigh_ik_target.'+side].matrix.translation=r.matrix_world.inverted()@Vector((sign*.22,-1.,.5))
    bpy.context.view_layer.update()
    steel=material('Incline brushed steel',(.20,.23,.26),.75);rubber=material('Incline rubber',(.035,.043,.05),.05);padmat=material('Incline upholstery',(.055,.07,.085))
    bench=empty('Incline backrest 30deg');bench.matrix_world=Matrix.Translation((0,.36,.614))@Matrix.Rotation(angle,4,'X')
    pad=cube('Incline bench backrest',(0,0,0),(.34,1.06,.065),padmat);pad.parent=bench;pad.location=(0,0,0)
    cube('Incline bench seat',(0,-.16,.425),(.36,.32,.065),padmat)
    for y,z in [(-.2,.23),(.63,.42)]:
        cube('Incline bench leg',(0,y,z),(.07,.07,2*z-.04),steel);cube('Incline bench foot',(0,y,.028),(.56,.13,.055),rubber)
    anchors={};targets={};shoulders={}
    for side,sign in [('L',1),('R',-1)]:
        anchor=empty('Incline dumbbell '+side);anchor.rotation_mode='QUATERNION';anchors[side]=anchor
        cylinder('Incline weight handle '+side,0,.014,.18,steel,anchor)
        for k in [-1,1]:
            cylinder('Incline weight head '+side,k*.115,.065,.055,rubber,anchor)
            cylinder('Incline weight endcap '+side,k*.15,.025,.015,steel,anchor)
        target=empty('Incline wrist target '+side);target.parent=anchor;target.matrix_basis=relations[side].inverted();targets[side]=target
        c=r.pose.bones['hand_ik.'+side].constraints.new('COPY_TRANSFORMS');c.name='Incline independent object owns full wrist';c.target=target;c.owner_space='WORLD';c.target_space='WORLD'
        shoulders[side]=(r.matrix_world@r.pose.bones['ORG-upper_arm.'+side].head).copy()
    records=[];initial=None;sole0=None;checks=[];prev={}
    bodyids={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
    regions={side:[v.index for v in body.data.vertices if v.index in bodyids and sign*v.co.x>.07 and 1.10<v.co.z<1.54] for side,sign in [('L',1),('R',-1)]}
    for f in range(1,182):
        s.frame_set(f);t=(f-1)/180;q=ease(t/.55) if t<=.55 else 1-ease((t-.55)/.45)
        for side,sign in [('L',1),('R',-1)]:
            sh=shoulders[side];upper=r.data.bones['ORG-upper_arm.'+side].length;fore=r.data.bones['ORG-forearm.'+side].length
            wrist=Vector((sign*(.22+.18*q),sh.y-.15*q,sh.z+(upper+fore)*.98-.28*q))
            orientation=rotations[side]
            anchor=anchors[side];offset=(orientation@relations[side].inverted()).translation
            anchor.matrix_world=Matrix.Translation(wrist-offset)@orientation
            if side in prev:anchor.rotation_quaternion.make_compatible(prev[side])
            prev[side]=anchor.rotation_quaternion.copy()
            for prop in ['location','rotation_quaternion','scale']:anchor.keyframe_insert(prop,frame=f)
        bpy.context.view_layer.update()
        for side in ['L','R']:
            sh=shoulders[side];w=targets[side].matrix_world.translation
            hint=w-Vector((0,0,r.data.bones['ORG-forearm.'+side].length))
            mid=(sh+w)/2;pole=mid+4*(hint-mid)
            pb=r.pose.bones['upper_arm_ik_target.'+side];pb.matrix.translation=r.matrix_world.inverted()@pole;key(pb,f)
        bpy.context.view_layer.update()
        # Rotate the complete cylinder/grasp around the prescribed wrist, using
        # the solved forearm direction. This aligns metacarpals without moving
        # the wrist target or changing finger articulation.
        for side in ['L','R']:
            e=r.matrix_world@r.pose.bones['ORG-forearm.'+side].head;w=targets[side].matrix_world.translation
            base=rotations[side];hand_axis=(base@relations[side].inverted()).to_3x3()@Vector((0,1,0))
            orient=hand_axis.rotation_difference((w-e).normalized()).to_matrix().to_4x4()@base
            offset=(orient@relations[side].inverted()).translation
            a=anchors[side];a.matrix_world=Matrix.Translation(w-offset)@orient
            a.rotation_quaternion.make_compatible(prev[side]);prev[side]=a.rotation_quaternion.copy()
            for prop in ['location','rotation_quaternion','scale']:a.keyframe_insert(prop,frame=f)
        bpy.context.view_layer.update();p=points(body);soles=points(shoe)
        if initial is None:initial=p.copy();sole0=soles.copy()
        row={'frame':f,'descent':q,'shoe_motion_m':float(np.linalg.norm(soles-sole0,axis=1).max()),'sides':{}}
        for side in ['L','R']:
            ids,ref=tracked[side];assert len(p)==len(skin)
            local=(np.c_[p,np.ones(len(p))]@np.array(anchors[side].matrix_world.inverted()).T)[:,:3]
            head=lambda n:r.matrix_world@r.pose.bones[n+'.'+side].head
            sh=head('ORG-upper_arm');e=head('ORG-forearm');w=head('ORG-hand');hand=r.matrix_world@r.pose.bones['ORG-hand.'+side].tail
            row['sides'][side]={'shoulder':list(sh),'elbow':list(e),'wrist':list(w),'elbow_flex_deg':math.degrees((e-sh).angle(w-e)),'wrist_axis_deg':math.degrees((w-e).angle(hand-w)),'wrist_error_m':(w-targets[side].matrix_world.translation).length,'skin_grip_drift_m':float(np.linalg.norm(local[ids]-ref,axis=1).max())}
        records.append(row)
        if f in [1,46,76,100,136,161,181]:checks.append({'frame':f,'skin':check(body,regions)})
        if f%30==0:print('INCLINE_FRAME',f,flush=True)
    for obj in [r,*anchors.values()]:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type='AUTO_CLAMPED';k.handle_right_type='AUTO_CLAMPED'
                        fc.modifiers.new('CYCLES')
    s.frame_start=1;s.frame_end=180;s.render.fps=30;s.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    report={'variant':'30deg incline bilateral dumbbell chest press; closed pronated cylindrical grip','authority':'Each independent dumbbell -> complete rigid wrist target -> native Rigify IK; no FK bake or retiming','reference':'https://www.acefitness.org/resources/everyone/exercise-library/25/incline-chest-press/','duration_s':6,'fps':30,'frames':180,'closure_frame':181,'closure_surface_m':float(np.linalg.norm(p-initial,axis=1).max()),'body_source':'Approved copa native arm restoration, reset exercise pose; cylindrical fingers from proven curl master','rows':records,'pose_checks':checks,'reviews':{'visual':'pending','technique':'pending'},'limits':['Authored movement, not muscle force simulation','Joint and clothing validation required before release']}
    (out/'incline.json').write_text(json.dumps(report,indent=2))
    return {'closure_m':report['closure_surface_m'],'max_wrist_error_m':max(v['wrist_error_m'] for row in records for v in row['sides'].values()),'max_skin_grip_drift_m':max(v['skin_grip_drift_m'] for row in records for v in row['sides'].values())}


def qa(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;r=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];shoe=bpy.data.objects['Trophe_R2_Trainers']
    bodyids={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
    support_ids={n:[v.index for v in body.data.vertices if v.index in bodyids and lo<v.co.z<hi and abs(v.co.x)<wide] for n,lo,hi,wide in [('head',1.58,1.85,.12),('upper_back',1.2,1.47,.19),('pelvis',.77,1.02,.18)]}
    pads=[bpy.data.objects['Incline bench backrest'],bpy.data.objects['Incline bench seat']];padtrees=[tree(mesh_data(p)) for p in pads]
    props=[o for o in s.objects if o.type=='MESH' and o.name.startswith('Incline weight')]
    rows=[];tracked={};first=None;previous=None
    for f in range(1,182):
        s.frame_set(f);bpy.context.view_layer.update();data=mesh_data(body);p,t,ids=data;lookup={v:i for i,v in enumerate(ids)}
        row={'frame':f,'sides':{},'equipment_crossings':{},'shoe_min_z_m':float(points(shoe)[:,2].min())}
        if first is None:first=p.copy()
        row['surface_step_max_m']=float(np.linalg.norm(p-previous,axis=1).max()) if previous is not None else 0.;previous=p.copy()
        for side in ['L','R']:
            anchor=bpy.data.objects['Incline dumbbell '+side];target=bpy.data.objects['Incline wrist target '+side];local=(np.c_[p,np.ones(len(p))]@np.array(anchor.matrix_world.inverted()).T)[:,:3]
            if side not in tracked:
                use=np.where((abs(local[:,0])<.075)&(abs(np.linalg.norm(local[:,1:],axis=1)-.014)<.002))[0];assert len(use)>10;tracked[side]=(use,local[use].copy())
            use,ref=tracked[side];head=lambda n:r.matrix_world@r.pose.bones[n+'.'+side].head
            sh=head('ORG-upper_arm');e=head('ORG-forearm');w=head('ORG-hand');h=r.matrix_world@r.pose.bones['ORG-hand.'+side].tail
            row['sides'][side]={'tracked_skin_points':len(use),'drift_m':float(np.linalg.norm(local[use]-ref,axis=1).max()),'wrist_error_m':(w-target.matrix_world.translation).length,'wrist_axis_deg':math.degrees((w-e).angle(h-w)),'elbow_flex_deg':math.degrees((e-sh).angle(w-e))}
        # Real evaluated triangle crossings, not only overlapping bounds.
        for o in props:
            hits=crossings(data,mesh_data(o))
            if hits:row['equipment_crossings'][o.name]=hits
        if f in [1,46,76,100,136,161,181]:
            row['supports']={}
            for name,source in support_ids.items():
                q=p[[lookup[i] for i in source if i in lookup]];dist=[min(tr.find_nearest(Vector(v))[3] for tr in padtrees) for v in q];k=int(np.argmin(dist));row['supports'][name]={'min_pad_distance_m':float(dist[k]),'nearest_skin_point':q[k].tolist()}
            row['cloth']={}
            for name in ['SportsTank','SportsShorts']:
                cloth=mesh_data(bpy.data.objects[name]);hits=crossings(data,cloth);row['cloth'][name]={'body_crossing_count':len(hits),'examples':hits[:12]}
        rows.append(row)
        if f%30==0:print('INCLINE_QA_FRAME',f,flush=True)
    # Evaluate between keys as well: geometry must not jump through a rotation chart.
    sub=[]
    for f in [1.5,45.5,75.5,99.5,135.5,160.5,180.5]:
        s.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
        sub.append({'frame':f,'wrist_error_m':max((r.matrix_world@r.pose.bones['ORG-hand.'+side].head-bpy.data.objects['Incline wrist target '+side].matrix_world.translation).length for side in ['L','R'])})
    report={'rows':rows,'subframes':sub,'closure_surface_m':float(np.linalg.norm(p-first,axis=1).max()),'scope':'181 consecutive evaluated poses for grip and object/skin crossings; supports/garments at7 critical poses; not anatomical or human technique certification'}
    (out/'qa.json').write_text(json.dumps(report,indent=2));return {'max_grip_drift_m':max(v['drift_m'] for row in rows for v in row['sides'].values()),'max_wrist_axis_deg':max(v['wrist_axis_deg'] for row in rows for v in row['sides'].values()),'equipment_crossing_frames':sum(bool(row['equipment_crossings']) for row in rows),'closure_m':report['closure_surface_m']}
