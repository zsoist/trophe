"""Native still/clip rendering from an already checked animation, same scene/camera presets."""
import bpy, json, time, gpu, math
from mathutils import Vector
from compare_baseline import studio, place


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    scene=bpy.context.scene;camera=studio(scene);scene.render.engine=config.get('engine','BLENDER_EEVEE')
    preset=config['camera'];place(camera,preset['position'],preset['target'],preset['ortho_scale']);camera.data.sensor_fit='VERTICAL'
    scene.render.resolution_x=config['resolution'][0];scene.render.resolution_y=config['resolution'][1];scene.render.resolution_percentage=100
    scene.render.fps=30;scene.frame_start=1;scene.frame_end=config.get('frames',180)
    if config.get('floor_z') is not None:
        bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,config['floor_z']))
        floor=bpy.context.object;floor.name='Neutral floor'
        mat=bpy.data.materials.new('Neutral floor');mat.use_nodes=True
        shader=mat.node_tree.nodes['Principled BSDF'];shader.inputs['Base Color'].default_value=(.10,.105,.115,1);shader.inputs['Roughness'].default_value=.83;floor.data.materials.append(mat)
    retime=float(config.get('retime_factor',1.0))
    if retime!=1.0:
        # Retiming active native actions preserves intermediate motion. No pose
        # duplication or image interpolation; render-source stores the result.
        seen=set()
        for obj in scene.objects:
            action=obj.animation_data.action if obj.animation_data else None
            if not action or action.as_pointer() in seen:continue
            seen.add(action.as_pointer())
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for fc in bag.fcurves:
                            for p in fc.keyframe_points:
                                x=p.co.x;left=p.handle_left.x;right=p.handle_right.x
                                p.co.x=1+(x-1)*retime;p.handle_left.x=1+(left-1)*retime;p.handle_right.x=1+(right-1)*retime
                            fc.update()
    if config.get('orbit_turns'):
        pivot=bpy.data.objects.new('Review camera orbit only',None);scene.collection.objects.link(pivot);pivot.location=preset['target']
        bpy.context.view_layer.update();world=camera.matrix_world.copy();camera.parent=pivot;camera.matrix_world=world
        pivot.rotation_euler.z=0;pivot.keyframe_insert('rotation_euler',index=2,frame=1)
        pivot.rotation_euler.z=2*math.pi*config['orbit_turns'];pivot.keyframe_insert('rotation_euler',index=2,frame=scene.frame_end+1)
        for layer in pivot.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for p in fc.keyframe_points:p.interpolation='LINEAR'
    if config.get('full_body_framing_gate'):
        from bpy_extras.object_utils import world_to_camera_view
        observed=[]
        for frame in sorted(set(list(range(1,scene.frame_end+2,30))+config.get('stills',[]))):
            scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();uv=[]
            for obj in scene.objects:
                if obj.type!='MESH' or obj.hide_render:continue
                if obj.name not in ['Trophe_R2_Athlete','Trophe_R2_Trainers','SportsTank','SportsShorts'] and not obj.name.startswith(('Copa weight','Copa bench')):continue
                ev=obj.evaluated_get(dg)
                uv.extend(world_to_camera_view(scene,camera,ev.matrix_world@Vector(p)) for p in ev.bound_box)
            margins=[min(p.x for p in uv),min(p.y for p in uv),max(p.x for p in uv),max(p.y for p in uv)]
            observed.append({'frame':frame,'bounds':margins})
            assert min(margins[:2])>.015 and max(margins[2:])<.985,observed[-1]
        (output/'framing-gate.json').write_text(json.dumps(observed,indent=2))
    scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'render-source.blend'))
    start=time.monotonic();artifacts=[]
    if config.get('video'):
        scene.render.image_settings.media_type='VIDEO';scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264';scene.render.ffmpeg.constant_rate_factor='HIGH'
        scene.render.filepath=str(output/'motion.partial.mp4');bpy.ops.render.render(animation=True)
        (output/'motion.partial.mp4').rename(output/'motion.mp4');artifacts.append('motion.mp4')
    for frame in config.get('stills',[1]):
        scene.frame_set(frame);scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG'
        name='frame-%03d.png'%frame;scene.render.filepath=str(output/name);bpy.ops.render.render(write_still=True);artifacts.append(name)
    for view in config.get('diagnostic_views',[]):
        place(camera,view['position'],view['target'],view['ortho_scale'])
        scene.render.resolution_x=view['resolution'][0];scene.render.resolution_y=view['resolution'][1]
        for frame in view['frames']:
            scene.frame_set(frame);scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG'
            if view.get('target_object'):
                bpy.context.view_layer.update();target=bpy.data.objects[view['target_object']].matrix_world.translation
                place(camera,target+Vector(view['position']),target,view['ortho_scale'])
            name=view['id']+'-%03d.png'%frame;scene.render.filepath=str(output/name);bpy.ops.render.render(write_still=True);artifacts.append(name)
    return {'engine':scene.render.engine,'renderer':gpu.platform.renderer_get(),'resolution':config['resolution'],'native_render':True,'upscaled':False,'frames':scene.frame_end if config.get('video') else len(config.get('stills',[1])),'fps':30,'duration_s':scene.frame_end/30 if config.get('video') else None,'render_elapsed_s':time.monotonic()-start,'artifacts':artifacts,'retime_factor':retime,'camera_orbit_turns':config.get('orbit_turns',0),'reviews':{'visual_human':'pending','technique_human':'pending'}}
