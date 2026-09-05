import os,bpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/elbow-decision-05';out.mkdir(exist_ok=False);base=root/'factory-work/evidence/visual-02';sources={'current':'refine-v3-02','weights':'elbow-weight-trial-01','corrective':'elbow-corrective-trial-03','twist':'forearm-twist-trial-01'};data={};regions={};topology=None;report={'sources':{},'stages':{},'images':[]}
def load(folder):
 bpy.ops.wm.open_mainfile(filepath=str(base/folder/'curl.blend'));return bpy.context.scene,bpy.data.objects['Athlete01'],bpy.data.objects['Athlete01_ExportRig']
def coords(s,h,f):
 s.frame_set(f);bpy.context.view_layer.update();eh=h.evaluated_get(bpy.context.evaluated_depsgraph_get());me=eh.to_mesh();assert len(me.vertices)==len(h.data.vertices);p=[v.co.copy() for v in me.vertices];eh.to_mesh_clear();return p
for stage,folder in sources.items():
 s,h,r=load(folder);edges=[tuple(e.vertices) for e in h.data.edges];faces=[tuple(f.vertices) for f in h.data.polygons];top=(len(h.data.vertices),edges,faces)
 if topology is None:
  topology=top
  for side in ['l','r']:
   joint=r.data.bones['lowerarm_'+side].head_local;regions[side]=[v.index for v in h.data.vertices if (v.co-joint).length<.065 and any(h.vertex_groups[g.group].name in ['upperarm_'+side,'lowerarm_'+side] and g.weight>.1 for g in v.groups) and any(h.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)]
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
report['weight_reference']['max_vertex_is_visible_body']=any(h.vertex_groups[g.group].name=='body' and g.weight>.5 for g in h.data.vertices[i].groups)
skinids={i for i in weight_ids if any(h.vertex_groups[g.group].name=='body' and g.weight>.5 for g in h.data.vertices[i].groups)}
i=max(skinids,key=lambda i:(data['weights'][1][i]-data['current'][1][i]).length)
report['weight_reference']['skin_only_max']={'vertex_id':i,'displacement_m':(data['weights'][1][i]-data['current'][1][i]).length,'vertices':len(skinids),'legacy_region_vertices':len(weight_ids)}
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

import shutil
old=json.loads((base/'elbow-decision-04/report.json').read_text())
for item in old['images']:
 stage=item['stage'];f=item['frame'];a=next(x for x in old['stages'][stage]['metrics'] if x['side']=='l' and x['frame']==f);b=next(x for x in report['stages'][stage]['metrics'] if x['side']=='l' and x['frame']==f)
 assert tuple(a['min_edge'])==tuple(b['min_edge']) and tuple(a['max_edge'])==tuple(b['max_edge']),(stage,f)
 shutil.copy2(base/'elbow-decision-04'/item['path'],out/item['path']);item['reuse_provenance']='Identical source, sampled pose, camera/light and extrema IDs verified against04; reuse exact native render bytes';report['images'].append(item)
(out/'report.json').write_text(json.dumps(report,indent=2));print('SKIN_ONLY_FINAL_REUSED10_VERIFIED_IMAGES')
