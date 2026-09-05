import os,bpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/elbow-decision-04';out.mkdir(exist_ok=False);base=root/'factory-work/evidence/visual-02';sources={'current':'refine-v3-02','weights':'elbow-weight-trial-01','corrective':'elbow-corrective-trial-03','twist':'forearm-twist-trial-01'};data={};regions={};topology=None;report={'sources':{},'stages':{},'images':[]}
def load(folder):
 bpy.ops.wm.open_mainfile(filepath=str(base/folder/'curl.blend'));return bpy.context.scene,bpy.data.objects['Athlete01'],bpy.data.objects['Athlete01_ExportRig']
def coords(s,h,f):
 s.frame_set(f);bpy.context.view_layer.update();eh=h.evaluated_get(bpy.context.evaluated_depsgraph_get());me=eh.to_mesh();assert len(me.vertices)==len(h.data.vertices);p=[v.co.copy() for v in me.vertices];eh.to_mesh_clear();return p
for stage,folder in sources.items():
 s,h,r=load(folder);edges=[tuple(e.vertices) for e in h.data.edges];faces=[tuple(f.vertices) for f in h.data.polygons];top=(len(h.data.vertices),edges,faces)
 if topology is None:
  topology=top
  for side in ['l','r']:
   joint=r.data.bones['lowerarm_'+side].head_local;regions[side]=[v.index for v in h.data.vertices if (v.co-joint).length<.065 and any(h.vertex_groups[g.group].name in ['upperarm_'+side,'lowerarm_'+side] and g.weight>.1 for g in v.groups)]
 assert top==topology,'Topology correspondence failed'
 report.setdefault('region_body_membership',{})[stage]={side:sum(any(h.vertex_groups[g.group].name=='body' and g.weight>.5 for g in h.data.vertices[i].groups) for i in ids) for side,ids in regions.items()}
 report['sources'][stage]={'path':str(base/folder/'curl.blend'),'sha256':hashlib.sha256((base/folder/'curl.blend').read_bytes()).hexdigest(),'unit_system':s.unit_settings.system,'scale_length':s.unit_settings.scale_length,'body_world_matrix':[list(row) for row in h.matrix_world]}
 for m in h.modifiers:
  if m.type!='ARMATURE':m.show_viewport=False
 data[stage]={f:coords(s,h,f) for f in [1,46,61,73,85,97,181]}
# Exact reference of original weight experiment: first animated frame, not skeleton bind/rest pose.
s,h,r=load('refine-v3-02');weight_ids=set()
for side in ['l','r']:
 j=r.data.bones['lowerarm_'+side].head_local
 for v in h.data.vertices:
  w=sum(g.weight for g in v.groups if h.vertex_groups[g.group].name in ['upperarm_'+side,'lowerarm_'+side])
  if w>.99 and (v.co-j).length<.085:weight_ids.add(v.index)
i=max(weight_ids,key=lambda i:(data['weights'][1][i]-data['current'][1][i]).length);report['weight_reference']={'reference':'frame1 at t=0, animated pose; not armature REST/bind pose','evaluation':'shape keys + ARMATURE PreserveVolume; all other modifiers disabled for index correspondence','topology_correspondence':True,'units':'body object coordinates; world matrix and unit scale recorded; values meters for this source','vertex_id':i,'displacement_m':(data['weights'][1][i]-data['current'][1][i]).length,'before':list(data['current'][1][i]),'after':list(data['weights'][1][i])}
# Controlled constraint bypass: replay exact pose matrices; separately isolate axial orientation with swing-only FK.
for mode in ['matrix_replay','swing_only']:
 s,h,r=load('refine-v3-02');captured={}
 for f in [1,46,61,73,85,97,181]:
  s.frame_set(f);bpy.context.view_layer.update();captured[f]={b.name:b.matrix.copy() for b in r.pose.bones}
 r.animation_data_clear()
 for b in r.pose.bones:
  for c in list(b.constraints):b.constraints.remove(c)
 for m in h.modifiers:
  if m.type!='ARMATURE':m.show_viewport=False
 data[mode]={}
 for f,matrices in captured.items():
  s.frame_set(f)
  targets={name:m.copy() for name,m in matrices.items()}
  if mode=='swing_only':
   for side in ['l','r']:
    u=r.pose.bones['upperarm_'+side];l=r.pose.bones['lowerarm_'+side];D=matrices[u.name]@u.bone.matrix_local.inverted();axis=(D.to_3x3()@(l.bone.tail_local-l.bone.head_local)).normalized();target=matrices[l.name].to_3x3()@Vector((0,1,0));q=axis.rotation_difference(target.normalized())@D.to_quaternion()@l.bone.matrix_local.to_quaternion();targets[l.name]=Matrix.Translation(matrices[l.name].translation)@q.to_matrix().to_4x4()
  for bone in r.pose.bones:
   opts={} if bone.parent is None else {'parent_matrix':targets[bone.parent.name],'parent_matrix_local':bone.parent.bone.matrix_local}
   bone.matrix_basis=bone.bone.convert_local_to_pose(targets[bone.name],bone.bone.matrix_local,invert=True,**opts)
  bpy.context.view_layer.update()
  errors=[]
  for side in ['l','r']:
   bone=r.pose.bones['lowerarm_'+side];original=matrices[bone.name];errors.extend([(bone.head-original.translation).length,(bone.tail-(original@Vector((0,bone.length,0)))).length])
  assert max(errors)<1e-5,(mode,f,errors)
  eh=h.evaluated_get(bpy.context.evaluated_depsgraph_get());me=eh.to_mesh();data[mode][f]=[v.co.copy() for v in me.vertices];eh.to_mesh_clear()
 report['stages'][mode]={'max_vertex_delta_vs_current_m':max((data[mode][f][i]-data['current'][f][i]).length for f in captured for i in range(len(h.data.vertices))),'changed_variable':'constraint evaluation bypass, identical target matrices' if mode=='matrix_replay' else 'lowerarm axial orientation only; identical bone head/axis, hand/finger matrices held; not production rig'}
assert report['stages']['matrix_replay']['max_vertex_delta_vs_current_m']<1e-5,report['stages']['matrix_replay']
for stage,frames in data.items():
 rows=[]
 for side,ids in regions.items():
  ids=set(ids);edges=[e for e in topology[1] if all(i in ids for i in e)]
  for f,p in frames.items():
   ratios=[((p[i]-p[j]).length/max((frames[1][i]-frames[1][j]).length,1e-8),(i,j)) for i,j in edges];mn=min(ratios);mx=max(ratios);pts=[p[i] for i in ids];bounds=[max(v[k] for v in pts)-min(v[k] for v in pts) for k in range(3)];rows.append({'frame':f,'side':side,'min_ratio':mn[0],'min_edge':mn[1],'max_ratio':mx[0],'max_edge':mx[1],'region_vertices':len(ids),'region_edges':len(edges),'bbox_extent_m':bounds,'edges_ratio_above2':sum(q>2 for q,e in ratios),'edges_ratio_below_point5':sum(q<.5 for q,e in ratios)})
 report['stages'].setdefault(stage,{})['metrics']=rows
# Native Blender diagnostic images: fixed evaluated geometry, identical camera/light, red=max blue=min edges.
for stage in data:
 for f in ([73] if stage in sources else [46,73,97]):
  s,h,r=load('refine-v3-02');s.frame_set(f)
  # Freeze the already evaluated mesh to prevent another deformation pass.
  # Isolate the left arm surface; no hidden torso/helper fragments in the diagnostic.
  armids={v.index for v in h.data.vertices if sum(g.weight for g in v.groups if h.vertex_groups[g.group].name in ['upperarm_l','lowerarm_l','hand_l'])>.1 and any(h.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
  armpolys=[list(p.vertices) for p in h.data.polygons if all(i in armids for i in p.vertices)]
  h.shape_key_clear()
  for m in list(h.modifiers):
   if m.type!='MASK':h.modifiers.remove(m)
  for v,p in zip(h.data.vertices,data[stage][f]):v.co=p
  for o in bpy.data.objects:
   if o.type=='MESH' and o!=h:o.hide_render=True
  material=h.data.materials[0];mesh=bpy.data.meshes.new('Isolated evaluated left arm');mesh.from_pydata(data[stage][f],[],armpolys);mesh.materials.append(material)
  for poly in mesh.polygons:poly.use_smooth=True
  h.data=mesh
  for m in list(h.modifiers):h.modifiers.remove(m)
  h.data.update();s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=8;s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=2;s.render.resolution_x=384;s.render.resolution_y=384;s.render.resolution_percentage=100;s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG';joint=r.pose.bones['lowerarm_l'].head.copy();s.camera.location=joint+Vector((2,-.3,.1));s.camera.rotation_euler=(joint-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=.30
  # Markers projected onto a plane close to camera retain exact screen locations, including occluded edges.
  camera=s.camera;normal=(joint-camera.location).normalized();plane=camera.location+normal*.5
  def project(p):return p+normal*((plane-p).dot(normal))
  row=next(x for x in report['stages'][stage]['metrics'] if x['side']=='l' and x['frame']==f)
  for label,color in [('max',(1,0,0,1)),('min',(0,.15,1,1))]:
   edge=row[label+'_edge'];a,b=[project(data[stage][f][i]) for i in edge];cu=bpy.data.curves.new(label,'CURVE');cu.dimensions='3D';cu.bevel_depth=.0007;sp=cu.splines.new('POLY');sp.points.add(1)
   for point,co in zip(sp.points,[a,b]):point.co=(*co,1)
   ob=bpy.data.objects.new(label,cu);bpy.context.collection.objects.link(ob);mat=bpy.data.materials.new(label);mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();em=nodes.new('ShaderNodeEmission');em.inputs[0].default_value=color;output=nodes.new('ShaderNodeOutputMaterial');mat.node_tree.links.new(em.outputs[0],output.inputs[0]);cu.materials.append(mat)
  name=f'{stage}-{f:03}.png';s.render.filepath=str(out/name);bpy.ops.render.render(write_still=True);report['images'].append({'path':name,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'stage':stage,'frame':f,'red':'maximum ratio edge, projected annotation','blue':'minimum ratio edge, projected annotation','camera_target':list(joint),'ortho_scale':.30,'note':'elbow-local diagnostic; no claim of full-body render or adopted change'})
(out/'report.json').write_text(json.dumps(report,indent=2));print('ELBOW_DECISION_COMPLETE',report['weight_reference'],report['stages']['matrix_replay']['max_vertex_delta_vs_current_m'])
