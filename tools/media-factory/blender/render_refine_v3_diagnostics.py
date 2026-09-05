import os,bpy,json,time,hashlib
from pathlib import Path
from mathutils import Vector
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/refine-v3-02-views';out.mkdir(exist_ok=False);source=root/'factory-work/evidence/visual-02/refine-v3-02/curl.blend';bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=2;s.render.resolution_x=640;s.render.resolution_y=800;s.render.resolution_percentage=100;s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG';s.camera.data.ortho_scale=2.1;s.view_settings.exposure=-.35
for o in bpy.data.objects:
 if o.type=='LIGHT':o.data.energy=420 if o.location.x>1 else 160 if o.location.x<-1 else 500
rows=[];start=time.monotonic()
for name,f,loc in [('rest',1,(2.6,-4.7,2)),('max-flexion',73,(2.6,-4.7,2)),('side-max-flexion',73,(3,-.1,1.25))]:
 s.frame_set(f);s.camera.location=loc;s.camera.rotation_euler=(Vector((0,0,.88))-s.camera.location).to_track_quat('-Z','Y').to_euler();p=out/(name+'.png');s.render.filepath=str(p);bpy.ops.render.render(write_still=True);rows.append({'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'frame':f,'source_kind':'scene_render','camera':loc,'target':[0,0,.88],'ortho_scale':2.1})
(out/'index.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'recipe_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'backend':'Cycles CPU2threads16samples','elapsed_seconds':time.monotonic()-start,'entries':rows,'human_visual':'pending','human_technique':'pending'},indent=2));print('REFINE_V3_DIAGNOSTICS_COMPLETE')
