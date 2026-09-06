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


def anatomy(config,out):
    """Recontour shoulder/arm forms and correct local skin distortion natively.

    No armature, action, hand or equipment change. The native corrective is bound
    before topology masks, in skeleton REST with all intended shape keys active.
    """
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    scene=bpy.context.scene
    rig=bpy.data.objects['Trophe_R2_Authoring']
    body=bpy.data.objects['Trophe_R2_Athlete']
    coords=coordinates(body)
    body_group=body.vertex_groups['body'].index
    ids={v.index for v in body.data.vertices if any(g.group==body_group and g.weight>.5 for g in v.groups)}
    frames=[1,31,46,61,91,121,151,181]
    cam=studio(scene);scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=1280;scene.render.resolution_y=720
    cam.data.sensor_fit='VERTICAL'

    def render_comparable(label):
        for suffix,pos in [('front',(1.7,-4,1.65)),('rear',(-1.2,4,1.65))]:
            for f in [46,91]:
                scene.frame_set(f);bpy.context.view_layer.update()
                place(cam,pos,(0,0,1.52),1.36)
                scene.render.filepath=str(out/(label+'-'+suffix+'-%03d.png'%f))
                bpy.ops.render.render(write_still=True)
        rig.data.pose_position='REST';bpy.context.view_layer.update()
        bells=[o for o in scene.objects if o.name.startswith('Dumbbell')]
        hidden=[o.hide_render for o in bells]
        for o in bells:o.hide_render=True
        place(cam,(1.7,-4,1.65),(0,0,1.42),1.1)
        scene.render.filepath=str(out/(label+'-rest.png'));bpy.ops.render.render(write_still=True)
        for o,state in zip(bells,hidden):o.hide_render=state
        rig.data.pose_position='POSE';bpy.context.view_layer.update()

    render_comparable('before')
    baseline={}
    for f in frames:
        scene.frame_set(f);bpy.context.view_layer.update();baseline[f]=points(body)

    def local(p,name):
        sign=1 if p.x>0 else -1;suffix='L' if sign>0 else 'R'
        bone=rig.data.bones[name+'.'+suffix];axis=bone.tail_local-bone.head_local
        t=(p-bone.head_local).dot(axis)/axis.length_squared
        radial=p-(bone.head_local+axis*t)
        n=radial.normalized()
        lat=Vector((-axis.z,0,axis.x)).normalized()*sign
        return t,n,lat,max(0,n.dot(lat)),max(0,-n.y),max(0,n.y)

    # Native rest-mesh smoothing only over the jagged shoulder cap, feathered
    # before reaching elbow, neck centre, chest centre or forearm.
    weights={}
    for i in ids:
        p=coords[i];t,n,lat,lateral,front,back=local(p,'ORG-upper_arm')
        w=fade(abs(p.x),.105,.165)*fade(t,-.42,-.15)*(1-fade(t,.28,.51))
        w*=fade(p.z,1.23,1.32)*(1-fade(p.z,1.57,1.64))
        if w>1e-5:weights[i]=w
    mesh=bpy.data.meshes.new('Temporary native shoulder rest surface')
    mesh.from_pydata(coords,[],[list(p.vertices) for p in body.data.polygons]);mesh.update()
    donor=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(donor)
    group=donor.vertex_groups.new(name='Shoulder cap only')
    for i,w in weights.items():group.add([i],w,'REPLACE')
    smooth=donor.modifiers.new('Native rest shoulder contour','SMOOTH')
    smooth.factor=.65;smooth.iterations=8;smooth.vertex_group=group.name
    bpy.context.view_layer.update();smoothed=points(donor)
    bpy.data.objects.remove(donor,do_unlink=True);bpy.data.meshes.remove(mesh)
    key=body.shape_key_add(name='Arnold V3 deltoid arm forearm contours',from_mix=False)
    key.value=1.;basis=body.data.shape_keys.key_blocks[0];changes=[]
    for i in ids:
        p=coords[i];delta=Vector(smoothed[i])-p
        contour_delta=Vector((0,0,0))
        t,n,lat,lateral,front,back=local(p,'ORG-upper_arm')
        support=fade(abs(p.x),.13,.19)*fade(t,-.20,-.05)*(1-fade(t,.79,.94))
        if 1.13<p.z<1.60 and support>0:
            # One continuous cap tapering into a distal insertion, not two beads.
            cap=.010*bell(t,.14,.25)*lateral**2
            boundary=-.007*bell(t,.39,.105)*(lateral**3+.30*(front**3+back**3))
            side_septum=-.006*bell(t,.61,.22)*lateral**6
            contour_delta+=n*(cap+boundary+side_septum)*support
            # Fusiform anterior biceps and posterior triceps, with tapered ends.
            contour_delta.y+=(-.014*bell(t,.60,.19)*front**3+.014*bell(t,.52,.22)*back**3)*support
            contour_delta+=lat*(.004*bell(t,.66,.18)*back*lateral*support)
        ft,fn,flat,flateral,ffront,fback=local(p,'ORG-forearm')
        fore_support=fade(ft,.06,.17)*(1-fade(ft,.70,.84))*fade(abs(p.x),.27,.34)
        # Stay away from the hand and elbow fold; superficial forearm volumes
        # converge distally, leaving the previously fitted wrist/hand untouched.
        if fore_support>0 and .72<p.z<1.26:
            ridge=.008*bell(ft,.27,.22)*flateral**3
            groove=-.003*bell(ft,.48,.25)*flateral**6
            contour_delta+=fn*(ridge+groove)*fore_support
            contour_delta.y+=(-.0055*bell(ft,.38,.24)*ffront**3+.007*bell(ft,.38,.26)*fback**3)*fore_support
            contour_delta+=flat*(.003*bell(ft,.60,.25)*fback*flateral*fore_support)
        delta+=contour_delta*config.get('contour_relief_scale',1.)
        key.data[i].co=basis.data[i].co+delta
        if delta.length>1e-7:changes.append({'id':i,'delta_m':list(delta)})
    assert all(abs(coords[c['id']].x)>.10 for c in changes)
    # Binding matches the native active shape, not the unshaped Basis or frame1.
    native_group=body.vertex_groups.new(name='Arnold V3 local shoulder articulation')
    for i,w in weights.items():native_group.add([i],w,'REPLACE')
    corrective=body.modifiers.new('Arnold V3 native shoulder deformation','CORRECTIVE_SMOOTH')
    corrective.vertex_group=native_group.name;corrective.factor=config.get('corrective_factor',.65)
    corrective.iterations=8;corrective.smooth_type='LENGTH_WEIGHTED';corrective.rest_source='BIND'
    masks=[i for i,m in enumerate(body.modifiers) if m.type=='MASK']
    body.modifiers.move(len(body.modifiers)-1,min(masks))
    rig.data.pose_position='REST';bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
    bpy.ops.object.correctivesmooth_bind(modifier=corrective.name)
    bpy.context.view_layer.update();assert corrective.is_bind
    rest_on=points(body);corrective.show_viewport=False;bpy.context.view_layer.update();rest_off=points(body)
    corrective.show_viewport=True;rig.data.pose_position='POSE';bpy.context.view_layer.update()
    samples=[]
    for f in frames:
        scene.frame_set(f);bpy.context.view_layer.update();on=points(body)
        corrective.show_viewport=False;bpy.context.view_layer.update();off=points(body)
        corrective.show_viewport=True;bpy.context.view_layer.update()
        samples.append({'frame':f,'common_base_surface_max_m':float(np.max(np.linalg.norm(on-baseline[f],axis=1))),
                        'native_corrective_only_max_m':float(np.max(np.linalg.norm(on-off,axis=1)))})
    report={'source':config['animation_source'],'shape_key':key.name,'contour_relief_scale':config.get('contour_relief_scale',1.),'changed_vertices':changes,
            'shoulder_weights':weights,'max_rest_sculpt_delta_m':max(Vector(c['delta_m']).length for c in changes),
            'native_modifier':{'type':corrective.type,'factor':corrective.factor,'iterations':corrective.iterations,
                               'rest_source':'Skeleton REST with active intended shape; before MASK topology changes',
                               'bind_rest_change_max_m':float(np.max(np.linalg.norm(rest_on-rest_off,axis=1)))},
            'samples':samples,'preserved':'Rig rest bones, weights, controls, all actions, complete hand/dumbbell relationship, neck centre, hands and lower body',
            'limits':'Authored superficial shape plus local native distortion correction; not a force/activation or anatomical certification.',
            'references':['https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs','https://docs.blender.org/manual/en/5.0/modeling/modifiers/deform/corrective_smooth.html'],
            'human_reviews':'pending'}
    (out/'anatomy.json').write_text(json.dumps(report,indent=2))
    scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'arnold.blend'))
    render_comparable('after')
    return {'changed_vertices':len(changes),'shoulder_group_vertices':len(weights),
            'max_rest_sculpt_delta_m':report['max_rest_sculpt_delta_m'],'native_bind_rest_change_max_m':report['native_modifier']['bind_rest_change_max_m']}


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
