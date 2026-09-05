import os,bpy,json,math,hashlib,time,numpy as np
from pathlib import Path
from mathutils import Vector
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/v3-temporal-diagnosis-01';out.mkdir(exist_ok=False);source=root/'factory-work/evidence/visual-02/refine-v3-02/curl.blend';bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;h=bpy.data.objects['Athlete01'];r=bpy.data.objects['Athlete01_ExportRig'];rows=[];tracking={};maxdrift={}
# Final evaluated skin, not a pair of parented nodes. Fixed actual surface vertices near the handle.
for f in range(1,182):
 s.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();eh=h.evaluated_get(dg);me=eh.to_mesh();verts=np.array([list(v.co)+[1] for v in me.vertices])
 for side in ['l','r']:
  mat=np.array(bpy.data.objects['Dumbbell_'+side].matrix_world.inverted()@h.matrix_world);p=(verts@mat.T)[:,:3];rad=np.linalg.norm(p[:,1:],axis=1)
  if f==1:
   ids=np.where((np.abs(p[:,0])<.075)&(np.abs(rad-.014)<.002))[0];tracking[side]={'ids':ids,'initial':p[ids].copy(),'min_radius':float(rad[ids].min()),'max_radius':float(rad[ids].max())};maxdrift[side]={'axial_m':0.,'circumferential_m':0.,'radial_m':0.}
  tr=tracking[side];q=p[tr['ids']];b=tr['initial'];angle=np.arctan2(q[:,2],q[:,1])-np.arctan2(b[:,2],b[:,1]);angle=(angle+np.pi)%(2*np.pi)-np.pi
  metrics={'axial_m':float(np.max(np.abs(q[:,0]-b[:,0]))),'circumferential_m':float(np.max(np.abs(angle))*.014),'radial_m':float(np.max(np.abs(np.linalg.norm(q[:,1:],axis=1)-np.linalg.norm(b[:,1:],axis=1))))}
  for k,v in metrics.items():maxdrift[side][k]=max(maxdrift[side][k],v)
  rows.append({'frame':f,'side':side,**metrics})
 eh.to_mesh_clear()
(out/'skin-contact-motion.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'Track fixed evaluated skin vertex IDs initially within2mm radial band of14mm handle, in full actual dumbbell coordinates; circumferential distance on14mm radius. Not a force/friction simulation or comprehensive pressure/contact-area proof.','vertices_per_hand':{k:len(v['ids']) for k,v in tracking.items()},'max_drift':maxdrift,'samples':rows},indent=2))
# Isolate static shape additions from skinning by measuring the same elbow edges with/without them.
for m in h.modifiers:
 if m.type!='ARMATURE':m.show_viewport=False
keys=h.data.shape_keys.key_blocks;report=[]
for stage,values in [('mpfb-only',[0,0]),('v2-proportions',[1,0]),('v3-transitions',[1,1])]:
 keys['Athletic proportion sculpt'].value=values[0];keys['Anatomical transitions V3'].value=values[1];coords={}
 for f in [1,49,61,73,85,109,145,181]:
  s.frame_set(f);eh=h.evaluated_get(bpy.context.evaluated_depsgraph_get());me=eh.to_mesh();coords[f]=[v.co.copy() for v in me.vertices];eh.to_mesh_clear()
 for side in ['l','r']:
  elbow=r.data.bones['lowerarm_'+side].head_local;ids={v.index for v in h.data.vertices if (v.co-elbow).length<.065 and any(h.vertex_groups[g.group].name in ['upperarm_'+side,'lowerarm_'+side] and g.weight>.1 for g in v.groups)};edges=[list(e.vertices) for e in h.data.edges if all(i in ids for i in e.vertices)]
  for f in coords:
   ratios=[]
   for i,j in edges:
    initial=(coords[1][i]-coords[1][j]).length
    if initial>1e-6:ratios.append(((coords[f][i]-coords[f][j]).length/initial,i,j))
   worst=max(ratios);entry={'stage':stage,'side':side,'frame':f,'min_ratio':min(ratios)[0],'max_ratio':worst[0],'worst_edge_ids':worst[1:],'worst_edge_rest_midpoint':list((h.data.vertices[worst[1]].co+h.data.vertices[worst[2]].co)*.5),'weights':[{h.vertex_groups[g.group].name:g.weight for g in h.data.vertices[i].groups if h.vertex_groups[g.group].name in r.data.bones} for i in worst[1:]]};report.append(entry)
(out/'elbow-isolation.json').write_text(json.dumps(report,indent=2));print('CONTACT',maxdrift);print('ELBOW',[x for x in report if x['side']=='l' and x['frame']==73])
