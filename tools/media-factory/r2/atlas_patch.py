"""Private authored anatomy additions, aligned to immutable BodyParts3D context.
No source FMA reassignment, consumer manifest edits, or clinical certification.
"""
import bpy,bmesh,json,hashlib,math
from pathlib import Path
from mathutils import Vector
from compare_baseline import studio,place

def digest(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.56
 return m

def mesh(name,verts,faces,mat):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);data.materials.append(mat)
 for p in data.polygons:p.use_smooth=True
 return o

def interpolate(table,t):
 for index,(a,b) in enumerate(zip(table,table[1:])):
  if a[0]<=t<=b[0]:
   f=(t-a[0])/(b[0]-a[0]);prev=table[max(0,index-1)];nxt=table[min(len(table)-1,index+2)];span=b[0]-a[0]
   result=[]
   for k in range(1,len(a)):
    m0=(b[k]-prev[k])/(b[0]-prev[0])*span;m1=(nxt[k]-a[k])/(nxt[0]-a[0])*span
    result.append((2*f**3-3*f*f+1)*a[k]+(f**3-2*f*f+f)*m0+(-2*f**3+3*f*f)*b[k]+(f**3-f*f)*m1)
   return result
 return table[0][1:] if t<table[0][0] else table[-1][1:]

def rectus(sign,mat,recipe):
 rings=40;sides=16;verts=[];faces=[];lo,hi=recipe['z_range_m']
 for i in range(rings+1):
  t=i/rings;z=lo+(hi-lo)*t;width,y,depth=interpolate(recipe['profile'],z)
  # Tendinous intersections modulate a continuous belly; no independent abs nodes.
  depression=max(math.exp(-((z-k)/.006)**2) for k in recipe['intersection_z_m'])
  depth*=1-.38*depression
  for j in range(sides):
   a=2*math.pi*j/sides
   verts.append((sign*(.003+width*.5+width*.5*math.cos(a)),y+depth*math.sin(a),z))
 for i in range(rings):
  for j in range(sides):
   k=i*sides+j;n=i*sides+(j+1)%sides;faces.append((k,n,n+sides,k+sides))
 faces.extend([tuple(reversed(range(sides))),tuple(rings*sides+j for j in range(sides))])
 return mesh('AG2_authored_rectus_abdominis_'+('L' if sign>0 else 'R'),verts,faces,mat)

def latissimus(sign,mat,recipe):
 nz=28;nx=16;verts=[];faces=[];lo,hi=recipe['z_range_m']
 for side in [-1,1]:
  for i in range(nz+1):
   t=i/nz;z=lo+(hi-lo)*t;xi,xo,yi,yo=interpolate(recipe['profile'],z)
   for j in range(nx+1):
    u=j/nx;x=xi+(xo-xi)*u
    y=yi+(yo-yi)*u+.008*math.sin(math.pi*u)
    thickness=.0018+.0042*math.sin(math.pi*u)*math.sin(math.pi*t)
    # Inferomedial fascial border ascends laterally toward iliac crest.
    edge_rise=recipe.get('inferior_lateral_rise_m',0)*u*(1-t)**2
    verts.append((sign*x,y+side*thickness,z+edge_rise))
 sheet=(nz+1)*(nx+1)
 for side in [0,1]:
  for i in range(nz):
   for j in range(nx):
    k=side*sheet+i*(nx+1)+j;face=(k,k+1,k+nx+2,k+nx+1);faces.append(face if side else tuple(reversed(face)))
 boundary=list(range(nx+1))+[i*(nx+1)+nx for i in range(1,nz+1)]+[nz*(nx+1)+j for j in reversed(range(nx))]+[i*(nx+1) for i in reversed(range(1,nz))]
 for a,b in zip(boundary,boundary[1:]+boundary[:1]):faces.append((a,b,b+sheet,a+sheet))
 return mesh('AG2_authored_latissimus_dorsi_'+('L' if sign>0 else 'R'),verts,faces,mat)

def run(config,output):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 manifest=json.loads(Path(config['context_source']).read_text());base=Path(config['context_source']).parent
 context=[];gray=material('BodyParts3D original context',(.38,.42,.43));bone=material('BodyParts3D original bone',(.64,.61,.53))
 for row in manifest['elements']:
  path=base/row['file'];assert digest(path)==row['sha256']
  verts=[];faces=[]
  for line in path.read_text().splitlines():
   q=line.split()
   if not q:continue
   if q[0]=='v':verts.append(tuple(float(v)*.001 for v in q[1:4]))
   if q[0]=='f':faces.append(tuple(int(v.split('/')[0])-1 for v in q[1:]))
  o=mesh('BP3D_'+row['id'],verts,faces,bone if row['role']=='bone' else gray);o['source_element']=row['id'];o['source_sha256']=row['sha256'];context.append(o)
 red=material('Authored additions - review only',(.50,.105,.085));generated=[]
 for sign in [1,-1]:generated.extend([rectus(sign,red,config['rectus']),latissimus(sign,red,config['latissimus'])])
 stats={}
 for o in generated:
  o['provenance']='AG2 authored illustrative reconstruction; not an original BodyParts3D element';o['human_anatomy_review']='pending'
  o.data.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(o.data)
  stats[o.name]={'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'volume_m3':bm.calc_volume(signed=False),'bounds_blender_m':[[f(v.co[a] for v in o.data.vertices) for a in range(3)] for f in [min,max]]};bm.free()
  assert stats[o.name]['nonmanifold_edges']==0
 # Native glTF export uses Blender Z-up -> glTF Y-up = [x,z,-y], exactly the existing atlas transform.
 bpy.ops.object.select_all(action='DESELECT')
 for o in generated:o.select_set(True)
 glb=output/'authored-core-additions.glb'
 bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_extras=True,export_yup=True)
 assert glb.stat().st_size<config['addon_budget_bytes']
 scene=bpy.context.scene;camera=studio(scene);camera.data.sensor_fit='VERTICAL';scene.render.engine='BLENDER_EEVEE'
 scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
 views=[('front',(0,-3,1.14),(0,-.10,1.1),.70),('rear',(0,3,1.16),(0,-.03,1.13),.68),('oblique',(2,-3,1.30),(0,-.10,1.13),.72)]
 for label,pos,target,scale in views:
  place(camera,pos,target,scale)
  for state in ['before','after']:
   for o in generated:o.hide_render=(state=='before')
   scene.render.filepath=str(output/(state+'-'+label+'.png'));bpy.ops.render.render(write_still=True)
 # Isolated additions expose authored boundaries and seams, independent of source occlusion.
 for o in context:o.hide_render=True
 for label,pos,target,scale in [views[0],views[1]]:
  place(camera,pos,target,scale);scene.render.filepath=str(output/('isolated-'+label+'.png'));bpy.ops.render.render(write_still=True)
 for o in context:o.hide_render=False
 for o in generated:o.hide_render=False
 place(camera,views[0][1],views[0][2],views[0][3])
 bpy.ops.wm.save_as_mainfile(filepath=str(output/'atlas-core.blend'))
 report={'identity':config['id'],'authored':stats,'glb_bytes':glb.stat().st_size,'glb_sha256':digest(glb),'context_source':manifest,'coordinates':{'input':'BodyParts3D millimeter Z-up','master':'meter Z-up, original origin','glb':'meter Y-up [x,z,-y], no recenter/rescale'},'human_reviews':{'visual':'pending','anatomical':'pending'},'limits':['Illustrative authored reconstruction anchored to source bones, not recovered missing source anatomy.','Tendinous segmentation remains within each continuous rectus mesh.','Latissimus insertion routing and fascial thickness require specialist review; no biomechanical simulation.','Existing lateral/core/triceps meshes included as unmodified context; not claimed refined by this addition.']}
 (output/'atlas-report.json').write_text(json.dumps(report,indent=2))
 return {'generated_meshes':len(generated),'glb_bytes':glb.stat().st_size,'stats':stats,'rendered_photos':8,'human_reviews':'pending'}
