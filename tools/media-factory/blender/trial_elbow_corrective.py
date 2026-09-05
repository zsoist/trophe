import os,bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/elbow-corrective-trial-03';out.mkdir(exist_ok=False);source=root/'factory-work/evidence/visual-02/refine-v3-02/curl.blend';bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;h=bpy.data.objects['Athlete01'];r=bpy.data.objects['Athlete01_ExportRig'];saved=[(m,m.show_viewport) for m in h.modifiers]
for m in h.modifiers:
 if m.type!='ARMATURE':m.show_viewport=False
adj={i:set() for i in range(len(h.data.vertices))}
for e in h.data.edges:
 a,b=e.vertices;adj[a].add(b);adj[b].add(a)
regions={}
for side in ['l','r']:
 joint=r.data.bones['lowerarm_'+side].head_local;ids={}
 for v in h.data.vertices:
  weights={h.vertex_groups[g.group].name:g.weight for g in v.groups};w=weights.get('upperarm_'+side,0)+weights.get('lowerarm_'+side,0);dist=(v.co-joint).length
  if w>.99 and dist<.08:ids[v.index]=max(0,1-(dist/.08)**2)**2
 regions[side]=ids
allids=set().union(*[set(x) for x in regions.values()])
def evaluate(f):
 s.frame_set(f);bpy.context.view_layer.update();eh=h.evaluated_get(bpy.context.evaluated_depsgraph_get());me=eh.to_mesh();assert len(me.vertices)==len(h.data.vertices);p=[v.co.copy() for v in me.vertices];eh.to_mesh_clear();return p
before={f:evaluate(f) for f in [1,31,49,61,73,85,109,145,181]};posed=before[73];target=[p.copy() for p in posed]
# Non-shrinking paired smoothing on an explicit elbow patch; maximum displacement3mm.
for _ in range(5):
 for strength in [.5,-.53]:
  updates={}
  for side,ids in regions.items():
   for i,falloff in ids.items():
    average=sum((target[j] for j in adj[i]),Vector())/len(adj[i]);updates[i]=target[i]+(average-target[i])*strength*falloff
  for i,p in updates.items():target[i]=p
for i in allids:
 delta=target[i]-posed[i]
 if delta.length>.003:target[i]=posed[i]+delta.normalized()*.003
# Numerical per-vertex skinning Jacobian maps desired posed-space correction to rest-space delta.
base=h.data.shape_keys.key_blocks[0];probe=h.shape_key_add(name='Temporary Jacobian probe',from_mix=False);probe.value=1;columns={i:[] for i in allids};epsilon=.001
for axis in range(3):
 offset=Vector();offset[axis]=epsilon
 for i in allids:probe.data[i].co=base.data[i].co+offset
 q=evaluate(73)
 for i in allids:columns[i].append((q[i]-posed[i])/epsilon)
h.shape_key_remove(probe);correctives=[]
for side,ids in regions.items():
 key=h.shape_key_add(name='Elbow flexion surface corrective '+side,from_mix=False)
 for i in ids:
  J=Matrix(columns[i]).transposed();delta=J.inverted_safe()@(target[i]-posed[i]);key.data[i].co=base.data[i].co+delta
 s.frame_set(73);bpy.context.view_layer.update();anglemax=r.pose.bones['upperarm_'+side].matrix.to_quaternion().rotation_difference(r.pose.bones['lowerarm_'+side].matrix.to_quaternion()).angle
 s.frame_set(1);bpy.context.view_layer.update();anglerest=r.pose.bones['upperarm_'+side].matrix.to_quaternion().rotation_difference(r.pose.bones['lowerarm_'+side].matrix.to_quaternion()).angle
 anglemax=min(anglemax,2*math.pi-anglemax);anglerest=min(anglerest,2*math.pi-anglerest);threshold=anglerest+.35*(anglemax-anglerest);span=anglemax-threshold;driver=key.driver_add('value').driver;driver.type='SCRIPTED';v=driver.variables.new();v.name='a';v.type='ROTATION_DIFF'
 for t,bone in zip(v.targets,['upperarm_'+side,'lowerarm_'+side]):t.id=r;t.bone_target=bone;t.transform_space='WORLD_SPACE'
 x=f'min(1,max(0,(a-{threshold})/{span}))';driver.expression=f'({x})**2*(3-2*({x}))';correctives.append({'name':key.name,'vertices':len(ids),'rest_angle':anglerest,'max_angle':anglemax,'threshold':threshold,'expression':driver.expression})
after={f:evaluate(f) for f in before};rows=[]
for stage,coords in [('before',before),('after',after)]:
 for side,ids in regions.items():
  edges=[list(e.vertices) for e in h.data.edges if all(i in ids and ids[i]>.1 for i in e.vertices)]
  for f in coords:
   ratios=[(coords[f][i]-coords[f][j]).length/max((coords[1][i]-coords[1][j]).length,1e-8) for i,j in edges];rows.append({'stage':stage,'side':side,'frame':f,'min_ratio':min(ratios),'max_ratio':max(ratios)})
maxdelta={f:max((after[f][i]-before[f][i]).length for i in allids) for f in before}
outside=max((after[f][i]-before[f][i]).length for f in before for i in range(len(h.data.vertices)) if i not in allids);assert outside<1e-5,outside;assert maxdelta[1]<1e-6,maxdelta[1];assert max(maxdelta.values())<.0031,maxdelta
for m,show in saved:m.show_viewport=show
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'curl.blend'));(out/'comparison.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'pose-space elbow patch smoothing with paired positive/negative steps, clamped3mm, inverse numerical skinning Jacobian; driven by actual upper/lower-arm rotation difference','correctives':correctives,'weights_changed':False,'amplitude_changed':False,'before_after':rows,'max_evaluated_displacement_m':maxdelta,'target_max_delta_m':max((target[i]-posed[i]).length for i in allids),'status':'experimental; contact and visual QA required'},indent=2));print('CORRECTIVE_RESULT',[x for x in rows if x['frame']==73],maxdelta)
