import os
import bpy,math,json
from pathlib import Path
from mathutils import Vector
root=Path(os.environ['TROPHE_PROGRAM_ROOT']).resolve(strict=True);out=root/'factory-work/evidence/visual-02/athlete-v2-04';out.mkdir(exist_ok=False);bpy.ops.wm.open_mainfile(filepath=str(root/'factory-work/evidence/visual-02/visual02-hands-06/hands.blend'));s=bpy.context.scene;r=bpy.data.objects['Athlete01_ExportRig'];h=bpy.data.objects['Athlete01'];s.frame_set(1)
# Bake the existing MPFB phenotype, preserving the original in the immutable source master.
keys=h.data.shape_keys.key_blocks;base=keys[0];coords=[v.co.copy() for v in base.data]
for key in list(keys)[1:]:
 if key.value:
  for i,v in enumerate(key.data):coords[i]+=(v.co-key.relative_key.data[i].co)*key.value
h.shape_key_clear()
for v,co in zip(h.data.vertices,coords):v.co=co
bpy.context.view_layer.update();h.data.update();basis=h.shape_key_add(name='Basis');definition=h.shape_key_add(name='Athletic proportion sculpt');definition.value=1
bone_names=set(r.data.bones.keys());body_group=h.vertex_groups['body'].index;body_ids={v.index for v in h.data.vertices if any(g.group==body_group and g.weight>.5 for g in v.groups)}
for v in h.data.vertices:
 if v.index not in body_ids:continue
 p=v.co.copy();delta=Vector();weights={h.vertex_groups[g.group].name:g.weight for g in v.groups if h.vertex_groups[g.group].name in bone_names}
 for side in ['l','r']:
  for stem,gain in [('upperarm',.24),('lowerarm',.12),('thigh',.16),('calf',.14)]:
   name=stem+'_'+side;weight=weights.get(name,0)
   if weight<.02:continue
   bone=r.data.bones[name];axis=bone.tail_local-bone.head_local;t=(p-bone.head_local).dot(axis)/axis.length_squared
   if 0<t<1:
    radial=p-(bone.head_local+axis*t);bulge=math.sin(math.pi*t)**2
    if stem=='upperarm':bulge+=.45*math.exp(-((t-.12)/.15)**2)
    delta+=radial*(gain*bulge*weight)
    if stem=='upperarm':
     anterior=max(0,-radial.y/max(radial.length,1e-6));posterior=max(0,radial.y/max(radial.length,1e-6));delta+=radial*(weight*(.22*anterior*math.exp(-((t-.48)/.24)**2)+.12*posterior*math.exp(-((t-.57)/.30)**2)))
 # Pectoral and scapular volume; compact falloffs avoid altering neck/abdomen or hands.
 chest=math.exp(-((abs(p.x)-.10)/.105)**4-((p.z-1.34)/.095)**4)
 if abs(p.x)<.235:
  if p.y<-.02:delta.y-=.015*chest
  elif p.y>.015:delta.y+=.009*chest
  waist=math.exp(-((p.z-1.10)/.12)**4);delta.x-=p.x*.025*waist
 definition.data[v.index].co=p+delta
# Replace only obsolete coverage masks, preserving helper/shoe masks and source vertices.
for name in ['Delete.male_casualsuit06','Body under trousers']:
 if h.modifiers.get(name):h.modifiers.remove(h.modifiers[name])
old=bpy.data.objects.get('Athlete01.male_casualsuit06');bpy.data.objects.remove(old,do_unlink=True)
shape=[v.co.copy() for v in definition.data];h.data.update()
def fabric(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.78;p.inputs['Sheen Weight'].default_value=.18
 noise=m.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=260;bum=m.node_tree.nodes.new('ShaderNodeBump');bum.inputs['Strength'].default_value=.12;bum.inputs['Distance'].default_value=.0004;m.node_tree.links.new(noise.outputs['Fac'],bum.inputs['Height']);m.node_tree.links.new(bum.outputs['Normal'],p.inputs['Normal']);return m
shirtmat=fabric('Unbranded fitted tank - midnight',(.013,.038,.058));shortmat=fabric('Unbranded athletic shorts - graphite',(.022,.025,.033))
def tank(p):
 x,y,z=p
 if z<.995 or z>1.56:return False
 if abs(x)>.225:return False
 if z>(1.445 if y>0 else 1.405) and abs(x)<.105:return False
 if z>1.30 and abs(x)>.185 and z<1.415:return False
 return True
def shorts(p):return .645<p.z<1.075 and abs(p.x)<.28
coverage=set();records={}
for name,predicate,mat in [('SportsTank',tank,shirtmat),('SportsShorts',shorts,shortmat)]:
 faces=[list(f.vertices) for f in h.data.polygons if all(i in body_ids for i in f.vertices) and all(predicate(shape[i]) for i in f.vertices)];ids=sorted({i for f in faces for i in f});mapping={v:i for i,v in enumerate(ids)};verts=[]
 for i in ids:
  p=shape[i].copy();normal=h.data.vertices[i].normal;offset=.0045 if name=='SportsTank' else .013
  p+=normal*offset
  if name=='SportsShorts' and p.z<.91:
   center=Vector((.09 if p.x>0 else -.09,.01,p.z));rad=p-center
   if rad.length>0:p+=rad.normalized()*.006
  verts.append(p)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[[mapping[i] for i in f] for f in faces]);mesh.update()
 from mathutils.bvhtree import BVHTree
 surface=BVHTree.FromPolygons(shape,[list(f.vertices) for f in h.data.polygons if all(i in body_ids for i in f.vertices)])
 edgecounts={}
 for poly in mesh.polygons:
  for edge in poly.edge_keys:edgecounts[edge]=edgecounts.get(edge,0)+1
 neighbours={}
 for (a,b),count in edgecounts.items():
  if count==1:neighbours.setdefault(a,[]).append(b);neighbours.setdefault(b,[]).append(a)
 for iteration in range(12):
  updates={}
  for i,adj in neighbours.items():
   if len(adj)!=2:continue
   co=mesh.vertices[i].co*.4+(mesh.vertices[adj[0]].co+mesh.vertices[adj[1]].co)*.3
   hit,normal,_,_=surface.find_nearest(co)
   if hit is not None:co=hit+normal*(.0045 if name=='SportsTank' else .018)
   if name=='SportsTank' and co.z<1.035:co.z=1.005
   if name=='SportsShorts' and co.z>1.00:co.z=1.055
   if name=='SportsShorts' and co.z<.70:co.z=.66
   updates[i]=co
  for i,co in updates.items():mesh.vertices[i].co=co
 mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 for bone in r.data.bones:
  source=h.vertex_groups.get(bone.name)
  if not source:continue
  group=o.vertex_groups.new(name=bone.name)
  for original in ids:
   weight=next((g.weight for g in h.data.vertices[original].groups if g.group==source.index),0)
   if weight:group.add([mapping[original]],weight,'REPLACE')
 mod=o.modifiers.new('Athlete skinning','ARMATURE');mod.object=r;mod.use_deform_preserve_volume=True
 sub=o.modifiers.new('Tailored edge smoothing','SUBSURF');sub.levels=1;sub.render_levels=1
 solid=o.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.0015;solid.offset=0
 for f in mesh.polygons:f.use_smooth=True
 # Erode coverage at garment edges, keeping intact anatomy under hems and armholes.
 edges={}
 for face in faces:
  for a,b in zip(face,face[1:]+face[:1]):k=tuple(sorted((a,b)));edges[k]=edges.get(k,0)+1
 border={i for edge,count in edges.items() if count==1 for i in edge};covered=set(ids)-border
 for _ in range(1):covered={i for i in covered if all(j in covered for edge in edges if i in edge for j in edge)}
 coverage|=covered;records[name]={'vertices':len(ids),'faces':len(faces),'covered_body_vertices':len(covered),'source':'Derived from CC0 MPFB body geometry; original tailored selection and offsets'}
vg=h.vertex_groups.new(name='CoveredBySportswear')
if coverage:vg.add(list(coverage),1,'REPLACE')
mask=h.modifiers.new('Sportswear coverage only','MASK');mask.vertex_group=vg.name;mask.invert_vertex_group=True
skin=bpy.data.materials.new('Skin - warm medium controlled');skin.use_nodes=True;p=skin.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.27,.135,.095,1);p.inputs['Roughness'].default_value=.62;p.inputs['Specular IOR Level'].default_value=.25;p.inputs['Subsurface Weight'].default_value=.06
noise=skin.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=180;bump=skin.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.07;bump.inputs['Distance'].default_value=.00025;skin.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);skin.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal']);h.data.materials.clear();h.data.materials.append(skin)
for o in bpy.data.objects:
 if o.name.startswith('DumbbellPart'):
  for f in o.data.polygons:f.use_smooth=True
 if o.type=='LIGHT':o.data.energy*=.60
s.view_settings.exposure=-.35;s.camera.location=(2.6,-4.7,2.0);s.camera.rotation_euler=(Vector((0,0,.88))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=2.15;s.render.resolution_x=720;s.render.resolution_y=900
# Recut the compatible unbranded footwear to a low ankle trainer; retain the old master.
import bmesh
shoe=bpy.data.objects['Athlete01.shoes01']
if shoe.data.shape_keys:
 ks=shoe.data.shape_keys.key_blocks;cs=[v.co.copy() for v in ks[0].data]
 for key in list(ks)[1:]:
  for i,v in enumerate(key.data):cs[i]+=(v.co-key.relative_key.data[i].co)*key.value
 shoe.shape_key_clear()
 for v,co in zip(shoe.data.vertices,cs):v.co=co
bm=bmesh.new();bm.from_mesh(shoe.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z>.135],context='VERTS');bm.to_mesh(shoe.data);bm.free()
shoe.data.materials.clear();shoe.data.materials.append(fabric('Trainer upper',(.035,.042,.05)));shoe.data.materials.append(fabric('Trainer midsole',(.32,.34,.35)))
for poly in shoe.data.polygons:
 poly.material_index=int(sum(shoe.data.vertices[i].co.z for i in poly.vertices)/len(poly.vertices)<.045)
if h.modifiers.get('Delete.shoes01'):h.modifiers.remove(h.modifiers['Delete.shoes01'])
footcover=h.vertex_groups.new(name='TrainerCoverage');footids=[]
for v in h.data.vertices:
 if shape[v.index].z<.07 and any(h.vertex_groups[g.group].name in ['foot_l','foot_r','ball_l','ball_r'] and g.weight>.1 for g in v.groups):footids.append(v.index)
footcover.add(footids,1,'REPLACE');fm=h.modifiers.new('Trainer foot coverage','MASK');fm.vertex_group=footcover.name;fm.invert_vertex_group=True
for img in bpy.data.images:
 if img.name=='brown_eye.png':img.filepath=str(root/'factory-work/evidence/visual-02/brown_eye.png');img.reload();img.pack()
nail=bpy.data.materials.new('Natural nail');nail.use_nodes=True;np=nail.node_tree.nodes['Principled BSDF'];np.inputs['Base Color'].default_value=(.36,.18,.13,1);np.inputs['Roughness'].default_value=.32;h.data.materials.append(nail);ng=h.vertex_groups.get('fingernails');ni={v.index for v in h.data.vertices if ng and any(g.group==ng.index and g.weight>.5 for g in v.groups)}
for poly in h.data.polygons:
 if all(i in ni for i in poly.vertices):poly.material_index=1
bpy.ops.wm.save_as_mainfile(filepath=str(out/'athlete.blend'));(out/'geometry.json').write_text(json.dumps({'garments':records,'body_vertices_preserved':len(h.data.vertices),'covered_vertices':len(coverage),'leg_vertices_visible':sum(i not in coverage and shape[i].z<.645 for i in body_ids),'human_reviews':'pending','images':[{'name':i.name,'path':i.filepath,'packed':bool(i.packed_file)} for i in bpy.data.images]},indent=2));print('ATHLETE_GEOMETRY_DRAFT')
