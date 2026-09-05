import os,bpy,json,math
from pathlib import Path
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);paths={'before':'refine-v3-02','trial':'forearm-twist-trial-01'};regions={};rows=[];points={}
for stage,folder in paths.items():
 bpy.ops.wm.open_mainfile(filepath=str(root/'factory-work/evidence/visual-02'/folder/'curl.blend'));s=bpy.context.scene;h=bpy.data.objects['Athlete01'];r=bpy.data.objects['Athlete01_ExportRig']
 if stage=='before':
  for side in ['l','r']:
   joint=r.data.bones['lowerarm_'+side].head_local;regions[side]={v.index for v in h.data.vertices if (v.co-joint).length<.065 and any(h.vertex_groups[g.group].name in ['upperarm_'+side,'lowerarm_'+side] and g.weight>.1 for g in v.groups)}
 for m in h.modifiers:
  if m.type!='ARMATURE':m.show_viewport=False
 coords={}
 for f in [1,31,49,61,73,85,109,145,181]:
  s.frame_set(f);eh=h.evaluated_get(bpy.context.evaluated_depsgraph_get());me=eh.to_mesh();coords[f]=[v.co.copy() for v in me.vertices];eh.to_mesh_clear()
  for side in ['l','r']:
   upper=r.pose.bones['upperarm_'+side];lower=r.pose.bones[('lowerarm_' if stage=='before' else 'lowerarm_proximal_')+side];du=(upper.matrix@upper.bone.matrix_local.inverted()).to_quaternion();dl=(lower.matrix@lower.bone.matrix_local.inverted()).to_quaternion();a=du.rotation_difference(dl).angle;points[stage,side,f]=math.degrees(min(a,2*math.pi-a))
 for side,ids in regions.items():
  edges=[list(e.vertices) for e in h.data.edges if all(i in ids for i in e.vertices)]
  for f in coords:
   ratios=[(coords[f][i]-coords[f][j]).length/max((coords[1][i]-coords[1][j]).length,1e-8) for i,j in edges];rows.append({'stage':stage,'side':side,'frame':f,'vertices':len(ids),'edges':len(edges),'min_ratio':min(ratios),'max_ratio':max(ratios),'deformation_rotation_difference_deg':points[stage,side,f]})
(root/'factory-work/evidence/visual-02/forearm-twist-trial-01/same-region-comparison.json').write_text(json.dumps(rows,indent=2));print([x for x in rows if x['side']=='l' and x['frame'] in [1,73]])
