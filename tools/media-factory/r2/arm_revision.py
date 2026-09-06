"""Copa arm diagnosis and bounded native surface revision; immutable inputs."""
import bpy,json,math
from mathutils import Vector,Matrix
from garment_binding import coordinates
from compare_baseline import studio,place
from arnold_refine import fade

def run(config,out):
 bpy.ops.wm.open_mainfile(filepath=config['animation_source'],load_ui=False,use_scripts=False)
 scene=bpy.context.scene;body=bpy.data.objects['Trophe_R2_Athlete'];rig=bpy.data.objects['Trophe_R2_Authoring']
 coords=coordinates(body);keys=body.data.shape_keys.key_blocks
 report={'keys':[(k.name,k.value) for k in keys],'modifiers':[],'bones':{}}
 for m in body.modifiers:
  report['modifiers'].append({'name':m.name,'type':m.type,**({k:getattr(m,k) for k in ['use_deform_preserve_volume','use_multi_modifier','vertex_group','invert_vertex_group']} if m.type=='ARMATURE' else {})})
 for b in rig.data.bones:
  if b.name.startswith(('DEF-upper_arm','DEF-forearm','DEF-shoulder')):
   report['bones'][b.name]={'head':list(b.head_local),'tail':list(b.tail_local),'segments':b.bbone_segments,'parent':b.parent.name if b.parent else None}
 if config.get('mode')=='control_audit':
  scene.frame_set(64);bpy.context.view_layer.update();report['controls']={}
  for b in rig.pose.bones:
   if any(t in b.name for t in ['upper_arm','forearm','shoulder']) and b.name.endswith('.L'):
    report['controls'][b.name]={'props':{k:b[k] for k in b.keys() if isinstance(b[k],(int,float,str))},'matrix':list(map(list,b.matrix)),'basis':list(map(list,b.matrix_basis)),'constraints':[{'name':c.name,'type':c.type,'influence':c.influence,'target':getattr(c,'subtarget',None)} for c in b.constraints]}
  report['nla']=[t.name for t in rig.animation_data.nla_tracks]
  (out/'study.json').write_text(json.dumps(report,indent=2));return {'read_only':True}
 cam=studio(scene);cam.data.sensor_fit='VERTICAL';scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=720
 def pictures(prefix):
  for f in [1,64]:
   scene.frame_set(f);bpy.context.view_layer.update();place(cam,(2.294,-3.277,2.15),(0,.02,1.13),1.35);scene.render.filepath=str(out/(prefix+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
 pictures('before')
 if config.get('mode')=='pose_contour':
  from arnold_refine import bell
  from playback_qa import points
  import numpy as np
  for side in ['L','R']:rig.pose.bones['forearm_tweak.'+side]['rubber_tweak']=config.get('elbow_rubber',0.0)
  scene.frame_set(64);bpy.context.view_layer.update()
  report['elbow_rubber']=config.get('elbow_rubber',0.0)
  topology_mods=[m for m in body.modifiers if m.type=='MASK']
  for m in topology_mods:m.show_viewport=False
  bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(dg);mesh=ev.to_mesh();posed=[body.matrix_world@v.co for v in mesh.vertices];assert len(posed)==len(body.data.vertices);ev.to_mesh_clear()
  body.crazyspace_eval(dg,scene);deltas={}
  for v in body.data.vertices:
   weights={body.vertex_groups[g.group].name:g.weight for g in v.groups};skin=weights.get('body',0)
   if skin<.5:continue
   side='L' if coords[v.index].x>0 else 'R';sign=1 if side=='L' else -1
   a=rig.pose.bones['ORG-upper_arm.'+side].head;e=rig.pose.bones['ORG-forearm.'+side].head;axis=(e-a).normalized();length=(e-a).length;q=posed[v.index];t=(q-a).dot(axis)/length
   influence=sum(w for n,w in weights.items() if n.startswith(('DEF-upper_arm.'+side,'DEF-shoulder-helper.'+side)))
   if influence<.05 or t<-.65 or t>1.05:continue
   lateral=Vector((sign,0,0));lateral=(lateral-axis*lateral.dot(axis)).normalized();front=axis.cross(lateral).normalized();r=q-(a+axis*(t*length));x=r.dot(lateral);y=r.dot(front)
   support=fade(t,-.65,-.1)*(1-fade(t,.87,1.05))*fade(influence,.05,.6)
   rx=.033+.014*bell(t,.10,.26)+.007*bell(t,.50,.23)
   ry=.031+.011*bell(t,.1,.26)+.024*bell(t,.54,.25)
   norm=math.sqrt((x/rx)**2+(y/ry)**2)
   # Broad contour edit: bring the inflated envelope toward anatomical taper;
   # retain interior landmarks and the original elbow-tip surface.
   factor=1+(.78*support)*(1/max(1,norm)-1)
   d=(lateral*x+front*y)*(factor-1)
   # Feather the under-arm chest/arm transition inward; no whole-arm smoothing.
   if x>0:d-=lateral*(.018*bell(t,-.15,.24)*fade(influence,.05,.5))
   if config.get('thoracic_transition'):
    limit=abs(a.x)-.008+.048*fade(t,-.45,.12)
    excess=max(0,sign*q.x-limit)
    d.x-=sign*excess*(1-fade(t,.20,.42))*fade(influence,.02,.25)
    # Two modest posterior triceps reliefs, separated by a shallow septum.
    relief=(.004*bell(x,-.018,.015)+.003*bell(x,.018,.014)-.0015*bell(x,0,.007))*bell(t,.54,.22)*fade(-r.y,.01,.035)
    d.y-=relief
   if d.length>1e-7:deltas[v.index]=body.crazyspace_displacement_to_original(vertex_index=v.index,displacement=body.matrix_world.to_3x3().inverted()@d)
  body.crazyspace_eval_clear()
  for m in topology_mods:m.show_viewport=True
  added=[]
  for side,sign in [('L',1),('R',-1)]:
   key=body.shape_key_add(name='Copa overhead upper-arm contour '+side,from_mix=False);key.value=1
   for i,d in deltas.items():
    if coords[i].x*sign>0:key.data[i].co=keys[0].data[i].co+d
   driver=key.driver_add('value').driver;driver.type='SCRIPTED'
   for name,bone in [('ez','ORG-forearm.'+side),('sz','ORG-upper_arm.'+side)]:
    var=driver.variables.new();var.name=name;var.type='TRANSFORMS';var.targets[0].id=rig;var.targets[0].bone_target=bone;var.targets[0].transform_type='LOC_Z';var.targets[0].transform_space='WORLD_SPACE'
   driver.expression='max(0,min(1,(ez-sz)/0.20))';added.append(key)
  scene.frame_set(64);bpy.context.view_layer.update()
  bpy.context.view_layer.update();report['pose_contour']={'native_method':'Blender crazyspace inverse sculpt displacement -> native corrective shape key. Arm-specific overhead pose form; not muscle activation.','changed_vertices':{str(i):list(d) for i,d in deltas.items()},'max_original_delta_m':max(d.length for d in deltas.values()),'source_frame':64,'source_coordinate_stage':'full evaluated body before helper MASK; native armatures and existing corrective smooth active','driver':'Separate left/right shape-key values track positive world vertical elbow-minus-shoulder separation; zero when arms lowered, full at>=20cm. This is shoulder-pose response, not elbow contraction or activation.', 'driver_values':[k.value for k in added], 'limits':'Authored overhead corrective; no generalized anatomical or technique approval.'}
  if config.get('finish_armholes'):
   import bmesh
   old=bpy.data.objects['SportsTank'];materials=list(old.data.materials);old.hide_render=True;old.hide_set(True);old.name='Copa previous tank archived'
   skin={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
   def covered(p):
    x,y,z=p;x=abs(x)
    if not 1.025<z<1.60:return False
    limit=.222-(.222-.167)*fade(z,1.345,1.435)
    if x>limit:return False
    if z>(1.492 if y<0 else 1.532) and x<.078:return False
    return True
   faces=[list(f.vertices) for f in body.data.polygons if all(i in skin and covered(coords[i]) for i in f.vertices)];bound=sorted({i for f in faces for i in f});lookup={i:j for j,i in enumerate(bound)}
   mesh=bpy.data.meshes.new('Copa higher armhole tailored shell');mesh.from_pydata([coords[i] for i in bound],[],[[lookup[i] for i in f] for f in faces]);mesh.update()
   shirt=bpy.data.objects.new('SportsTank',mesh);scene.collection.objects.link(shirt)
   for mat in materials:mesh.materials.append(mat)
   for g in body.vertex_groups:shirt.vertex_groups.new(name=g.name)
   for j,i in enumerate(bound):
    for g in body.data.vertices[i].groups:shirt.vertex_groups[g.group].add([j],g.weight,'REPLACE')
   attr=mesh.attributes.new('R2 garment body bind','INT','POINT')
   for j,i in enumerate(bound):attr.data[j].value=i
   bm=bmesh.new();bm.from_mesh(mesh);border=[v for v in bm.verts if v.is_boundary]
   for _ in range(4):bmesh.ops.smooth_vert(bm,verts=border,factor=.5,use_axis_x=True,use_axis_y=True,use_axis_z=True)
   bm.to_mesh(mesh);bm.free();mesh.update()
   for v in mesh.vertices:v.co+=v.normal*.005
   for source in body.modifiers:
    if source.type!='ARMATURE':continue
    m=shirt.modifiers.new(source.name,'ARMATURE');m.object=rig
    for name in ['use_deform_preserve_volume','use_multi_modifier','vertex_group','invert_vertex_group','use_vertex_groups','use_bone_envelopes']:setattr(m,name,getattr(source,name))
   sub=shirt.modifiers.new('Tailored smooth textile','SUBSURF');sub.levels=2;sub.render_levels=2
   wrap=shirt.modifiers.new('Native fitted textile clearance','SHRINKWRAP');wrap.target=body;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.006
   solid=shirt.modifiers.new('Textile thickness','SOLIDIFY');solid.thickness=.0012;solid.offset=1
   for f in mesh.polygons:f.use_smooth=True
   report['garment']={'reason':'Previous armhole exposed a long lateral thoracic patch visually merging with arm. Raise lower armhole to just below axillary fold; retain bare deltoid and upper arm. No skin masking.','vertices':len(bound),'faces':len(faces),'old_preserved_hidden':old.name,'body_ids':bound,'native_modifiers':[m.type for m in shirt.modifiers]}
  pictures('contour')
  for view,pos in [('rear35',(2.294,3.277,2.15)),('side',(3,0,1.4))]:
   for f in [1,33,64,95]:
    scene.frame_set(f);bpy.context.view_layer.update();place(cam,pos,(0,.03,1.14),1.3);scene.render.filepath=str(out/(view+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
  scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'));(out/'study.json').write_text(json.dumps(report,indent=2));return {'changed_vertices':len(deltas),'human_reviews':'pending'}
 if config.get('mode')=='axillary_weights':
  from playback_qa import points
  import numpy as np
  rig.data.pose_position='REST';bpy.context.view_layer.update();before_rest=points(body)
  changes={}
  for v in body.data.vertices:
   p=coords[v.index];w=fade(abs(p.x),.09,.14)*(1-fade(abs(p.x),.17,.23))*fade(p.z,1.23,1.29)*(1-fade(p.z,1.375,1.445))
   if w<=0:continue
   weights={body.vertex_groups[g.group].name:g.weight for g in v.groups};names=[n for n in weights if n.startswith(('DEF-upper_arm','DEF-shoulder-helper'))];moved=sum(weights[n] for n in names)*w*.85
   if moved<1e-6:continue
   before_weights=weights.copy()
   for n in names:weights[n]*=1-w*.85
   spine={n:q for n,q in weights.items() if n.startswith('DEF-spine.')};total=sum(spine.values())
   if total>0:
    for n,q in spine.items():weights[n]+=moved*q/total
   else:weights['DEF-spine.003']=weights.get('DEF-spine.003',0)+moved
   for n,q in weights.items():
    if n.startswith('DEF-'):(body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index],q,'REPLACE')
   changes[v.index]={'before':{n:q for n,q in before_weights.items() if n.startswith('DEF-')},'after':{n:q for n,q in weights.items() if n.startswith('DEF-')},'moved':moved}
  shirt=bpy.data.objects['SportsTank'];bind=shirt.data.attributes['R2 garment body bind'];shirt_changed=0
  for v in shirt.data.vertices:
   source=bind.data[v.index].value
   if source not in changes:continue
   for g in list(v.groups):
    if shirt.vertex_groups[g.group].name.startswith('DEF-'):shirt.vertex_groups[g.group].remove([v.index])
   for n,q in changes[source]['after'].items():(shirt.vertex_groups.get(n) or shirt.vertex_groups.new(name=n)).add([v.index],q,'REPLACE')
   shirt_changed+=1
  bpy.context.view_layer.update();report['rest_delta_m']=float(np.max(np.linalg.norm(points(body)-before_rest,axis=1)));rig.data.pose_position='POSE';bpy.context.view_layer.update()
  report['axillary_weights']={'changes':changes,'shirt_vertices_matched':shirt_changed,'region':'lateral thoracic/axillary skin below humeral head; feathered in original body coordinates; arm shaft, elbow, forearm and hands excluded','method':'Native normalized vertex groups: transfer85%*feather of helper/upper-arm influence to existing thoracic spine distribution. No global smooth or geometry displacement.'}
  pictures('axilla-rebound')
  for f in [1,33,64,95]:
   scene.frame_set(f);bpy.context.view_layer.update();place(cam,(2.294,3.277,2.15),(0,.03,1.14),1.3);scene.render.filepath=str(out/('rear35-%03d.png'%f));bpy.ops.render.render(write_still=True)
  scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'));(out/'study.json').write_text(json.dumps(report,indent=2));return {'changed_vertices':len(changes),'rest_delta_m':report['rest_delta_m'],'human_reviews':'pending'}
 if config.get('mode')=='pv':
  pv=body.vertex_groups['mhmask-preserve-volume'];report['pv_weights']=[]
  for v in body.data.vertices:
   weights={body.vertex_groups[g.group].name:g.weight for g in v.groups};arm=sum(w for n,w in weights.items() if n.startswith(('DEF-upper_arm','DEF-shoulder-helper')))
   if arm>0 and pv.index in {g.group for g in v.groups}:
    old=weights.get(pv.name,0);new=old*(1-arm);pv.add([v.index],new,'REPLACE');report['pv_weights'].append([v.index,old,new])
  pictures('local-linear')
  bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'));(out/'study.json').write_text(json.dumps(report,indent=2));return {'diagnostic_only':True}
 if config.get('mode')=='tweak_alignment':
  from cohort import key as key_pose
  stored={}
  for f in range(1,scene.frame_end+2):
   scene.frame_set(f);bpy.context.view_layer.update();stored[f]={n:rig.pose.bones[n].matrix.copy() for side in ['L','R'] for n in ['DEF-upper_arm.'+side,'ORG-forearm.'+side,'ORG-hand.'+side,'upper_arm_tweak.'+side,'upper_arm_tweak.'+side+'.001']}
  rows=[]
  for f,matrices in stored.items():
   scene.frame_set(f)
   for side in ['L','R']:
    dm=matrices['DEF-upper_arm.'+side];e=matrices['ORG-forearm.'+side].translation;w=matrices['ORG-hand.'+side].translation;axis=(e-dm.translation).normalized()
    rb=rig.data.bones['ORG-upper_arm.'+side];rf=rig.data.bones['ORG-forearm.'+side];ra=(rb.tail_local-rb.head_local).normalized();rv=rf.tail_local-rf.head_local;rv=(rv-ra*rv.dot(ra)).normalized()
    rest=rig.data.bones['DEF-upper_arm.'+side].matrix_local.to_3x3();mapping=dm.to_3x3()@rest.inverted();mapped=mapping@rv;mapped=(mapped-axis*mapped.dot(axis)).normalized();goal=w-e;goal=(goal-axis*goal.dot(axis)).normalized();angle=math.atan2(axis.dot(mapped.cross(goal)),mapped.dot(goal))
    target=Matrix.Rotation(angle,3,axis)@mapping
    for name in ['upper_arm_tweak.'+side,'upper_arm_tweak.'+side+'.001']:
     b=rig.pose.bones[name];b.matrix=Matrix.Translation(matrices[name].translation)@(target@b.bone.matrix_local.to_3x3()).to_4x4();key_pose(b,f);bpy.context.view_layer.update()
    rows.append({'frame':f,'side':side,'native_tweak_axial_deg':math.degrees(angle),'elbow_delta_m':(rig.pose.bones['ORG-forearm.'+side].head-e).length,'hand_delta_m':(rig.pose.bones['ORG-hand.'+side].head-w).length})
   if f%30==0:print('TWEAK_ALIGNMENT_FRAME',f,flush=True)
  report['native_tweak_alignment']=rows
  pictures('tweak-aligned')
  for view,pos in [('rear35',(2.294,3.277,2.15)),('side',(3,0,1.4))]:
   for f in [1,33,64,95]:
    scene.frame_set(f);bpy.context.view_layer.update();place(cam,pos,(0,.03,1.14),1.3);scene.render.filepath=str(out/(view+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
  scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'));(out/'study.json').write_text(json.dumps(report,indent=2))
  return {'diagnostic_only':True,'max_elbow_delta_m':max(r['elbow_delta_m'] for r in rows),'max_hand_delta_m':max(r['hand_delta_m'] for r in rows)}
 if config.get('mode')=='hinge':
  from cohort import key as key_pose
  stored={}
  for f in range(1,scene.frame_end+2):
   scene.frame_set(f);bpy.context.view_layer.update();stored[f]={n:rig.pose.bones[n].matrix.copy() for side in ['L','R'] for n in ['upper_arm_fk.'+side,'forearm_fk.'+side,'hand_fk.'+side]}
  rows=[]
  for f,matrices in stored.items():
   scene.frame_set(f)
   for side in ['L','R']:
    u=rig.pose.bones['upper_arm_fk.'+side];fore=rig.pose.bones['forearm_fk.'+side];hand=rig.pose.bones['hand_fk.'+side]
    um=matrices[u.name];fm=matrices[fore.name];hm=matrices[hand.name];a=um.translation;e=fm.translation;w=hm.translation;axis=(e-a).normalized()
    rb=rig.data.bones['ORG-upper_arm.'+side];rf=rig.data.bones['ORG-forearm.'+side];ra=(rb.tail_local-rb.head_local).normalized();rv=rf.tail_local-rf.head_local;rv=(rv-ra*rv.dot(ra)).normalized()
    mapped=(um.to_3x3()@rig.data.bones[u.name].matrix_local.to_3x3().inverted())@rv;mapped=(mapped-axis*mapped.dot(axis)).normalized();goal=w-e;goal=(goal-axis*goal.dot(axis)).normalized()
    angle=math.atan2(axis.dot(mapped.cross(goal)),mapped.dot(goal))
    u.matrix=Matrix.Translation(a)@Matrix.Rotation(angle,4,axis)@Matrix.Translation(-a)@um;bpy.context.view_layer.update();fore.matrix=fm;bpy.context.view_layer.update();hand.matrix=hm;bpy.context.view_layer.update()
    key_pose(u,f);key_pose(fore,f);key_pose(hand,f)
    rows.append({'frame':f,'side':side,'axial_delta_deg':math.degrees(angle),'elbow_delta_m':(fore.head-e).length,'hand_delta_m':(hand.head-w).length})
  report['hinge_alignment']=rows
  pictures('hinge-aligned')
  for view,pos in [('rear35',(2.294,3.277,2.15)),('side',(3,0,1.4))]:
   for f in [1,33,64,95]:
    scene.frame_set(f);bpy.context.view_layer.update();place(cam,pos,(0,.03,1.14),1.3);scene.render.filepath=str(out/(view+'-%03d.png'%f));bpy.ops.render.render(write_still=True)
  scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'triceps.blend'))
  (out/'study.json').write_text(json.dumps(report,indent=2))
  return {'diagnostic_only':True,'max_elbow_delta_m':max(r['elbow_delta_m'] for r in rows),'max_hand_delta_m':max(r['hand_delta_m'] for r in rows)}
 if config.get('mode')=='bendy':
  report['pose_bones']={b.name:{'head':list(b.head),'tail':list(b.tail),'curve': [b.bbone_curveinx,b.bbone_curveinz,b.bbone_curveoutx,b.bbone_curveoutz], 'ease':[b.bbone_easein,b.bbone_easeout]} for b in rig.pose.bones if b.name.startswith(('DEF-upper_arm','DEF-forearm','DEF-shoulder'))}
  from bench_qa import mesh_data
  p,tri,ids=mesh_data(body);report['posed_region']=[{'id':int(ids[i]),'p':list(map(float,q)),'rest':list(coords[int(ids[i])]),'weights':{body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[int(ids[i])].groups if body.vertex_groups[g.group].name.startswith('DEF-')}} for i,q in enumerate(p) if .14<q[0]<.4 and .90<q[2]<1.28]
  for b in rig.data.bones:
   if b.name.startswith(('DEF-upper_arm','DEF-forearm')):b.bbone_segments=1
  pictures('linear-bones')
  (out/'study.json').write_text(json.dumps(report,indent=2))
  return {'diagnostic_only':True}
 if config.get('mode')=='helper_weights':
  report['helper_pose']={}
  for side in ['L','R']:
   name='DEF-shoulder-helper.'+side;b=rig.pose.bones[name]
   report['helper_pose'][side]={'head':list(b.head),'tail':list(b.tail),'constraints':[(c.name,c.type) for c in b.constraints]}
   old=body.vertex_groups[name];new=body.vertex_groups['DEF-upper_arm.'+side];changed=[]
   for v in body.data.vertices:
    weights={g.group:g.weight for g in v.groups};w=weights.get(old.index,0)
    if w>0:new.add([v.index],weights.get(new.index,0)+w,'REPLACE');old.remove([v.index]);changed.append([v.index,w])
   report['helper_pose'][side]['changed']=changed
  pictures('helper-to-upperarm')
  bpy.ops.wm.save_as_mainfile(filepath=str(out/'arm-study.blend'))
  (out/'study.json').write_text(json.dumps(report,indent=2))
  return {'diagnostic_only':True}
 # Single-variable discriminator: remove authored inflation only within the arm.
 authored=[k for k in keys if k.name.startswith(('Preserved R1:','Arnold V2','Arnold V3'))]
 key=body.shape_key_add(name='Copa arm authored-layer diagnostic',from_mix=False);key.value=1.;changes=[]
 for i,p in enumerate(coords):
  b=rig.data.bones['ORG-upper_arm.'+('L' if p.x>0 else 'R')];axis=b.tail_local-b.head_local;t=(p-b.head_local).dot(axis)/axis.length_squared
  w=fade(abs(p.x),.115,.18)*fade(t,-.35,-.12)*(1-fade(t,.88,1.10))*fade(p.z,1.0,1.14)
  d=-sum(((k.data[i].co-k.relative_key.data[i].co)*k.value for k in authored),Vector())*w
  key.data[i].co=keys[0].data[i].co+d
  if d.length>1e-7:changes.append({'id':i,'delta':list(d),'weight':w})
 report['removed_local_authored_layers']=changes
 pictures('native-form')
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'arm-study.blend'))
 (out/'study.json').write_text(json.dumps(report,indent=2))
 return {'diagnostic_only':True,'changed_vertices':len(changes)}


def validate(config,out):
 """Bounded regression: actual hand surface, full prop matrices, pose-driver response."""
 from localize_contact import mesh_data
 import numpy as np
 def capture(path):
  bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False);scene=bpy.context.scene;body=bpy.data.objects['Trophe_R2_Athlete'];rig=bpy.data.objects['Trophe_R2_Authoring'];prop=bpy.data.objects['Copa single dumbbell authority']
  ids={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name.startswith(('DEF-hand.','DEF-f_','DEF-thumb.')) and g.weight>.1 for g in v.groups)}
  rows={}
  for frame in [1,33,64,95,121]:
   scene.frame_set(frame);bpy.context.view_layer.update();p,t,source=mesh_data(body)
   rows[frame]={'hands':{i:p[j] for j,i in enumerate(source) if i in ids},'prop':np.array(prop.matrix_world),'controls':{s:np.array(rig.pose.bones['ORG-hand.'+s].matrix) for s in ['L','R']}}
  return rows
 old=capture(config['comparison_source']);new=capture(config['animation_source']);rows=[]
 for f in old:
  assert old[f]['hands'].keys()==new[f]['hands'].keys()
  row={'frame':f,'hand_surface_max_delta_m':max(float(np.linalg.norm(p-new[f]['hands'][i])) for i,p in old[f]['hands'].items()),'prop_matrix_max_delta':float(np.max(np.abs(old[f]['prop']-new[f]['prop']))),'wrist_matrix_max_delta':max(float(np.max(np.abs(old[f]['controls'][s]-new[f]['controls'][s]))) for s in ['L','R'])};rows.append(row)
  assert row['hand_surface_max_delta_m']<1e-5 and row['prop_matrix_max_delta']<1e-6 and row['wrist_matrix_max_delta']<1e-6,row
 rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];keys=[k for k in body.data.shape_keys.key_blocks if k.name.startswith('Copa overhead upper-arm contour ')]
 assert len(keys)==2
 bpy.context.scene.frame_set(64);bpy.context.view_layer.update();elevated=[k.value for k in keys]
 rig.animation_data.action=None
 for s in ['L','R']:
  for n in ['upper_arm_fk.','forearm_fk.','hand_fk.']:rig.pose.bones[n+s].matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update();lowered=[k.value for k in keys]
 assert all(v>.99 for v in elevated) and all(v<.001 for v in lowered),(elevated,lowered)
 masks=[m.vertex_group for m in body.modifiers if m.type=='MASK'];assert 'CoveredBySportswear' not in masks
 report={'passed':True,'hands_and_prop_comparison':rows,'pose_driver':{'elevated':elevated,'lowered_native_FK_controls':lowered},'preserved_masks':masks,'limits':'Driver tests shoulder elevation response, not physiology. Actual collisions and temporal surface checks reported separately.'}
 (out/'arm-regression.json').write_text(json.dumps(report,indent=2));return report
