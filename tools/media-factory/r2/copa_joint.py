"""Native copa elbow discriminator and explicitly pose-dependent corrections."""
import bpy,json,math
from mathutils import Vector
from garment_binding import coordinates
from compare_baseline import studio,place
from arnold_refine import fade

def audit(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'],load_ui=False,use_scripts=False)
    s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring'];rest=coordinates(b)
    cam=studio(s);cam.data.sensor_fit='VERTICAL';s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
    regions={}
    for v in b.data.vertices:
        w={b.vertex_groups[g.group].name:g.weight for g in v.groups}
        if w.get('body',0)<.5:continue
        side='L' if rest[v.index].x>0 else 'R';a=r.data.bones['ORG-upper_arm.'+side];axis=a.tail_local-a.head_local;t=(rest[v.index]-a.head_local).dot(axis)/axis.length_squared
        if .15<t<.80 and sum(x for n,x in w.items() if n.startswith('DEF-upper_arm.'+side))>.7:regions[v.index]=side
    masks=[m for m in b.modifiers if m.type=='MASK']
    for m in masks:m.show_viewport=False
    def pts():
        ev=b.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();p=[b.matrix_world@v.co for v in me.vertices];ev.to_mesh_clear();return p
    data={}
    for variant in ['baseline','zero_rubber']:
        if variant=='zero_rubber':
            for side in ['L','R']:r.pose.bones['forearm_tweak.'+side]['rubber_tweak']=0
        data[variant]={};initial=None
        for f in [1,33,64,95]:
            s.frame_set(f);bpy.context.view_layer.update();p=pts()
            if initial is None:initial=p
            data[variant][f]={'upper_arm_surface_change_from_extension_max_m':max((p[i]-initial[i]).length for i in regions),'worst':sorted([{'id':i,'delta_m':(p[i]-initial[i]).length,'p':list(p[i])} for i in regions],key=lambda q:q['delta_m'],reverse=True)[:12], 'bones':{n:{'matrix':list(map(list,r.pose.bones[n].matrix)),'segment_matrices':[list(map(list,r.pose.bones[n].bbone_segment_matrix(k,rest=False))) for k in [0,5,10]]} for n in ['DEF-upper_arm.L','DEF-upper_arm.L.001']}}
            for view,pos in [('side',(3,0,1.65)),('front',(2.294,-3.277,2.0))]:
                if f==95:continue
                place(cam,pos,(.10,0,1.27),.92);s.render.filepath=str(out/(variant+'-'+view+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
    for m in masks:m.show_viewport=True
    (out/'audit.json').write_text(json.dumps({'regions':regions,'samples':data,'hypothesis':'Elbow handle curvature propagates into upper-arm skin while humerus heads and matrices remain stable. Zero-rubber discriminator only; no rig or form adopted.'},indent=2))
    return {'diagnostic_only':True}

def stabilize(config,out):
    from cohort import key
    from mathutils import Matrix
    import numpy as np
    from localize_contact import mesh_data
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'],load_ui=False,use_scripts=False)
    s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring']
    s.frame_set(1);bpy.context.view_layer.update();controls=['upper_arm_tweak.'+q+'.001' for q in ['L','R']]
    if config.get('hinge_elbow'):controls += ['forearm_tweak.'+q for q in ['L','R']]
    def hinge(side):
        a=r.pose.bones['ORG-upper_arm.'+side].head;e=r.pose.bones['ORG-forearm.'+side].head;w=r.pose.bones['ORG-hand.'+side].head
        u=(e-a).normalized();v=(w-e).normalized();y=(u+v).normalized();x=u.cross(v).normalized();z=x.cross(y).normalized()
        return Matrix((x,y,z)).transposed().to_quaternion()
    initial_hinge={q:hinge(q) for q in ['L','R']}
    references={n:r.pose.bones[n].matrix.to_quaternion() for n in controls}
    info={n:{'parent':r.pose.bones[n].parent.name,'constraints':[(c.name,c.type,c.influence) for c in r.pose.bones[n].constraints]} for n in controls}
    original={};frames=[1,17,33,49,64,95,121]
    cam=studio(s);cam.data.sensor_fit='VERTICAL';s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
    def photo(label,f):
        for view,pos in [('side',(3,0,1.65)),('front',(2.294,-3.277,2.0)),('rear',(2.294,3.277,2.0))]:
            place(cam,pos,(.10,0,1.27),.92);s.render.filepath=str(out/(label+'-'+view+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
    for f in frames:
        s.frame_set(f);bpy.context.view_layer.update();p,t,ids=mesh_data(b);original[f]={'p':p,'ids':ids,'hands':{q:np.array(r.pose.bones['ORG-hand.'+q].matrix) for q in ['L','R']},'prop':np.array(bpy.data.objects['Copa single dumbbell authority'].matrix_world)}
        if f in [1,33,64]:photo('before',f)
    # One native control change: compensate changing parent orientation at the
    # middle upper-arm tweak, retaining its original world orientation/position.
    control_samples={}
    for f in range(1,122):
        s.frame_set(f);bpy.context.view_layer.update();control_samples[f]={n:r.pose.bones[n].matrix.copy() for n in controls}
    for f,sample in control_samples.items():
        s.frame_set(f);bpy.context.view_layer.update()
        for n,m in sample.items():
            pb=r.pose.bones[n];loc,rotation,scale=m.decompose();target=references[n]
            if n.startswith('forearm_tweak.'):
                side=n[-1];target=hinge(side)@initial_hinge[side].inverted()@references[n]
            pb.matrix=Matrix.LocRotScale(loc,target,scale);key(pb,f)
        bpy.context.view_layer.update()
    for layer in r.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    if not any(n in fc.data_path for n in controls):continue
                    for p in fc.keyframe_points:p.interpolation='BEZIER';p.handle_left_type='AUTO_CLAMPED';p.handle_right_type='AUTO_CLAMPED'
                    if not any(m.type=='CYCLES' for m in fc.modifiers):fc.modifiers.new('CYCLES')
    rows=[]
    for f in frames:
        s.frame_set(f);bpy.context.view_layer.update();p,t,ids=mesh_data(b);old=original[f];assert ids==old['ids']
        rows.append({'frame':f,'surface_difference_from_same_base_frame_max_m':float(np.linalg.norm(p-old['p'],axis=1).max()),'hand_matrix_max_delta':max(float(np.abs(np.array(r.pose.bones['ORG-hand.'+q].matrix)-old['hands'][q]).max()) for q in ['L','R']),'prop_matrix_max_delta':float(np.abs(np.array(bpy.data.objects['Copa single dumbbell authority'].matrix_world)-old['prop']).max()),'middle_orientation_error_rad':max(references[n].rotation_difference(r.pose.bones[n].matrix.to_quaternion()).angle for n in controls if n.startswith('upper_arm'))})
        if f in [1,33,64]:photo('after',f)
    assert rows[0]['surface_difference_from_same_base_frame_max_m']<1e-5,rows[0]
    assert all(x['hand_matrix_max_delta']<1e-6 and x['prop_matrix_max_delta']<1e-6 for x in rows),rows
    s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'))
    (out/'correction.json').write_text(json.dumps({'controls':info,'hinge_elbow':bool(config.get('hinge_elbow')),'rows':rows,'method':'Native upper_arm_tweak middle world orientation held at animated frame1, compensation keyed through native local transform. Root shoulder, elbow path, hands, object authority, shape keys and weights retained. No peak-only sculpt.','human_reviews':'pending'},indent=2))
    return {'rows':rows,'human_reviews':'pending'}

def surface(config,out):
    """Compare native MPFB arm anatomy with accumulated authored contour layers."""
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'],load_ui=False,use_scripts=False)
    s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring'];s.frame_set(1);bpy.context.view_layer.update()
    cam=studio(s);cam.data.sensor_fit='VERTICAL';s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
    def photos(label):
        for f in [1,33,64]:
            s.frame_set(f);bpy.context.view_layer.update()
            for view,pos in [('side',(3,0,1.65)),('front',(2.294,-3.277,2.0))]:
                place(cam,pos,(.10,0,1.27),.92);s.render.filepath=str(out/(label+'-'+view+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
    photos('before');s.frame_set(1);bpy.context.view_layer.update();coords=coordinates(b);keys=b.data.shape_keys.key_blocks
    authored=[k for k in keys if k.name.startswith(('Preserved R1:','Arnold V2','Arnold V3','Copa overhead'))]
    influences={}
    for v in b.data.vertices:
        w={b.vertex_groups[g.group].name:g.weight for g in v.groups}
        if w.get('body',0)<.5:continue
        side='L' if coords[v.index].x>0 else 'R';a=r.data.bones['ORG-upper_arm.'+side];axis=a.tail_local-a.head_local;t=(coords[v.index]-a.head_local).dot(axis)/axis.length_squared
        arm=sum(x for n,x in w.items() if n.startswith(('DEF-upper_arm.'+side,'DEF-forearm.'+side)))
        hand=sum(x for n,x in w.items() if n.startswith(('DEF-hand','DEF-palm','DEF-f_','DEF-thumb')))
        influence=fade(arm,.15,.85)*(1-fade(hand,0,.10))*fade(t,-.15,.1)
        if influence>1e-6:influences[v.index]=influence
    changes={}
    for q in authored:
        k=b.shape_key_add(name='Native arm restoration: '+q.name,from_mix=False);k.value=q.value
        for i,w in influences.items():
            d=-(q.data[i].co-q.relative_key.data[i].co)*w;k.data[i].co=keys[0].data[i].co+d
            if d.length>1e-7:changes[i]=True
        driver=k.driver_add('value').driver;driver.type='SUM';var=driver.variables.new();var.type='SINGLE_PROP';var.targets[0].id_type='KEY';var.targets[0].id=b.data.shape_keys;var.targets[0].data_path=q.path_from_id('value')
    if config.get('local_elbow_smooth'):
        for side in ['L','R']:
            e=r.data.bones['ORG-forearm.'+side].head_local;vg=b.vertex_groups.new(name='Copa elbow deformation only '+side)
            for i in influences:
                dist=(coords[i]-e).length;w=(1-fade(dist,.035,.085))
                if w>1e-6:vg.add([i],w,'REPLACE')
            m=b.modifiers.new('Native elbow deformation finish '+side,'CORRECTIVE_SMOOTH');m.vertex_group=vg.name;m.factor=.65;m.iterations=12;m.smooth_type='LENGTH_WEIGHTED';m.rest_source='ORCO'
            ix=list(b.modifiers).index(m);target=next(i for i,x in enumerate(b.modifiers) if x.type=='MASK');b.modifiers.move(ix,target)
            # Native distance driver measures the actual shoulder/elbow/wrist
            # triangle, avoiding Euler-axis assumptions or time-only triggers.
            driver=m.driver_add('factor').driver;driver.type='SCRIPTED'
            for name,ends in [('a',('ORG-upper_arm.','ORG-forearm.')),('c',('ORG-upper_arm.','ORG-hand.')),('b',('ORG-forearm.','ORG-hand.'))]:
                var=driver.variables.new();var.name=name;var.type='LOC_DIFF'
                for target,bone in zip(var.targets,ends):target.id=r;target.bone_target=bone+side;target.transform_space='WORLD_SPACE'
            t='min(1,max(0,(acos(min(1,max(-1,(c*c-a*a-b*b)/(2*a*b))))-0.26)/1.4))'
            driver.expression='.65*('+t+')*('+t+')*(3-2*('+t+'))'
    photos('after');s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'))
    (out/'surface.json').write_text(json.dumps({'method':'Local removal of accumulated hand-authored arm distortions, retaining native MPFB macro muscle/gender/age form. Feathered by native arm influence, excludes hand/wrist and torso. No invented muscle bulges or rig change.','changed_vertices':sorted(changes),'elbow_corrective_smooth':bool(config.get('local_elbow_smooth')),'removed_layers':[q.name for q in authored],'human_reviews':'pending'},indent=2))
    return {'changed_vertices':len(changes),'human_reviews':'pending'}
