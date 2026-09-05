import os,bpy,json,math
from pathlib import Path
r=Path(os.environ['TROPHE_PROGRAM_ROOT']);bpy.ops.wm.open_mainfile(filepath=str(r/'factory-work/evidence/visual-02/refine-v3-02/curl.blend'));rig=bpy.data.objects['Athlete01_ExportRig'];s=bpy.context.scene;rows=[]
for f in [1,31,49,73,109,181]:
 s.frame_set(f)
 for side in ['l','r']:
  u=rig.pose.bones['upperarm_'+side];l=rig.pose.bones['lowerarm_'+side];du=(u.matrix@u.bone.matrix_local.inverted()).to_quaternion();dl=(l.matrix@l.bone.matrix_local.inverted()).to_quaternion();diff=du.rotation_difference(dl);a=diff.angle;a=min(a,2*math.pi-a);bend=(u.tail-u.head).angle(l.tail-l.head);rows.append({'frame':f,'side':side,'skin_transform_difference_deg':math.degrees(a),'geometric_bend_deg':math.degrees(bend),'upper_deformation_quat':list(du),'lower_deformation_quat':list(dl)})
(r/'factory-work/evidence/visual-02/v3-temporal-diagnosis-01/transform-audit.json').write_text(json.dumps(rows,indent=2));print(rows)
