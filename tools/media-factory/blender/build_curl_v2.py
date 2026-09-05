import os
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(os.environ['TROPHE_PROGRAM_ROOT']).resolve(strict=True);out=root/'factory-work/evidence/visual-02/curl-v2-source-02';out.mkdir(exist_ok=False);source=root/'factory-work/evidence/visual-02/athlete-v2-04/athlete.blend';bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;r=bpy.data.objects['Athlete01_ExportRig'];h=bpy.data.objects['Athlete01'];s.frame_set(1)
handbases={};shoulders={};upperctrl={}
for side in ['l','r']:
 inv=r.data.bones['hand_'+side].matrix_local.inverted();heads=[inv@r.data.bones[d+'_01_'+side].head_local for d in ['index','middle','ring','pinky']];A=(heads[0]-heads[-1]).normalized();D=sum(heads,Vector())/4;D=(D-A*D.dot(A)).normalized();N=A.cross(D).normalized()
 if (inv@r.data.bones['thumb_03_'+side].tail_local).dot(N)<0:N=-N
 handbases[side]=(D,N);shoulders[side]=r.pose.bones['upperarm_'+side].head.copy()
 bpy.ops.object.empty_add();u=bpy.context.object;u.name='CTRL_upperarm_'+side;upperctrl[side]=u
 for name in ['CTRL_grip_'+side,'CTRL_forearm_'+side]:bpy.data.objects[name].animation_data_clear()
 con=r.pose.bones['upperarm_'+side].constraints.new('COPY_TRANSFORMS');con.target=u;con.owner_space='WORLD';con.target_space='WORLD'
r.animation_data_clear()
def angle(t):
 t=t%6
 if t<=2.4:x=t/2.4;f=3*x*x-2*x*x*x
 else:x=(t-2.4)/3.6;f=1-(3*x*x-2*x*x*x)
 return .16+(2.04-.16)*f
poses=[]
for frame in range(1,182):
 time=(frame-1)/30;s.frame_set(frame);theta=angle(time);row={'frame':frame,'pts_seconds':time,'elbow_curve_radians':theta,'hands':{}}
 for side in ['l','r']:
  D,N=handbases[side];ud=Vector((.23 if side=='l' else -.23,-.18,-1)).normalized();ub=r.data.bones['upperarm_'+side];uq=(ub.tail_local-ub.head_local).rotation_difference(ud)@ub.matrix_local.to_quaternion();uc=upperctrl[side];uc.location=shoulders[side];uc.rotation_mode='QUATERNION';uc.rotation_quaternion=uq
  elbow=shoulders[side]+ud*ub.length;direction=Vector((0,-math.sin(theta),-math.cos(theta)));normal=direction.cross(Vector((1,0,0))).normalized();desired=Matrix((direction.cross(normal),direction,normal)).transposed();hbasis=Matrix((D.cross(N),D,N)).transposed();hq=(desired@hbasis.transposed()).to_quaternion();fore=r.data.bones['lowerarm_'+side];rd=(fore.tail_local-fore.head_local).normalized();rn=r.data.bones['hand_'+side].matrix_local.to_3x3()@N;rn=(rn-rd*rn.dot(rd)).normalized();fb=Matrix((rd.cross(rn),rd,rn)).transposed();fq=(desired@fb.transposed()@fore.matrix_local.to_3x3()).to_quaternion()
  fc=bpy.data.objects['CTRL_forearm_'+side];fc.location=elbow;fc.rotation_mode='QUATERNION';fc.rotation_quaternion=fq;hc=bpy.data.objects['CTRL_grip_'+side];hc.location=elbow+direction*fore.length;hc.rotation_mode='QUATERNION';hc.rotation_quaternion=hq
  for ctrl in [uc,fc,hc]:ctrl.keyframe_insert('location',frame=frame);ctrl.keyframe_insert('rotation_quaternion',frame=frame)
  row['hands'][side]=list(hc.location)
 poses.append(row)
s.frame_start=1;s.frame_end=180;s.render.fps=30;s.frame_set(1);s.camera.location=(2.6,-4.7,2.0);s.camera.rotation_euler=(Vector((0,0,.88))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=3.65;s.render.resolution_x=1280;s.render.resolution_y=720;s.render.resolution_percentage=100
boneids={h.vertex_groups[n].index for n in r.data.bones.keys() if h.vertex_groups.get(n)};weight_sums=[sum(g.weight for g in v.groups if g.group in boneids) for v in h.data.vertices];weighted=[x for x in weight_sums if x>0]
loop={}
for side in ['l','r']:
 p0=Vector(poses[0]['hands'][side]);pm=Vector(poses[-2]['hands'][side]);p1=Vector(poses[1]['hands'][side]);pe=Vector(poses[-1]['hands'][side]);loop[side]={'position_delta_m':(pe-p0).length,'one_frame_velocity_difference_m_s':((p1-p0)*30-(pe-pm)*30).length,'analytic_endpoint_velocity':0}
assert len(set(round(p['elbow_curve_radians'],9) for p in poses[:73]))==73
bpy.ops.wm.save_as_mainfile(filepath=str(out/'curl.blend'));(out/'recipe.json').write_text(json.dumps({'variant':'standing bilateral fixed-supination dumbbell curl','source_blend_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'duration':6,'fps':30,'render_frames':[1,180],'closure_frame_not_rendered':181,'phase_design':[{'phase':'concentric','start':0,'end':2.4},{'phase':'eccentric','start':2.4,'end':6}],'curve':'cubic Hermite ease per phase, continuous value and velocity, asymmetric editorial tempo; no duplicated endpoint','reference':'movement-reference.json','loop':loop,'weight_sum_range':[min(weighted),max(weighted)],'preserve_volume':True,'human_reviews':'pending','frames':poses},indent=2));print('CURL_V2_AUTHORED',loop)
