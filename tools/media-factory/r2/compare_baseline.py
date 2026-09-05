"""One bounded full-body comparison; supported rig, rest-relative FK retargeting."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Matrix


def studio(scene):
    for obj in list(scene.objects):
        if obj.type in {'LIGHT','CAMERA'}: bpy.data.objects.remove(obj, do_unlink=True)
    scene.world = bpy.data.worlds.new('R2 neutral environment')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.15,.15,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
    for name,pos,energy,size in [('Key',(2,-3,3),420,3),('Fill',(-3,-2,2),160,3),('Rim',(0,2,3),500,2)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=pos;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.objects.new('R2 camera',bpy.data.cameras.new('R2 camera'));scene.collection.objects.link(camera);camera.data.type='ORTHO';scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.device='GPU';scene.cycles.samples=12
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.35
    return camera


def place(camera,position,target,scale):
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale


def render(scene,camera,output,name,close=False):
    if not scene.get('r2_render_images',True): return
    if close:
        place(camera,(2.5,-.2,1.25),(.27,-.13,1.15),.77)
        scene.render.resolution_x=480;scene.render.resolution_y=600
    else:
        place(camera,(2.6,-4.7,2),(0,-.08,.91),2.12)
        scene.render.resolution_x=480;scene.render.resolution_y=600
    scene.render.filepath=str(output/(name+'.png'));bpy.ops.render.render(write_still=True)


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['comparison_source'])
    scene=bpy.context.scene;scene['r2_render_images']=config.get('render_images',True);old=bpy.data.objects['Athlete01_ExportRig']
    oldrest={b.name:b.matrix_local.copy() for b in old.data.bones}
    for o in list(scene.objects):
        if o.type == 'MESH' and not (o.name.startswith(('Athlete01', 'DumbbellPart')) or o.name in {'SportsTank','SportsShorts'}):
            bpy.data.objects.remove(o, do_unlink=True)
    props=[o for o in scene.objects if o.name.startswith('DumbbellPart')]
    source_poses=[]
    # Three existing curl poses are not re-timed or narrowed for this comparison.
    for name,frame in config.get('pose_frames',[('relaxed',1),('mid',37),('peak',73)]):
        scene.frame_set(frame);bpy.context.view_layer.update()
        source_poses.append({'name':name,'frame':frame,'bones':{b.name:b.matrix.copy() for b in old.pose.bones},'props':{o.name:o.matrix_world.copy() for o in props},'handles':{side:bpy.data.objects['Dumbbell_'+side].matrix_world.copy() for side in ['l','r']}})
    # Two articulation probes apply conventional FK rotations to complete chains.
    # They are rig/garment stress poses, not exercise-technique candidates.
    relaxed=source_poses[0]
    for name in (['shoulder','shallow_bend'] if config.get('include_probes',True) else []):
        matrices={n:m.copy() for n,m in relaxed['bones'].items()}
        if name=='shoulder':
            for side,angle in [('l',-.85),('r',.85)]:
                center=matrices['upperarm_'+side].translation
                rotation=Matrix.Translation(center)@Matrix.Rotation(angle,4,'Y')@Matrix.Translation(-center)
                chain=[old.data.bones['upperarm_'+side],*old.data.bones['upperarm_'+side].children_recursive]
                for bone in chain:matrices[bone.name]=rotation@matrices[bone.name]
        else:
            # Shallow symmetric bend with pelvis lowered and foot targets held near the floor.
            shift=Matrix.Translation((0,.045,-.04))
            matrices={n:shift@m for n,m in matrices.items()}
            for side in ['l','r']:
                thigh='thigh_'+side;calf='calf_'+side;foot='foot_'+side
                h=matrices[thigh].translation.copy();r1=Matrix.Rotation(math.radians(-20),4,'X')
                matrices[thigh]=Matrix.Translation(h)@r1@oldrest[thigh].to_3x3().to_4x4()
                knee=h+matrices[thigh].to_3x3()@Vector((0,old.data.bones[thigh].length,0))
                matrices[calf]=Matrix.Translation(knee)@Matrix.Rotation(math.radians(20),4,'X')@oldrest[calf].to_3x3().to_4x4()
                ankle=knee+matrices[calf].to_3x3()@Vector((0,old.data.bones[calf].length,0))
                footdelta=Matrix.Translation(ankle-relaxed['bones'][foot].translation)
                for bone in [old.data.bones[foot],*old.data.bones[foot].children_recursive]:matrices[bone.name]=footdelta@relaxed['bones'][bone.name]
        source_poses.append({'name':name,'frame':1,'bones':matrices,'props':{}})
    # Existing authoring source stays on disk unchanged; only this in-memory diagnostic is posed directly.
    old.animation_data_clear()
    for b in old.pose.bones:
        for constraint in b.constraints:constraint.mute=True
    cam=studio(scene)
    base_checks=[]
    import surface_qa
    for pose in source_poses:
        for bone in old.pose.bones:bone.matrix=pose['bones'][bone.name];bpy.context.view_layer.update()
        for prop in props:
            prop.hide_render=pose['name'] in {'shoulder','shallow_bend'}
            if prop.name in pose['props']:prop.matrix_world=pose['props'][prop.name]
        if config.get('skin_regions'):base_checks.append({'pose':pose['name'],'regions':surface_qa.check(bpy.data.objects['Athlete01'],config['skin_regions'])})
        render(scene,cam,output,'base-'+pose['name'])
        if pose['name'] in {'relaxed','mid','peak'}:render(scene,cam,output,'base-arm-'+pose['name'],True)
    # Preserve detached prop meshes; their complete transform follows the retargeted hand deformation.
    prop_records=[]
    for o in props:
        prop_records.append({'name':o.name,'mesh':bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get())),'materials':list(o.data.materials),'side': 'l' if (relaxed['props'][o.name].translation.x>0) else 'r'})
    # Load target in this same file via append to retain copied prop geometry.
    target_path=config['character_source']
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    with bpy.data.libraries.load(target_path,link=False) as (available,requested):requested.objects=list(available.objects)
    for o in requested.objects:
        if o is not None and (o.name.startswith('Trophe_R2') or o.name in ['SportsTank','SportsShorts']):scene.collection.objects.link(o)
    rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete']
    # Objects appended as dependencies (eyes/shoes) are linked explicitly, excluding widgets/metarig.
    for o in requested.objects:
        if o and o.type=='MESH' and o.name.startswith('Trophe_R2_Athlete.') and o.name not in scene.objects:scene.collection.objects.link(o)
    mapping={}
    for side,suffix in [('l','L'),('r','R')]:
        rig.pose.bones['upper_arm_parent.'+suffix]['IK_FK']=1.
        rig.pose.bones['thigh_parent.'+suffix]['IK_FK']=1.
        for oldname,newname in [('upperarm','upper_arm_fk'),('lowerarm','forearm_fk'),('hand','hand_fk'),('thigh','thigh_fk'),('calf','shin_fk'),('foot','foot_fk')]:mapping[oldname+'_'+side]=newname+'.'+suffix
        for digit in ['index','middle','ring','pinky','thumb']:
            for segment in [1,2,3]:mapping[digit+'_%02d_'%segment+side]=('thumb' if digit=='thumb' else 'f_'+digit)+'.%02d.'%segment+suffix
    assert all(n in oldrest and v in rig.pose.bones for n,v in mapping.items()), [n for n,v in mapping.items() if n not in oldrest or v not in rig.pose.bones]
    rig.update_tag(); bpy.context.view_layer.update()
    prop_objects=[]
    for record in prop_records:
        obj=bpy.data.objects.new(record['name'],record['mesh']);scene.collection.objects.link(obj);prop_objects.append((obj,record['side']))
    cam=studio(scene);records=[]
    for pose in source_poses:
        for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
        bpy.context.view_layer.update()
        if pose['name']=='shallow_bend':
            rig.pose.bones['torso'].location=(0,.045,-.04);bpy.context.view_layer.update()
        # Parent-first rest-relative FK adapter. Limb lengths stay those of the complete fitted rig.
        for oldname,newname in mapping.items():
            assert oldname in pose['bones'] and newname in rig.pose.bones
            bone=rig.pose.bones[newname];rotation=(pose['bones'][oldname].to_3x3()@oldrest[oldname].to_3x3().inverted()@bone.bone.matrix_local.to_3x3())
            matrix=rotation.to_4x4();matrix.translation=bone.head.copy();bone.matrix=matrix;bpy.context.view_layer.update()
        handframes={}
        for obj,side in prop_objects:
            obj.hide_render=pose['name'] in {'shoulder','shallow_bend'}
            if obj.name not in pose['props']:continue
            newhand=rig.pose.bones['hand_fk.'+side.upper()]
            newdelta=newhand.matrix@newhand.bone.matrix_local.inverted()
            olddelta=pose['bones']['hand_'+side]@oldrest['hand_'+side].inverted()
            obj.matrix_world=newdelta@olddelta.inverted()@pose['props'][obj.name]
            handframes[side]=newdelta@olddelta.inverted()@pose['handles'][side]
        bpy.context.view_layer.update()
        landmarks={n:{'source':list(pose['bones'][n].translation),'target':list(rig.pose.bones[v].head),'distance_m':(pose['bones'][n].translation-rig.pose.bones[v].head).length} for n,v in mapping.items() if n in pose['bones'] and v in rig.pose.bones}
        records.append({'pose':pose['name'],'source_frame':pose['frame'],'landmarks':landmarks,'contact':contact_check(body,handframes) if handframes else None,'regions':surface_qa.check(body,config['skin_regions']) if config.get('skin_regions') else None,'controls_basis':{b.name:[list(row) for row in b.matrix_basis] for b in rig.pose.bones if not b.bone.use_deform and not b.name.startswith(('MCH-','ORG-'))},'handle_frames':{side:[list(row) for row in m] for side,m in handframes.items()}})
        render(scene,cam,output,'supported-'+pose['name'])
        if pose['name'] in {'relaxed','mid','peak'}:render(scene,cam,output,'supported-arm-'+pose['name'],True)
    scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(output/'comparison.blend'))
    (output/'comparison.json').write_text(json.dumps({'method':'Complete MPFB supplied-weight Rigify; parent-first rest-relative FK adapter, no automatic weights or new smoothing','poses':records,'base_surface':base_checks,'contact':'retargeted grip intent and complete prop transforms; evaluated surface contact not yet certified','human_reviews':'pending'},indent=2))
    return {'native_stills':16 if config.get('render_images',True) else 0,'poses':len(source_poses),'geometry_gate':'pending visible review and evaluated surface checks'}


def contact_check(body, frames):
    import numpy as np
    evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
    verts=np.array([list(v.co)+[1] for v in mesh.vertices]);tri=np.array([list(t.vertices) for t in mesh.loop_triangles]);rows={}
    for side,matrix in frames.items():
        p=(verts@np.array(matrix.inverted()@body.matrix_world).T)[:,:3];t=p[tri]
        selected=np.all(np.abs(t[:,:,0])<.085,axis=1)&np.all(np.abs(t[:,:,1])<.07,axis=1)&np.all(np.abs(t[:,:,2])<.07,axis=1)
        q=t[selected,:,1:];mins=[];cross=[]
        for i,j in [(0,1),(1,2),(2,0)]:
            a=q[:,i];b=q[:,j];d=b-a;frac=np.clip(-np.sum(a*d,axis=1)/np.maximum(np.sum(d*d,axis=1),1e-20),0,1)
            mins.append(np.linalg.norm(a+frac[:,None]*d,axis=1));cross.append(a[:,0]*b[:,1]-a[:,1]*b[:,0])
        if len(q):
            distance=np.min(mins,axis=0);cr=np.array(cross);distance[np.all(cr>=0,axis=0)|np.all(cr<=0,axis=0)]=0
            rows[side]={'triangles':len(q),'min_clearance_m':float(distance.min()-.014),'triangles_below_minus_1mm':int(sum(distance<.013))}
        else:rows[side]={'triangles':0,'result':'missing_contact_region'}
    evaluated.to_mesh_clear();return rows
