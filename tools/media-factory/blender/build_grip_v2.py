import bpy,os,json,math,time
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(os.environ['TROPHE_FACTORY_ROOT']).resolve(strict=True);out=root/'visual02-hands-06';out.mkdir(exist_ok=False)
lock=root/'pc-gpu-lock';lock.mkdir();(lock/'owner.json').write_text(json.dumps({'id':'ag2-visual02-hands-06','pid':os.getpid(),'started_at':time.time()}))
bpy.ops.wm.open_mainfile(filepath=str(root/'curl-hd-01/curl.blend'))
s=bpy.context.scene;r=bpy.data.objects['Athlete01_ExportRig'];h=bpy.data.objects['Athlete01'];s.render.engine='BLENDER_EEVEE';s.render.resolution_x=640;s.render.resolution_y=640;s.render.resolution_percentage=100;s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG';s.camera.data.ortho_scale=.25
report={'baseline':'db1dd7665fc93d851dd70acd09fcbc2d22dc31d3711f09a4e10fdd53e6a6773a','frames':{},'geometry':{},'human_reviews':'pending'}
def axes(side):
 inv=r.data.bones['hand_'+side].matrix_local.inverted();heads=[inv@r.data.bones[d+'_01_'+side].head_local for d in ['index','middle','ring','pinky']];A=(heads[0]-heads[-1]).normalized();D=sum(heads,Vector())/4;D=(D-A*D.dot(A)).normalized();N=A.cross(D).normalized();thumb=inv@r.data.bones['thumb_03_'+side].tail_local
 if thumb.dot(N)<0:N=-N
 return inv,heads,A,D,N
basis={side:axes(side) for side in ['l','r']}
def render_views(stage):
 for f in [1,31,61]:
  s.frame_set(f);bpy.context.view_layer.update()
  for side in ['l','r']:
   inv,heads,A,D,N=basis[side];hm=r.pose.bones['hand_'+side].matrix;ctr=hm@(sum(heads,Vector())/4);a=hm.to_3x3()@A;n=hm.to_3x3()@N;d=hm.to_3x3()@D
   for view,offset in [('palm',n),('side',(a+n*.65).normalized()),('back',-n)]:
    cam=s.camera;cam.location=ctr+offset*.7-d*.03;cam.rotation_euler=(ctr-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(out/f'{stage}-{side}-{f:03}-{view}.png');bpy.ops.render.render(write_still=True)
# Baseline views preserved in hands-01.
# Controls are the sole authority: hand control -> hand, finger controls, dumbbell.
# No object reads a bone which it also drives.
ctrls={};finger_local={};handle_local={}
for side in ['l','r']:
 inv,heads,A,D,N=basis[side];bpy.ops.object.empty_add();ctrl=bpy.context.object;ctrl.name='CTRL_grip_'+side;ctrl.empty_display_size=.05;ctrls[side]=ctrl
 C=sum(heads,Vector())/4-D*.014+N*.036
 handle_local[side]=Matrix.Translation(C)@Matrix((A,D,N)).transposed().to_4x4()
 prop=bpy.data.objects['Dumbbell_'+side];prop.animation_data_clear();prop.parent=ctrl;prop.matrix_parent_inverse=Matrix.Identity(4);prop.matrix_basis=handle_local[side]
 for digit in ['index','middle','ring','pinky']:
  names=[digit+'_'+seg+'_'+side for seg in ['01','02','03']];start=inv@r.data.bones[names[0]].head_local;lengths=[r.data.bones[n].length for n in names];c=C+A*(start-C).dot(A)
  # Fit an external polygon around the cylinder, using measured link lengths.
  # Penalize capsule penetration; unlike inscribed chords, tangential links leave room for skin.
  radii={'index':.0155,'middle':.016,'ring':.0145,'pinky':.011};pad=radii[digit]
  def positions(angles):
   points=[start.copy()];theta=0
   for length,angle in zip(lengths,angles):
    theta+=angle;points.append(points[-1]+length*(D*math.cos(theta)+N*math.sin(theta)))
   return points
  def loss(angles):
   pts=positions(angles);value=0
   for i in range(3):
    v=pts[i+1]-pts[i];t=max(0,min(1,(c-pts[i]).dot(v)/v.length_squared));dist=(pts[i]+t*v-c).length;target=.014+pad*(1-.12*i);err=dist-target;value+=err*err*(25 if err<0 else 1)
   tip=(pts[-1]-c);value+=.4*(tip.length-(.014+pad*.7))**2
   value+=.2*max(0,tip.dot(D))**2
   return value
  best=min(((loss((i*.12,j*.15,k*.15)),(i*.12,j*.15,k*.15)) for i in range(3,13) for j in range(3,12) for k in range(2,10)),key=lambda x:x[0])[1]
  angles=list(best)
  for step in [.08,.03,.01,.003]:
   for sweep in range(4):
    for i in range(3):
     options=[]
     for delta in [-step,0,step]:
      q=angles.copy();q[i]=max(.05,min(1.7,q[i]+delta));options.append((loss(q),q))
     angles=min(options,key=lambda x:x[0])[1]
  pts=positions(angles)
  for i,name in enumerate(names):
   rest=inv@r.data.bones[name].matrix_local;q=(rest.to_3x3()@Vector((0,1,0))).rotation_difference((pts[i+1]-pts[i]).normalized());finger_local[name]=Matrix.Translation(pts[i])@(q@rest.to_quaternion()).to_matrix().to_4x4()
  report['geometry'][side+'-'+digit]={'joint_angles_radians':angles,'capsule_loss':loss(angles),'pad_radius_m':pad}
 # Thumb: three-link FABRIK with an opposition pole; targets the opposite side of handle.
 names=['thumb_'+seg+'_'+side for seg in ['01','02','03']];points=[inv@r.data.bones[n].head_local for n in names]+[inv@r.data.bones[names[-1]].tail_local];lengths=[r.data.bones[n].length for n in names];base=points[0].copy();target=C+A*.018-D*.006+N*.033
 for _ in range(40):
  points[-1]=target.copy()
  for i in range(2,-1,-1):points[i]=points[i+1]+(points[i]-points[i+1]).normalized()*lengths[i]
  points[0]=base.copy()
  for i in range(3):points[i+1]=points[i]+(points[i+1]-points[i]).normalized()*lengths[i]
 for i,name in enumerate(names):
  rest=inv@r.data.bones[name].matrix_local;q=(rest.to_3x3()@Vector((0,1,0))).rotation_difference((points[i+1]-points[i]).normalized());finger_local[name]=Matrix.Translation(points[i])@(q@rest.to_quaternion()).to_matrix().to_4x4()
 for name,mat in [(n,m) for n,m in finger_local.items() if n.endswith('_'+side)]:
  bpy.ops.object.empty_add();o=bpy.context.object;o.name='CTRL_'+name;o.parent=ctrl;o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=mat;o.empty_display_size=.007
  b=r.pose.bones[name];con=b.constraints.new('COPY_TRANSFORMS');con.name='Explicit grip control';con.target=o;con.owner_space='WORLD';con.target_space='WORLD'
 report['geometry'][side]={'handle_center_local':list(C),'axis_local':list(A),'palmar_normal_local':list(N),'thumb_target_local':list(target),'controller':ctrl.name}
# Bake authoritative hand controls from forearm positions; full orientation gives a supinated grip.
forectrls={}
for side in ['l','r']:
 bpy.ops.object.empty_add();o=bpy.context.object;o.name='CTRL_forearm_'+side;forectrls[side]=o
for f in range(1,122):
 s.frame_set(f)
 for side in ['l','r']:
  inv,heads,A,D,N=basis[side];fore=r.pose.bones['lowerarm_'+side];direction=(fore.tail-fore.head).normalized();normal=direction.cross(Vector((1,0,0))).normalized();desired=Matrix((direction.cross(normal),direction,normal)).transposed();local=Matrix((D.cross(N),D,N)).transposed();q=(desired@local.transposed()).to_quaternion();ctrl=ctrls[side];ctrl.location=fore.tail;ctrl.rotation_mode='QUATERNION';ctrl.rotation_quaternion=q;ctrl.keyframe_insert('location',frame=f);ctrl.keyframe_insert('rotation_quaternion',frame=f)
  restfore=r.data.bones['lowerarm_'+side];rd=(restfore.tail_local-restfore.head_local).normalized();rn=r.data.bones['hand_'+side].matrix_local.to_3x3()@N;rn=(rn-rd*rn.dot(rd)).normalized();restbasis=Matrix((rd.cross(rn),rd,rn)).transposed();fq=(desired@restbasis.transposed()@restfore.matrix_local.to_3x3()).to_quaternion();fc=forectrls[side];fc.location=fore.head;fc.rotation_mode='QUATERNION';fc.rotation_quaternion=fq;fc.keyframe_insert('location',frame=f);fc.keyframe_insert('rotation_quaternion',frame=f)
for side in ['l','r']:
 con=r.pose.bones['lowerarm_'+side].constraints.new('COPY_TRANSFORMS');con.target=forectrls[side];con.owner_space='WORLD';con.target_space='WORLD'
for side in ['l','r']:
 con=r.pose.bones['hand_'+side].constraints.new('COPY_TRANSFORMS');con.target=ctrls[side];con.owner_space='WORLD';con.target_space='WORLD'
s.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(out/'hands.blend'))
# Smooth-shaded equipment and preserve volume in the evaluated render.
for obj in bpy.data.objects:
 if obj.name.startswith('DumbbellPart'):
  for polygon in obj.data.polygons: polygon.use_smooth=True
for modifier in h.modifiers:
 if modifier.type=='ARMATURE':modifier.use_deform_preserve_volume=True
bpy.ops.wm.save_as_mainfile(filepath=str(out/'hands.blend')); render_views('after')
# Evaluated mesh clearance to finite handle and disks, per hand and phase. Negative = penetration.
for f in [1,31,61]:
 s.frame_set(f);dg=bpy.context.evaluated_depsgraph_get();mesh=h.evaluated_get(dg).to_mesh()
 for side in ['l','r']:
  pm=bpy.data.objects['Dumbbell_'+side].matrix_world.inverted();pts=[pm@(h.matrix_world@v.co) for v in mesh.vertices];near=[p for p in pts if abs(p.x)<.08 and abs(p.y)<.07 and abs(p.z)<.07];handle=[math.hypot(p.y,p.z)-.014 for p in near if abs(p.x)<.10];report['frames'][f'{f}-{side}']={'near_mesh_vertices':len(near),'minimum_handle_clearance_m':min(handle) if handle else None,'penetrating_handle_vertices':sum(x<-.001 for x in handle),'contact_band_vertices':sum(abs(x)<.003 for x in handle)}
 h.evaluated_get(dg).to_mesh_clear()
(out/'diagnostics.json').write_text(json.dumps(report,indent=2));(out/'terminal.json').write_text(json.dumps({'id':'ag2-visual02-hands-06','pid':os.getpid(),'script_exit':0}));print('HANDS_DIAGNOSTIC_COMPLETE')
