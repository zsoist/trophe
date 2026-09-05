import os,bpy,json,math
from pathlib import Path
from mathutils import Vector
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/refine-v3-baseline';out.mkdir(exist_ok=False)
bpy.ops.wm.open_mainfile(filepath=str(root/'factory-work/evidence/visual-02/curl-v2-source-02/curl.blend'));s=bpy.context.scene;h=bpy.data.objects['Athlete01'];r=bpy.data.objects['Athlete01_ExportRig']
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=2;s.render.resolution_x=480;s.render.resolution_y=600;s.render.resolution_percentage=100;s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG';s.camera.data.ortho_scale=1.18
for f in [1,73]:
 s.frame_set(f);s.camera.location=(3,-.1,1.25);s.camera.rotation_euler=(Vector((0,-.12,1.15))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(out/f'side-{f:03}.png');bpy.ops.render.render(write_still=True)
# Evaluate unchanged topology for localized strain diagnosis, without masks/subdivision.
for m in h.modifiers:
 if m.type!='ARMATURE':m.show_viewport=False
coords={}
for f in [1,73]:
 s.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();eh=h.evaluated_get(dg);me=eh.to_mesh();assert len(me.vertices)==len(h.data.vertices);coords[f]=[v.co.copy() for v in me.vertices];eh.to_mesh_clear()
rows=[]
for side in ['l','r']:
 elbow=r.data.bones['lowerarm_'+side].head_local;ids={v.index for v in h.data.vertices if (v.co-elbow).length<.065 and any(h.vertex_groups[g.group].name in ['upperarm_'+side,'lowerarm_'+side] and g.weight>.1 for g in v.groups)}
 ratios=[]
 for e in h.data.edges:
  i,j=e.vertices
  if i in ids and j in ids:
   before=(coords[1][i]-coords[1][j]).length;after=(coords[73][i]-coords[73][j]).length
   if before>1e-6:ratios.append(after/before)
 rows.append({'side':side,'region_vertices':len(ids),'edges':len(ratios),'min_edge_length_ratio':min(ratios),'max_edge_length_ratio':max(ratios),'interpretation':'diagnostic strain only; not automatic proof of incorrect skinning'})
(out/'strain.json').write_text(json.dumps(rows,indent=2));print(rows)
