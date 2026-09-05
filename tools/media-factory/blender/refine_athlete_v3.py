import os,bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/refine-v3-02';out.mkdir(exist_ok=False);source=root/'factory-work/evidence/visual-02/curl-v2-source-02/curl.blend';bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;s.frame_set(1);h=bpy.data.objects['Athlete01'];r=bpy.data.objects['Athlete01_ExportRig'];base=h.data.shape_keys.key_blocks[0];shape=[v.co.copy() for v in base.data]
for key in list(h.data.shape_keys.key_blocks)[1:]:
 for i,v in enumerate(key.data):shape[i]+=(v.co-key.relative_key.data[i].co)*key.value
bodygroup=h.vertex_groups['body'].index;bodyids={v.index for v in h.data.vertices if any(g.group==bodygroup and g.weight>.5 for g in v.groups)};key=h.shape_key_add(name='Anatomical transitions V3');key.value=1;changes=[]
for i in bodyids:
 p=shape[i];delta=Vector();weights={h.vertex_groups[g.group].name:g.weight for g in h.data.vertices[i].groups}
 for side in ['l','r']:
  for stem in ['upperarm','lowerarm']:
   bone=r.data.bones[stem+'_'+side];w=weights.get(bone.name,0)
   if w<.02:continue
   axis=bone.tail_local-bone.head_local;t=(p-bone.head_local).dot(axis)/axis.length_squared
   if not .02<t<.85:continue
   radial=p-(bone.head_local+t*axis);length=max(radial.length,1e-8);front=max(0,-radial.y/length);outer=max(0,radial.x/length*(1 if side=='l' else -1));back=max(0,radial.y/length)
   if stem=='upperarm':
    gain=.14*math.exp(-((t-.12)/.13)**2)*(outer+.4*back)-.055*math.exp(-((t-.30)/.085)**2)*outer
    gain+=.08*math.exp(-((t-.49)/.19)**2)*front+.045*math.exp(-((t-.62)/.17)**2)*outer
   else:
    gain=.105*math.exp(-((t-.25)/.20)**2)*(.35+.65*outer)-.035*math.exp(-((t-.65)/.16)**2)*front
   envelope=min(1,(t-.02)/.05,(.85-t)/.08);delta+=radial*(gain*w*envelope)
 key.data[i].co=base.data[i].co+delta;shape[i]+=delta
 if delta.length>1e-7:changes.append((i,delta.length))
# Existing controls, hand vertices, weights, animation and shorts/shoes are preserved.
old=bpy.data.objects['SportsTank'];mat=old.data.materials[0];bpy.data.objects.remove(old,do_unlink=True)
def tank(p):
 x,y,z=p;x=abs(x)
 if z<1.025 or z>1.60:return False
 # Narrow shoulders into designed straps; higher and narrower neck than V2.
 limit=.205 if z<1.31 else (.205-(min(z,1.435)-1.31)/.125*.054)
 if x>limit:return False
 neck_bottom=1.485 if y<0 else 1.525
 if z>neck_bottom and x<.077:return False
 return True
faces=[list(f.vertices) for f in h.data.polygons if all(i in bodyids and tank(shape[i]) for i in f.vertices)];ids=sorted({i for f in faces for i in f});mapping={v:i for i,v in enumerate(ids)};surface=BVHTree.FromPolygons(shape,[list(f.vertices) for f in h.data.polygons if all(i in bodyids for i in f.vertices)])
verts=[]
for i in ids:
 hit,n,_,_=surface.find_nearest(shape[i]);verts.append(shape[i]+n*.005)
mesh=bpy.data.meshes.new('Designed sports tank V3');mesh.from_pydata(verts,[],[[mapping[i] for i in f] for f in faces]);mesh.update();edges={}
for poly in mesh.polygons:
 for edge in poly.edge_keys:edges[edge]=edges.get(edge,0)+1
adj={}
for (a,b),count in edges.items():
 if count==1:adj.setdefault(a,[]).append(b);adj.setdefault(b,[]).append(a)
for _ in range(12):
 updates={}
 for i,near in adj.items():
  if len(near)!=2:continue
  co=mesh.vertices[i].co*.4+sum((mesh.vertices[j].co for j in near),Vector())*.3;hit,n,_,_=surface.find_nearest(co)
  if hit is not None:co=hit+n*.005
  if co.z<1.06:co.z=1.035
  updates[i]=co
 for i,co in updates.items():mesh.vertices[i].co=co
mesh.update();o=bpy.data.objects.new('SportsTank',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat);trim=mat.copy();trim.name='Tank bound neckline armholes waistband';trim.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.005,.013,.022,1);o.data.materials.append(trim)
# Continuous edge attribute avoids the visibly jagged per-face trim of iteration01.
edgeattr=mesh.attributes.new('BoundEdge','FLOAT','POINT')
for v in mesh.vertices:
 distance=min((v.co-mesh.vertices[j].co).length for j in adj)
 edgeattr.data[v.index].value=max(0,min(1,(.018-distance)/.018))
for poly in mesh.polygons:poly.use_smooth=True;poly.material_index=0
mat=mat.copy();mat.name='Tank V3 smooth bound edges';o.data.materials[0]=mat
nodes=mat.node_tree.nodes;attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='BoundEdge';mix=nodes.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.013,.038,.058,1);mix.inputs[2].default_value=(.005,.013,.022,1);mat.node_tree.links.new(attribute.outputs['Fac'],mix.inputs[0]);mat.node_tree.links.new(mix.outputs['Color'],nodes['Principled BSDF'].inputs['Base Color'])
for bone in r.data.bones:
 vg=h.vertex_groups.get(bone.name)
 if not vg:continue
 g=o.vertex_groups.new(name=bone.name)
 for original in ids:
  weight=next((q.weight for q in h.data.vertices[original].groups if q.group==vg.index),0)
  if weight:g.add([mapping[original]],weight,'REPLACE')
a=o.modifiers.new('Athlete skinning','ARMATURE');a.object=r;a.use_deform_preserve_volume=True;sub=o.modifiers.new('Tailored edge smoothing','SUBSURF');sub.levels=1;sub.render_levels=1;sol=o.modifiers.new('Fabric thickness','SOLIDIFY');sol.thickness=.0015;sol.offset=0
coverage=h.vertex_groups['CoveredBySportswear'];preserved={v.index for v in h.data.vertices if shape[v.index].z<1.07 and any(g.group==coverage.index for g in v.groups)};border={ids[i] for i in adj};covered=set(ids)-border
for _ in range(2):covered={i for i in covered if all(j in covered for f in faces if i in f for j in f)}
coverage.remove(list(range(len(h.data.vertices))));coverage.add(list(preserved|covered),1,'REPLACE')
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'curl.blend'));(out/'recipe.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'changes':'localized deltoid separation, biceps/brachialis contour and forearm transition; higher neckline/narrower straps, bound edges and waist','changed_body_vertices':len(changes),'max_sculpt_delta_m':max(d for i,d in changes),'shirt_vertices':len(ids),'shirt_faces':len(faces),'rig_changes':False,'weight_changes':False,'pose_correctives':False,'hands':'unchanged source vertices and controllers; contact recheck required','human_reviews':'pending'},indent=2))
