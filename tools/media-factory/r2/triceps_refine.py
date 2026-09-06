"""Bounded QA-driven copa revision on an immutable master, native Rigify FK."""
import bpy,json,math
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from compare_baseline import studio,place
from cohort import key
from triceps import ease
from playback_qa import points

def orient(bone,direction,position,reference):
 before=reference.to_3x3();swing=(before@Vector((0,1,0))).rotation_difference(direction.normalized())
 bone.matrix=Matrix.Translation(position)@swing.to_matrix().to_4x4()@before.to_4x4()

def run(config,out):
 bpy.ops.wm.open_mainfile(filepath=config['animation_source'],load_ui=False,use_scripts=False)
 scene=bpy.context.scene;rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];prop=bpy.data.objects['Copa single dumbbell authority']
 scene.frame_set(1);bpy.context.view_layer.update();old=[]
 for f in [1,46,91,136,181]:
  scene.frame_set(f);bpy.context.view_layer.update();row={'frame':f,'joints':{}}
  for side in ['L','R']:
   p=lambda n:rig.matrix_world@rig.pose.bones[n+'.'+side].head
   s,e,w,h=[p(n) for n in ['ORG-upper_arm','ORG-forearm','ORG-hand','ORG-f_middle.01']]
   row['joints'][side]={'upper_arm':list(e-s),'elbow':list(e),'elbow_flex_deg':math.degrees((e-s).angle(w-e)),'forearm_palm_deg':math.degrees((w-e).angle(h-w))}
  old.append(row)
 scene.frame_set(1);bpy.context.view_layer.update()
 head={n:{'matrix_basis':list(map(list,rig.pose.bones[n].matrix_basis)),'world_rotation_delta_from_rest_deg':math.degrees((rig.pose.bones[n].matrix.to_3x3()@rig.pose.bones[n].bone.matrix_local.to_3x3().inverted()).to_quaternion().angle)} for n in ['head','neck'] if n in rig.pose.bones}
 static={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
 rig.animation_data.action=None;prop.animation_data_clear()
 for b in rig.pose.bones:b.matrix_basis=static[b.name]
 upper_refs={};fore_refs={};elbows={};targets={s:bpy.data.objects['Copa wrist target '+s] for s in ['L','R']}
 for side,sign in [('L',1),('R',-1)]:
  rig.pose.bones['upper_arm_parent.'+side]['IK_FK']=1.
  for c in list(rig.pose.bones['hand_ik.'+side].constraints):
   if c.name.startswith('Copa'):rig.pose.bones['hand_ik.'+side].constraints.remove(c)
  bpy.context.view_layer.update()
  # Small additional static girdle elevation relative to already-elevated8degree base.
  sh=rig.pose.bones['shoulder.'+side];m=sh.matrix.copy();p=m.translation.copy();sh.matrix=Matrix.Translation(p)@Matrix.Rotation(-sign*math.radians(config.get('additional_shoulder_deg',4)),4,'Y')@Matrix.Translation(-p)@m
  bpy.context.view_layer.update()
  u=rig.pose.bones['upper_arm_fk.'+side];upper_refs[side]=u.matrix.copy();fore_refs[side]=rig.pose.bones['forearm_fk.'+side].matrix.copy()
  direction=Vector((-sign*math.sin(math.radians(config.get('upper_inward_deg',5))),math.sin(math.radians(config.get('upper_posterior_deg',3))),1)).normalized()
  orient(u,direction,u.head.copy(),upper_refs[side]);bpy.context.view_layer.update();upper_refs[side]=u.matrix.copy()
  elbows[side]=rig.matrix_world@rig.pose.bones['ORG-forearm.'+side].head
 # This revision preserves all native finger poses and prop-local grip transforms.
 for o in list(scene.objects):
  if config.get('remove_backrest',True) and o.name=='Copa bench backrest':bpy.data.objects.remove(o,do_unlink=True)
 mean=sum(elbows.values(),Vector())/2;local=sum((t.matrix_basis.translation for t in targets.values()),Vector())/2
 length=rig.data.bones['ORG-forearm.L'].length
 half=abs(targets['L'].matrix_basis.translation.x)
 radius=math.sqrt(length*length-(half-abs(elbows['L'].x))**2)
 frames=config.get('frames',120);down=config.get('down_frames',63);pause=config.get('bottom_pause_frames',12);up=config.get('up_frames',36)
 def phase(frame):
  f=(frame-1)%frames
  if f<=down:return ease(f/down)
  if f<=down+pause:return 1.
  if f<=down+pause+up:return 1-ease((f-down-pause)/up)
  return 0.
 rows=[]
 for f in range(1,frames+2):
  scene.frame_set(f);q=phase(f);angle=math.radians(config.get('top_forearm_deg',8)+(config.get('bottom_forearm_deg',125)-config.get('top_forearm_deg',8))*q)
  rotation=Matrix.Rotation(math.radians(config.get('grip_tilt_offset_deg',90))-angle,4,'X') if config.get('tilt_with_forearm',True) else Matrix.Identity(4)
  center=Vector((0,mean.y+radius*math.sin(angle),mean.z+radius*math.cos(angle)))
  prop.matrix_world=Matrix.Translation(center-rotation.to_3x3()@local)@rotation
  bpy.context.view_layer.update()
  for side in ['L','R']:
   u=rig.pose.bones['upper_arm_fk.'+side];u.matrix=upper_refs[side];bpy.context.view_layer.update()
   fore=rig.pose.bones['forearm_fk.'+side];w=targets[side].matrix_world.translation
   orient(fore,rig.matrix_world.to_3x3().inverted()@(w-elbows[side]),rig.matrix_world.inverted()@elbows[side],fore_refs[side]);bpy.context.view_layer.update()
   hand=rig.pose.bones['hand_fk.'+side];hand.matrix=rig.matrix_world.inverted()@targets[side].matrix_world;bpy.context.view_layer.update()
   key(u,f);key(fore,f);key(hand,f)
  for channel in ['location','rotation_quaternion','scale']:prop.keyframe_insert(channel,frame=f)
  row={'frame':f,'phase':q,'sides':{}}
  for side in ['L','R']:
   p=lambda n:rig.matrix_world@rig.pose.bones[n+'.'+side].head
   s,e,w,h=[p(n) for n in ['ORG-upper_arm','ORG-forearm','ORG-hand','ORG-f_middle.01']]
   row['sides'][side]={'elbow_error_m':(e-elbows[side]).length,'elbow':list(e),'upper_arm_axis':list((e-s).normalized()),'elbow_flex_deg':math.degrees((e-s).angle(w-e)),'forearm_palm_deg':math.degrees((w-e).angle(h-w)),'wrist_target_error_m':(w-targets[side].matrix_world.translation).length}
  rows.append(row)
 for b in rig.pose.bones:
  if not b.name.startswith(('ORG-','DEF-','MCH-','upper_arm_fk.','forearm_fk.','hand_fk.')):key(b,1);key(b,frames+1)
 for obj in [rig,prop]:
  for layer in obj.animation_data.action.layers:
   for strip in layer.strips:
    for bag in strip.channelbags:
     for fc in bag.fcurves:
      for p in fc.keyframe_points:p.interpolation='BEZIER';p.handle_left_type='AUTO_CLAMPED';p.handle_right_type='AUTO_CLAMPED'
      for p in fc.keyframe_points:
       if any(abs(p.co.x-boundary)<.001 for boundary in [1,down+1,down+pause+1,down+pause+up+1,frames+1]):
        p.handle_left_type='FREE';p.handle_right_type='FREE';p.handle_left=(p.co.x-1/3,p.co.y);p.handle_right=(p.co.x+1/3,p.co.y)
      fc.modifiers.new('CYCLES')
 scene.frame_start=1;scene.frame_end=frames;scene.render.fps=30;scene.frame_set(1);bpy.context.view_layer.update()
 report={'source':config['animation_source'],'baseline_measured':old,'head_neck_baseline':head,'frames':frames,'closure_frame':frames+1,'fps':30,'timing':{'down_s':down/30,'bottom_pause_s':pause/30,'up_s':up/30,'top_pause_s':(frames-down-pause-up)/30},'authority':'Fixed native FK upper arm; FK forearm -> complete hand transforms follow a single rigid prop; preserved finger local poses; no IK evaluator used for arm path','tilt_with_forearm':config.get('tilt_with_forearm',True),'rows':rows,'human_reviews':'pending','notes':'Tilt is a deliberate proposed change: fixed grip plus vertical prop cannot preserve wrist alignment throughout a large elbow arc. No internal activation added; anatomical surface QA required.'}
 if config.get('axilla_seeds'):
  # Local native corrective, seeded only by actually crossed source triangles.
  seeds=set(config['axilla_seeds']);adj={i:set() for i in range(len(body.data.vertices))}
  for edge in body.data.edges:
   a,b=edge.vertices;adj[a].add(b);adj[b].add(a)
  distance={i:0 for i in seeds};front=set(seeds)
  for depth in range(1,5):
   nxt={j for i in front for j in adj[i] if j not in distance}
   distance.update({i:depth for i in nxt});front=nxt
  group=body.vertex_groups.new(name='Copa QA localized axillary fold')
  for i,d in distance.items():group.add([i],(1-d/5)**2,'REPLACE')
  modifier=body.modifiers.new('Copa native axillary pose correction','CORRECTIVE_SMOOTH');modifier.vertex_group=group.name;modifier.factor=.5;modifier.iterations=5;modifier.smooth_type='LENGTH_WEIGHTED';modifier.rest_source='BIND'
  body.modifiers.move(len(body.modifiers)-1,min(i for i,m in enumerate(body.modifiers) if m.type=='MASK'))
  rig.data.pose_position='REST';bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.correctivesmooth_bind(modifier=modifier.name);assert modifier.is_bind
  on=points(body);modifier.show_viewport=False;bpy.context.view_layer.update();off=points(body);rest_delta=float(np.max(np.linalg.norm(on-off,axis=1)))
  modifier.show_viewport=True;rig.data.pose_position='POSE';bpy.context.view_layer.update();effects=[]
  for f in [1,33,64,95,121]:
   scene.frame_set(f);bpy.context.view_layer.update();on=points(body);modifier.show_viewport=False;bpy.context.view_layer.update();off=points(body);modifier.show_viewport=True;bpy.context.view_layer.update();effects.append({'frame':f,'max_surface_change_m':float(np.max(np.linalg.norm(on-off,axis=1)))})
  report['local_corrective']={'type':'CORRECTIVE_SMOOTH','seeds':sorted(seeds),'vertices':len(distance),'iterations':5,'factor':.5,'rest':'skeleton REST with active source shape, before masks','rest_delta_m':rest_delta,'effects':effects,'not_muscle_activation':True}
 scene.frame_set(1);bpy.context.view_layer.update()
 (out/'revision.json').write_text(json.dumps(report,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'))
 cam=studio(scene);cam.data.sensor_fit='VERTICAL';scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=720
 for view,pos,target,scale in [('side',(3,0,1.05),(0,.04,1.05),1.8),('front',(2,-4,1.7),(0,.03,.88),2.08),('rear',(-1.7,4,1.7),(0,.08,1.20),1.4)]:
  for f in [1,down+1]:
   scene.frame_set(f);bpy.context.view_layer.update();place(cam,pos,target,scale);scene.render.filepath=str(out/(view+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
 return {'max_elbow_error_m':max(j['elbow_error_m'] for r in rows for j in r['sides'].values()),'max_palm_forearm_deg':max(j['forearm_palm_deg'] for r in rows for j in r['sides'].values()),'frames':frames,'diagnostic':True}

def cross_section_area(p,tri,source,body,rig,side,fraction):
 """Convex cross-sectional envelope from actual plane/mesh crossings; not volume."""
 group={v.index for v in body.data.vertices if any(g.weight>.20 and body.vertex_groups[g.group].name.startswith('DEF-upper_arm') and body.vertex_groups[g.group].name.endswith('.'+side) for g in v.groups)}
 s=rig.matrix_world@rig.pose.bones['ORG-upper_arm.'+side].head;e=rig.matrix_world@rig.pose.bones['ORG-forearm.'+side].head
 normal=(e-s).normalized();center=s+(e-s)*fraction;axis=normal.cross(Vector((0,1,0))).normalized();second=normal.cross(axis).normalized();hits=[]
 for t in tri:
  if not all(source[i] in group for i in t):continue
  verts=[Vector(p[i]) for i in t];ds=[(v-center).dot(normal) for v in verts]
  for k in range(3):
   j=(k+1)%3
   if ds[k]*ds[j]<0:
    q=verts[k]+(verts[j]-verts[k])*(ds[k]/(ds[k]-ds[j]))-center;hits.append((q.dot(axis),q.dot(second)))
 xy=sorted(set(hits))
 if len(xy)<3:return {'area_m2':None,'plane_hits':len(xy),'method':'insufficient cut'}
 def turn(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
 lower=[];upper=[]
 for q in xy:
  while len(lower)>1 and turn(lower[-2],lower[-1],q)<=0:lower.pop()
  lower.append(q)
 for q in reversed(xy):
  while len(upper)>1 and turn(upper[-2],upper[-1],q)<=0:upper.pop()
  upper.append(q)
 hull=lower[:-1]+upper[:-1];area=abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(hull,hull[1:]+hull[:1])))*.5
 return {'area_m2':area,'plane_hits':len(xy),'method':'convex envelope of actual triangle-plane crossings; not local tissue volume or fold validation'}
