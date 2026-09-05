import bpy, numpy as np,json,os
from pathlib import Path
r=Path(os.environ['TROPHE_PROGRAM_ROOT']).resolve(strict=True);out=r/'factory-work/evidence/visual-02/visual02-hands-06';bpy.ops.wm.open_mainfile(filepath=str(out/'hands.blend'));h=bpy.data.objects['Athlete01'];s=bpy.context.scene;rows=[]
for f in range(1,122):
 s.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();eh=h.evaluated_get(dg);mesh=eh.to_mesh();mesh.calc_loop_triangles();verts=np.array([list(v.co)+[1] for v in mesh.vertices]);tri=np.array([list(t.vertices) for t in mesh.loop_triangles])
 for side in ['l','r']:
  mat=np.array(bpy.data.objects['Dumbbell_'+side].matrix_world.inverted()@h.matrix_world);p=(verts@mat.T)[:,:3];t=p[tri];sel=np.all(np.abs(t[:,:,0])<.085,axis=1)&np.all(np.abs(t[:,:,1])<.07,axis=1)&np.all(np.abs(t[:,:,2])<.07,axis=1);q=t[sel,:,1:];mins=[];cross=[]
  for i,j in [(0,1),(1,2),(2,0)]:
   a=q[:,i];b=q[:,j];d=b-a;frac=np.clip(-np.sum(a*d,axis=1)/np.maximum(np.sum(d*d,axis=1),1e-20),0,1);near=a+frac[:,None]*d;mins.append(np.linalg.norm(near,axis=1));cross.append(a[:,0]*b[:,1]-a[:,1]*b[:,0])
  d=np.min(mins,axis=0);cr=np.array(cross);inside=np.all(cr>=0,axis=0)|np.all(cr<=0,axis=0);d[inside]=0;clear=d-.014
  # Finite disk inner face is at |x|=.0875; hand vertices in grip region remain inside that gap.
  near=p[(np.abs(p[:,0])<.085)&(np.abs(p[:,1])<.07)&(np.abs(p[:,2])<.07)]
  rows.append({'frame':f,'side':side,'triangles':len(q),'min_surface_clearance_m':float(clear.min()),'triangles_below_minus_1mm':int(sum(clear<-.001)),'disk_axial_margin_m':float(.0875-np.max(np.abs(near[:,0])))})
 eh.to_mesh_clear()
(out/'surface-check.json').write_text(json.dumps({'method':'Exact radial minimum over projected evaluated triangles fully inside handle axial span; finite disk margin on local hand-region vertices. Not a full-body self-collision proof.','tolerance_m':.001,'samples':rows,'passed':all(x['triangles_below_minus_1mm']==0 and x['disk_axial_margin_m']>0 for x in rows)},indent=2));print('WORST',min(x['min_surface_clearance_m'] for x in rows))
