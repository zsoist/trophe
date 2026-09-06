"""Seated two-hand overhead dumbbell study using the existing native Rigify rig."""
import bpy,json,math
import numpy as np
from mathutils import Matrix,Vector
from cohort import empty,material,cylinder,cube,key
from playback_qa import points
from compare_baseline import studio,place
from garment_binding import coordinates
from localize_contact import mesh_data
from bench_qa import crossings,tree
from surface_qa import check


def ease(t):
    t=max(0.,min(1.,t));return t*t*t*(10-15*t+6*t*t)


def axes(x,y,position):
    x=x.normalized();y=(y-x*x.dot(y)).normalized();z=x.cross(y).normalized()
    m=Matrix((x,y,z)).transposed().to_4x4();m.translation=position;return m


def run(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    scene=bpy.context.scene;rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete']
    rest=coordinates(body);scene.frame_set(1);bpy.context.view_layer.update()
    assert rig.animation_data.drivers
    rig.animation_data.action=None
    for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
    for side in ['L','R']:
        for c in list(rig.pose.bones['hand_ik.'+side].constraints):
            if c.name.startswith(('Arnold','Shared bar')):rig.pose.bones['hand_ik.'+side].constraints.remove(c)
    for obj in list(scene.objects):
        if obj.name.startswith(('Dumbbell','R2_Grip','Arnold wrist target')):bpy.data.objects.remove(obj,do_unlink=True)
    torso=rig.pose.bones['torso'];torso.location.z=-config.get('seat_drop',.40)
    for side,sign in [('L',1),('R',-1)]:
        leg=rig.pose.bones['thigh_parent.'+side];leg['IK_FK']=0.;leg['IK_Stretch']=0.;leg['pole_vector']=True
        foot=rig.pose.bones['foot_ik.'+side];foot.matrix=Matrix.Translation((sign*.20,-.46,.073721))
        pole=rig.pose.bones['thigh_ik_target.'+side];pole.matrix.translation=(sign*.20,-1.,.53)
        arm=rig.pose.bones['upper_arm_parent.'+side];arm['IK_FK']=0.;arm['IK_Stretch']=0.;arm['pole_vector']=True
        # Preserve the supported rig. A small fixed shoulder-girdle elevation
        # accompanies this overhead posture; not a scapulothoracic simulation.
        shoulder=rig.pose.bones['shoulder.'+side]
        bpy.context.view_layer.update();base=shoulder.matrix.copy();p=base.translation.copy()
        shoulder.matrix=Matrix.Translation(p)@Matrix.Rotation(-sign*math.radians(8),4,'Y')@Matrix.Translation(-p)@base
    bpy.context.view_layer.update()
    steel=material('Copa brushed steel',(.20,.23,.26),.75)
    rubber=material('Copa rubber weights',(.045,.05,.055),.1)
    padmat=material('Copa bench upholstery',(.06,.08,.10))
    prop=empty('Copa single dumbbell authority');prop.rotation_mode='QUATERNION'
    for name,z,radius,depth,mat in [('handle',-.096,.014,.20,steel),('upper head',.033,.085,.066,rubber),('lower head',-.222,.085,.066,rubber),('top cap',.069,.027,.008,steel),('bottom cap',-.258,.027,.008,steel)]:
        o=cylinder('Copa weight '+name,0,radius,depth,mat,prop);o.rotation_euler=(0,0,0);o.location=(0,0,z)
    targets={};elbows={};hand_local={}
    for side,sign in [('L',1),('R',-1)]:
        target=empty('Copa wrist target '+side);target.parent=prop
        target.matrix_basis=axes(Vector((0,0,sign)),Vector((-sign*.40,.916,0)),Vector((sign*config.get('grip_half_width',.082),-.065,-.013)))
        hand_local[side]=target.matrix_basis.copy();targets[side]=target
        c=rig.pose.bones['hand_ik.'+side].constraints.new('COPY_TRANSFORMS');c.name='Copa shared object owns full wrist';c.target=target;c.owner_space='WORLD';c.target_space='WORLD'
        s=rig.matrix_world@rig.pose.bones['ORG-upper_arm.'+side].head
        ex=sign*config.get('elbow_half_width',.17);ey=config.get('elbow_y',.02)
        length=rig.data.bones['ORG-upper_arm.'+side].length
        ez=s.z+math.sqrt(length*length-(ex-s.x)**2-(ey-s.y)**2)
        elbows[side]=Vector((ex,ey,ez))
    e=sum(elbows.values(),Vector())/2
    fore=rig.data.bones['ORG-forearm.L'].length
    radius=math.sqrt(fore*fore-(config.get('grip_half_width',.082)-abs(elbows['L'].x))**2)
    def pose(frame):
        scene.frame_set(frame);phase=(frame-1)/180.;q=ease(phase*2 if phase<=.5 else 2-phase*2)
        angle=math.radians(config.get('top_forearm_deg',15)+(config.get('bottom_forearm_deg',110)-config.get('top_forearm_deg',15))*q)
        wrist_z=sum(t.matrix_basis.translation.z for t in targets.values())/2
        prop.matrix_world=Matrix.Translation((0,e.y+radius*math.sin(angle)+.065,e.z+radius*math.cos(angle)-wrist_z))
        bpy.context.view_layer.update()
        for side in ['L','R']:
            s=rig.matrix_world@rig.pose.bones['ORG-upper_arm.'+side].head;w=targets[side].matrix_world.translation;mid=(s+w)/2
            pole=mid+4*(elbows[side]-mid)
            rig.pose.bones['upper_arm_ik_target.'+side].matrix.translation=rig.matrix_world.inverted()@pole
        bpy.context.view_layer.update();return q
    pose(1)
    cup_fit={}
    if config.get('fit_cup'):
        skin,_,original=mesh_data(body)
        local_skin=(np.c_[skin,np.ones(len(skin))]@np.array(prop.matrix_world.inverted()).T)[:,:3]
        for side in ['L','R']:
            selected=[]
            for i,source_id in enumerate(original):
                weights=[(body.vertex_groups[g.group].name,g.weight) for g in body.data.vertices[source_id].groups if body.vertex_groups[g.group].name.startswith('DEF-')]
                dominant=max(weights,key=lambda v:v[1])[0] if weights else ''
                if dominant.startswith(('DEF-hand','DEF-palm')) and dominant.endswith('.'+side) and np.linalg.norm(local_skin[i,:2])<.080:selected.append(i)
            assert selected
            highest=float(local_skin[selected,2].max())
            targets[side].matrix_basis.translation.z-=highest+.0005
            cup_fit[side]={'evaluated_palm_samples':len(selected),'initial_palm_top_z_m':highest,'wrist_local_z_m':targets[side].matrix_basis.translation.z,'contact_reference':'actual upper head underside z0, palm peak placed0.5mm below; complete wrist path retained by object translation'}
        pose(1)
    finger_record=[]
    # Finger directions follow each local rim position. Native FK controls retain
    # their roll; no shared Euler angle is assigned to every phalanx.
    for side,sign in [('L',1),('R',-1)]:
        for finger in ['f_index','f_middle','f_ring','f_pinky']:
            for part in range(1,4):
                control=rig.pose.bones[f'{finger}.{part:02d}.{side}'];bpy.context.view_layer.update()
                m=rig.matrix_world@control.matrix;h=prop.matrix_world.inverted()@m.translation
                outer=.102 if config.get('fit_cup') else .085
                edge=math.sqrt(max(.001,outer**2-h.x*h.x))
                heights=[-.024,-.018,.012] if config.get('fit_cup') else [-.012,.003,.034]
                target=Vector((h.x,edge+(.003 if part==1 else .008),heights[part-1]))
                direction=(prop.matrix_world.to_3x3()@(target-h)).normalized()
                swing=(m.to_3x3()@Vector((0,1,0))).rotation_difference(direction)
                control.matrix=rig.matrix_world.inverted()@Matrix.Translation(m.translation)@swing.to_matrix().to_4x4()@m.to_3x3().to_4x4()
                bpy.context.view_layer.update();finger_record.append({'bone':control.name,'cup_target_m':list(target),'matrix_basis':list(map(list,control.matrix_basis))})
        for part,direction in enumerate([(-sign*.50,.08,-.6),(sign*.10,.9,.15),(sign*.8,.2,.3)],1):
            control=rig.pose.bones[f'thumb.{part:02d}.{side}'];m=rig.matrix_world@control.matrix
            aim=(prop.matrix_world.to_3x3()@Vector(direction)).normalized();swing=(m.to_3x3()@Vector((0,1,0))).rotation_difference(aim)
            control.matrix=rig.matrix_world.inverted()@Matrix.Translation(m.translation)@swing.to_matrix().to_4x4()@m.to_3x3().to_4x4();bpy.context.view_layer.update()
            finger_record.append({'bone':control.name,'cup_direction':list(direction),'matrix_basis':list(map(list,control.matrix_basis))})
    # Static pose channels are explicitly keyed; object/pole motion below remains
    # continuous and is evaluated by native IK.
    for b in rig.pose.bones:
        if not b.name.startswith(('ORG-','DEF-','MCH-')):
            key(b,1);key(b,181)
    clothing={}
    if config.get('fit_shorts'):
        if config.get('shorts_source'):
            old=bpy.data.objects['SportsShorts']
            with bpy.data.libraries.load(config['shorts_source'],link=False) as (available,requested):requested.objects=['SportsShorts']
            repaired=requested.objects[0];repaired.parent=None;repaired.matrix_world=Matrix.Identity(4);repaired.animation_data_clear()
            scene.collection.objects.link(repaired);bpy.data.objects.remove(old,do_unlink=True);repaired.name='SportsShorts'
            for m in repaired.modifiers:
                if m.type=='ARMATURE':m.object=rig
            clothing['prepared_rest_source']=config['shorts_source']
            clothing['prepared_method']='Reuse existing native exact-union and transferred-body-weight sports shorts from compatible bench master; clear bench placement, bind current identical rig'
        shorts_obj=bpy.data.objects['SportsShorts']
        native=next(m for m in body.modifiers if m.type=='ARMATURE' and m.use_multi_modifier)
        if shorts_obj.vertex_groups.get(native.vertex_group):
            m=shorts_obj.modifiers.new('Copa matched MPFB preserve volume','ARMATURE');m.object=rig
            for k in ['use_deform_preserve_volume','use_multi_modifier','vertex_group','invert_vertex_group','use_vertex_groups','use_bone_envelopes']:setattr(m,k,getattr(native,k))
            shorts_obj.modifiers.move(len(shorts_obj.modifiers)-1,1);clothing['matched_preserve_volume']=True
        else:clothing['matched_preserve_volume']=False
        clothing['removed_shells']=[]
        for m in list(shorts_obj.modifiers):
            if m.type=='SOLIDIFY':clothing['removed_shells'].append(m.name);shorts_obj.modifiers.remove(m)
        if config.get('wrap_shorts',True):
            wrap=shorts_obj.modifiers.new('Copa seated shorts surface clearance','SHRINKWRAP');wrap.target=body;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.006
            clothing['native_fit']='Above-surface6mm Shrinkwrap after subdivision; no cloth physics or skin masking'
        bpy.context.view_layer.update()
    shoe=bpy.data.objects['Trophe_R2_Trainers'];sole=points(shoe)
    shorts=points(bpy.data.objects['SportsShorts'])
    support=shorts[(abs(shorts[:,0])<.17)&(shorts[:,1]>-.14)&(shorts[:,1]<.18)]
    seat_top=float(support[:,2].min())+.001
    cube('Copa bench seat',(0,.01,seat_top-.035),(.37,.36,.07),padmat)
    skin=points(body);back=skin[(abs(skin[:,0])<.14)&(skin[:,2]>.72)&(skin[:,2]<1.)]
    back_front=float(back[:,1].max())+.002
    cube('Copa bench backrest',(0,back_front+.025,(seat_top+.12+1.00)/2),(.29,.05,1.00-seat_top-.12),padmat)
    for y in [-.10,.12]:
        cube('Copa bench support',(0,y,seat_top/2),(.08,.07,seat_top-.07),steel)
        cube('Copa bench foot',(0,y,.026),(.53,.13,.05),rubber)
    rows=[];initial=None
    for frame in range(1,182):
        q=pose(frame)
        for channel in ['location','rotation_quaternion','scale']:prop.keyframe_insert(channel,frame=frame)
        for side in ['L','R']:key(rig.pose.bones['upper_arm_ik_target.'+side],frame)
        row={'frame':frame,'lowering_phase':q,'joints':{}}
        for side in ['L','R']:
            pt=lambda name:rig.matrix_world@rig.pose.bones[name+'.'+side].head
            s=pt('ORG-upper_arm');elbow=pt('ORG-forearm');w=pt('ORG-hand');middle=pt('ORG-f_middle.01')
            row['joints'][side]={'elbow_m':list(elbow),'wrist_m':list(w),'elbow_reference_error_m':(elbow-elbows[side]).length,'wrist_target_error_m':(w-targets[side].matrix_world.translation).length,'elbow_flex_deg':math.degrees((elbow-s).angle(w-elbow)),'forearm_palm_deg':math.degrees((w-elbow).angle(middle-w))}
        rows.append(row)
    for obj in [rig,prop]:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for p in fc.keyframe_points:p.interpolation='BEZIER';p.handle_left_type='AUTO_CLAMPED';p.handle_right_type='AUTO_CLAMPED'
                        fc.modifiers.new('CYCLES')
    scene.frame_start=1;scene.frame_end=180;scene.render.fps=30;scene.frame_set(1);bpy.context.view_layer.update()
    report={'source':config['animation_source'],'variant':'seated two-hand overhead dumbbell triceps extension; cupped upper-head grip','frames':180,'closure_frame':181,'fps':30,'duration_s':6,'authority':'One rigid dumbbell -> two full wrist targets -> native Rigify IK; individually posed FK fingers','cup_fit':cup_fit,'clothing':clothing,'seat_top_m':seat_top,'backrest_front_y_m':back_front,'floor_z_m':float(sole[:,2].min()),'elbow_reference_m':{k:list(v) for k,v in elbows.items()},'finger_pose':finger_record,'rows':rows,'reference':'https://www.muscleandstrength.com/exercises/two-arm-dumbbell-extension.html','human_reviews':'pending new exercise','limits':'Authoring study; not a muscle force simulation or certified technique. Shared grip, head clearance, joint deformation and bench support require evaluated surface QA.'}
    (out/'triceps.json').write_text(json.dumps(report,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'))
    cam=studio(scene);scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=720;cam.data.sensor_fit='VERTICAL'
    for name,position,target,scale in [('front',(2,-4,1.9),(0,0,.94),1.95),('side',(3,-.8,1.6),(0,.04,1.0),1.65),('rear',(-1.7,4,1.8),(0,.08,1.20),1.4)]:
        for f in [1,91]:
            scene.frame_set(f);bpy.context.view_layer.update();place(cam,position,target,scale);scene.render.filepath=str(out/(name+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
    for f in [1,91]:
        scene.frame_set(f);bpy.context.view_layer.update();t=prop.matrix_world.translation
        place(cam,t+Vector((.35,-.45,-.18)),t-Vector((0,0,.055)),.48);scene.render.filepath=str(out/('grip-%03d.png'%f));bpy.ops.render.render(write_still=True)
    return {'frames':181,'max_elbow_reference_error_m':max(j['elbow_reference_error_m'] for r in rows for j in r['joints'].values()),'max_wrist_target_error_m':max(j['wrist_target_error_m'] for r in rows for j in r['joints'].values())}


def inspect(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
    rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete']
    data={}
    for b in rig.pose.bones:
        if any(n in b.name for n in ['finger','f_index','f_middle','f_ring','f_pinky','thumb','hand','thigh','shin','foot','torso','hips','shoulder']):
            data[b.name]={'head':list(b.head),'tail':list(b.tail),'rest_head':list(b.bone.head_local),'rest_tail':list(b.bone.tail_local),
                          'matrix':list(map(list,b.matrix)),'basis':list(map(list,b.matrix_basis)),'rotation_mode':b.rotation_mode,
                          'parent':b.parent.name if b.parent else None,'constraints':[(c.name,c.type) for c in b.constraints],
                          'custom':{k:v for k,v in b.items() if isinstance(v,(str,int,float))}}
    (out/'rig-inspection.json').write_text(json.dumps(data,indent=2))
    if bpy.data.objects.get('Copa single dumbbell authority'):
        p,t,source=mesh_data(body);prop=bpy.data.objects['Copa single dumbbell authority'];q=(np.c_[p,np.ones(len(p))]@np.array(prop.matrix_world.inverted()).T)[:,:3]
        selected=[]
        for i,v in enumerate(q):
            if np.linalg.norm(v[:2])<.10 and -.08<v[2]<.08:
                groups=sorted([(body.vertex_groups[g.group].name,g.weight) for g in body.data.vertices[source[i]].groups if body.vertex_groups[g.group].name.startswith('DEF-')],key=lambda x:-x[1])
                selected.append({'id':source[i],'cup_local_m':v.tolist(),'groups':groups[:3]})
        (out/'cup-skin.json').write_text(json.dumps({'vertices':selected,'shorts_modifiers':[(m.name,m.type) for m in bpy.data.objects['SportsShorts'].modifiers]},indent=2))
    return {'bones':len(data),'body_vertices':len(body.data.vertices),'source_only':True}


def qa(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    scene=bpy.context.scene;body=bpy.data.objects['Trophe_R2_Athlete'];rig=bpy.data.objects['Trophe_R2_Authoring']
    prop=bpy.data.objects['Copa single dumbbell authority'];shoes=bpy.data.objects['Trophe_R2_Trainers']
    rest=coordinates(body);body_group=body.vertex_groups['body'].index
    body_ids={v.index for v in body.data.vertices if any(g.group==body_group and g.weight>.5 for g in v.groups)}
    hand_ids={side:{v.index for v in body.data.vertices if v.index in body_ids and any(g.weight>.15 and body.vertex_groups[g.group].name.startswith(('DEF-hand','DEF-palm','DEF-f_','DEF-thumb')) and body.vertex_groups[g.group].name.endswith('.'+side) for g in v.groups)} for side in ['L','R']}
    regions={side:[i for i in body_ids if (1 if side=='shoulder_l' else -1)*rest[i].x>.07 and 1.13<rest[i].z<1.54] for side in ['shoulder_l','shoulder_r']}
    regions['chest']=[i for i in body_ids if abs(rest[i].x)<.20 and 1.12<rest[i].z<1.49]
    head_ids={i for i in body_ids if rest[i].z>1.51}
    core_ids={i for i in body_ids if abs(rest[i].x)<.09 and .94<rest[i].z<1.30}
    equipment=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Copa weight')]
    rows=[];initial_hand={};initial_contact={};initial_feet=None;initial_core=None;initial_elbow={};initial_axis={}
    exact=set(config.get('exact_frames',[1,31,46,61,91,121,151,176,181]))
    for f in config.get('frames',range(1,scene.frame_end+2)):
        scene.frame_set(f);bpy.context.view_layer.update();data=mesh_data(body);p,tri,source=data;lookup={v:i for i,v in enumerate(source)}
        local=(np.c_[p,np.ones(len(p))]@np.array(prop.matrix_world.inverted()).T)[:,:3]
        feet=points(shoes);core=p[[lookup[i] for i in core_ids if i in lookup]]
        if initial_feet is None:initial_feet=feet.copy();initial_core=core.copy()
        row={'frame':f,'feet_motion_m':float(np.max(np.linalg.norm(feet-initial_feet,axis=1))),'floor_z_m':float(feet[:,2].min()),'torso_core_motion_m':float(np.max(np.linalg.norm(core-initial_core,axis=1))),'hands':{},'joints':{},'bounds':{}}
        subsets={}
        for side in ['L','R']:
            ids=[lookup[i] for i in hand_ids[side] if i in lookup];q=local[ids]
            if side not in initial_hand:initial_hand[side]=q.copy()
            radial=np.linalg.norm(q[:,:2],axis=1);under=q[radial<.084]
            if side not in initial_contact:
                selected=np.where((radial<.084)&(abs(q[:,2])<.004))[0]
                assert len(selected)>2;initial_contact[side]=(selected,q[selected].copy())
            tracked,reference=initial_contact[side]
            row['hands'][side]={'tracked_vertices':len(ids),'max_object_relative_drift_m':float(np.max(np.linalg.norm(q-initial_hand[side],axis=1))),
                                'contact_tracked_vertices':len(tracked),'contact_drift_m':float(np.max(np.linalg.norm(q[tracked]-reference,axis=1))),
                                'upper_head_underface_near_4mm_vertices':int(sum((radial<.084)&(abs(q[:,2])<.004))),
                                'upper_head_underface_min_abs_distance_m':float(np.min(abs(under[:,2]))) if len(under) else None}
            selected=set(ids);subsets[side]=(p,[t for t in tri if all(i in selected for i in t)],source)
            point=lambda n:rig.matrix_world@rig.pose.bones[n+'.'+side].head
            shoulder=point('ORG-upper_arm');elbow=point('ORG-forearm');wrist=point('ORG-hand');palm=point('ORG-f_middle.01')
            if side not in initial_elbow:initial_elbow[side]=elbow.copy();initial_axis[side]=(elbow-shoulder).normalized()
            row['joints'][side]={'upper_arm_axis_drift_deg':math.degrees(initial_axis[side].angle((elbow-shoulder).normalized())), 'upper_arm_vertical_deg':math.degrees(Vector((0,0,1)).angle((elbow-shoulder).normalized())), 'elbow_flexion_deg':math.degrees((elbow-shoulder).angle(wrist-elbow)),
                                 'forearm_palm_angle_deg':math.degrees((wrist-elbow).angle(palm-wrist)),
                                 'elbow_motion_from_frame1_m':(elbow-initial_elbow[side]).length,
                                 'wrist_target_error_m':(wrist-bpy.data.objects['Copa wrist target '+side].matrix_world.translation).length}
        # Conservative cylinder volume tests on every evaluated pose; selected
        # poses below resolve actual triangle crossings, including hands vs head.
        for name,lo,hi,radius in [('upper_head',0,.066,.085),('lower_head',-.255,-.189,.085),('handle',-.196,.004,.014)]:
            radial=np.linalg.norm(local[:,:2],axis=1)
            inside=(radial<radius-.001)&(local[:,2]>lo+.001)&(local[:,2]<hi-.001)
            affected=[int(source[i]) for i in np.where(inside)[0]]
            row['bounds'][name]={'inside_1mm_vertices':len(affected),'head_inside':len(set(affected)&head_ids),'hand_inside':len(set(affected)&(hand_ids['L']|hand_ids['R'])),'source_ids':affected}
        if config.get('joint_sections'):
            from triceps_refine import cross_section_area
            row['arm_sections']={side:{str(fraction):cross_section_area(p,tri,source,body,rig,side,fraction) for fraction in [.5,.8]} for side in ['L','R']}
        if f in exact:
            row['actual_equipment']={o.name:crossings(data,mesh_data(o)) for o in equipment}
            row['hand_hand_crossings']=crossings(subsets['L'],subsets['R'])
            row['skin_regions']=check(body,regions)
            row['cloth']={}
            for name in ['SportsTank','SportsShorts']:
                cloth=mesh_data(bpy.data.objects[name]);row['cloth'][name]={'body':crossings(data,cloth),'self':crossings(cloth,cloth,True)}
            row['bench']={o.name:crossings(data,mesh_data(o)) for o in scene.objects if o.type=='MESH' and o.name.startswith('Copa bench')}
        rows.append(row)
        if f%30==0:print('TRICEPS_QA_FRAME',f,flush=True)
    def sample(f):
        scene.frame_set(math.floor(f),subframe=f-math.floor(f));bpy.context.view_layer.update();return points(body)
    closure=scene.frame_end+1;a=sample(1);b=sample(closure);before=sample(closure-.1);after=sample(closure+.1)
    report={'source':config['animation_source'],'rows':rows,'human_reviews':'pending','closure':{'position_max_m':float(np.max(np.linalg.norm(a-b,axis=1))),'velocity_gap_m_s_epsilon_0_1':float(np.max(np.linalg.norm((b-before)*300-(after-b)*300,axis=1)))},'method':'Evaluated surface and existing native rig. Cylinder bounds all sampled frames; actual noncoplanar triangle crossings at selected frames. Cup contact uses actual upper-head underside; hand-hand intersection and bench support included.','limits':['Bounds are not exact beveled surfaces; triangle contacts may include shallow overlap and require localization.','Wrist/palm angles are geometric diagnostics of cupped support, not clinical limits.','Surface deformation is not internal muscle activation or a force simulation.']}
    (out/'triceps-qa.json').write_text(json.dumps(report,indent=2))
    return {'frames':len(rows),'closure':report['closure'],'max_hand_drift_m':max(h['max_object_relative_drift_m'] for r in rows for h in r['hands'].values()),'head_bounds_flag_frames':[r['frame'] for r in rows if any(b['head_inside'] for b in r['bounds'].values())]}
