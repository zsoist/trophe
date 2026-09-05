import bpy,pathlib,json,time,os,hashlib,gpu
root=pathlib.Path(os.environ['TROPHE_FACTORY_ROOT']).resolve(strict=True);out=root/'curl-hd-01';out.mkdir(exist_ok=False)
lock=root/'pc-gpu-lock';lock.mkdir();(lock/'owner.json').write_text(json.dumps({'id':'ag2-curl-hd-01','pid':os.getpid(),'started_at':time.time()}))
bpy.ops.wm.open_mainfile(filepath=str(root/'curl-draft-02/curl.blend'))
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100;s.frame_start=1;s.frame_end=120;s.render.fps=30
h=bpy.data.objects['Athlete01'];r=bpy.data.objects['Athlete01_ExportRig'];samples={};poses={}
for f in [1,31,61,91,121]:
 s.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();samples[f]=[v.co.copy() for v in h.evaluated_get(dg).data.vertices];poses[f]={n:list(r.pose.bones[n].head) for n in ['upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r']}
delta=max((a-b).length for a,b in zip(samples[1],samples[61]));loop=max((a-b).length for a,b in zip(samples[1],samples[121]));assert delta>.05 and loop<.001,(delta,loop)
s.frame_set(1);s.render.image_settings.media_type='VIDEO';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='MEDIUM';s.render.filepath=str(out/'motion-1080.partial.mp4')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'curl.blend'))
t=time.monotonic();bpy.ops.render.render(animation=True);elapsed=time.monotonic()-t
video=out/'motion-1080.partial.mp4';assert video.stat().st_size>1000;video.rename(out/'motion-1080.mp4')
s.frame_set(1);s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='WEBP';s.render.image_settings.quality=85;s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(out/'poster.webp');bpy.ops.render.render(write_still=True)
result={'id':'ag2-curl-hd-01','pid':os.getpid(),'blender':bpy.app.version_string,'build_hash':bpy.app.build_hash.decode(),'engine':'BLENDER_EEVEE','renderer':gpu.platform.renderer_get(),'graphics_version':gpu.platform.version_get(),'frames':120,'fps':30,'width':1920,'height':1080,'duration_seconds':4,'elapsed_seconds':elapsed,'evaluated_vertex_delta_m':delta,'loop_endpoint_delta_m':loop,'poses':poses,'visual_review':'pending','technique_review':'pending'}
(out/'result.json').write_text(json.dumps(result,indent=2));(out/'terminal.json').write_text(json.dumps({'id':result['id'],'pid':os.getpid(),'script_exit':0}));print('CURL_HD_CONTINUOUS_PASS')
