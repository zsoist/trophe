import os,bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/elbow-weight-trial-01';out.mkdir(exist_ok=False);source=root/'factory-work/evidence/visual-02/refine-v3-02/curl.blend';bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;h=bpy.data.objects['Athlete01'];r=bpy.data.objects['Athlete01_ExportRig'];saved=[(m,m.show_viewport) for m in h.modifiers]
for m in h.modifiers:
 if m.type!='ARMATURE':m.show_viewport=False
adj={i:set() for i in range(len(h.data.vertices))}
for e in h.data.edges:
 a,b=e.vertices;adj[a].add(b);adj[b].add(a)
regions={};snapshot={};weights={}
for side in ['l','r']:
 upper=h.vertex_groups['upperarm_'+side];lower=h.vertex_groups['lowerarm_'+side];joint=r.data.bones['lowerarm_'+side].head_local
 vals={};ids={}
 for v in h.data.vertices:
  gs={g.group:g.weight for g in v.groups};u=gs.get(upper.index,0);l=gs.get(lower.index,0)
  if u+l>.99:
   vals[v.index]=u/(u+l)
   dist=(v.co-joint).length
   if dist<.085:ids[v.index]=max(0,1-(dist/.085)**2)**2
 regions[side]=ids;weights[side]=vals;snapshot[side]={i:vals[i] for i in ids}
def evaluate():
 coords={}
 for f in [1,31,49,61,73,85,109,145,181]:
  s.frame_set(f);eh=h.evaluated_get(bpy.context.evaluated_depsgraph_get());me=eh.to_mesh();coords[f]=[v.co.copy() for v in me.vertices];eh.to_mesh_clear()
 rows=[]
 for side,ids in regions.items():
  edges=[list(e.vertices) for e in h.data.edges if all(i in ids and ids[i]>.1 for i in e.vertices)]
  for f in coords:
   ratios=[(coords[f][i]-coords[f][j]).length/max((coords[1][i]-coords[1][j]).length,1e-8) for i,j in edges];rows.append({'side':side,'frame':f,'min_edge_ratio':min(ratios),'max_edge_ratio':max(ratios)})
 return coords,rows
before,br=evaluate()
for side,vals in weights.items():
 original=vals.copy();ids=regions[side]
 for _ in range(6):
  nxt=vals.copy()
  for i,falloff in ids.items():
   near=[vals[j] for j in adj[i] if j in vals]
   if near:nxt[i]=vals[i]+.3*falloff*(sum(near)/len(near)-vals[i])
  vals=nxt
 for i in ids:
  # Preserve normalized two-bone contribution; never touch hand vertices/groups.
  h.vertex_groups['upperarm_'+side].add([i],vals[i],'REPLACE');h.vertex_groups['lowerarm_'+side].add([i],1-vals[i],'REPLACE')
after,ar=evaluate();maxdelta={str(f):max((after[f][i]-before[f][i]).length for ids in regions.values() for i in ids) for f in before}
report={'hypothesis':'Localized spatial weight-gradient smoothing can reduce inherited elbow stretch; geometry and controls held fixed. This is an experiment, not accepted deformation QA.','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'before':br,'after':ar,'max_evaluated_displacement_m':maxdelta,'max_weight_change':{side:max(abs(weights[side][i]-snapshot[side][i]) for i in ids) for side,ids in regions.items()},'human_reviews':'pending','status':'unreviewed experimental variant'}
# Re-read actual final weights for truthful delta.
for side,ids in regions.items():report['max_weight_change'][side]=max(abs(h.vertex_groups['upperarm_'+side].weight(i)-snapshot[side][i]) for i in ids)
for m,show in saved:m.show_viewport=show
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'curl.blend'));(out/'comparison.json').write_text(json.dumps(report,indent=2));print('WEIGHT_TRIAL',[x for x in br+ar if x['frame']==73],maxdelta)
