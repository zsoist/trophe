import os
import bpy,pathlib,zipfile,json,math,time
from mathutils import Vector
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
root=pathlib.Path(os.environ['TROPHE_FACTORY_ROOT']).resolve(strict=True);out=root/'male-draft-01';out.mkdir(exist_ok=False)
data=pathlib.Path(LocationService.get_user_data())
with zipfile.ZipFile(root/'makehuman_system_assets_cc0.zip') as z:
 for e in z.infolist():
  assert (data/e.filename).resolve().is_relative_to(data.resolve())
 z.extractall(data)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
macro=TargetService.get_default_macro_info_dict();macro.update(gender=1.0,age=0.4,muscle=0.7,weight=0.48,height=0.65)
h=HumanService.create_human(macro_detail_dict=macro);h.name='Athlete01'
r=HumanService.add_builtin_rig(h,'game_engine');r.name='Athlete01_ExportRig'
clothes=HumanService.add_mhclo_asset(str(data/'clothes/male_casualsuit06/male_casualsuit06.mhclo'),h,subdiv_levels=0)
shoes=HumanService.add_mhclo_asset(str(data/'clothes/shoes01/shoes01.mhclo'),h,subdiv_levels=0)
eyes=HumanService.add_mhclo_asset(str(data/'eyes/low-poly/low-poly.mhclo'),h,asset_type='Eyes',subdiv_levels=0)
def material(name,col,rough=.6):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;return m
skin=material('Warm neutral skin',(.43,.25,.16));fabric=material('Unbranded navy sportswear',(.028,.075,.12));shoe=material('Neutral trainers',(.09,.1,.12))
h.data.materials.clear();h.data.materials.append(skin)
for o,m in [(clothes,fabric),(shoes,shoe)]:
 o.data.materials.clear();o.data.materials.append(m)
for o in [h,clothes,shoes,eyes]:
 for p in o.data.polygons:p.use_smooth=True
# Offset clothing slightly and hide body below trousers, preserving source geometry.
for v in clothes.data.vertices: v.co += v.normal * .004
vg=h.vertex_groups.new(name='ExposedSkin')
vg.add([v.index for v in h.data.vertices if v.co.z>.94],1,'REPLACE')
mask=h.modifiers.new('Body under trousers','MASK');mask.vertex_group=vg.name
bpy.context.view_layer.update()
# Fixture demonstrates evaluated vertex movement rather than node-only animation.
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=120;scene.render.fps=30
for f,ang in [(1,0),(30,.7),(60,1.35),(90,.7),(120,0)]:
 for side in ['l','r']:
  b=r.pose.bones['lowerarm_'+side];b.rotation_mode='XYZ';b.rotation_euler[0]=ang;b.keyframe_insert(data_path='rotation_euler',frame=f)
scene.frame_set(1);dg=bpy.context.evaluated_depsgraph_get();v1=[v.co.copy() for v in h.evaluated_get(dg).data.vertices]
scene.frame_set(60);dg=bpy.context.evaluated_depsgraph_get();v2=[v.co.copy() for v in h.evaluated_get(dg).data.vertices]
max_delta=max((a-b).length for a,b in zip(v1,v2));assert max_delta>.01,max_delta
scene.frame_set(1)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='StudioFloor';floor.data.materials.append(material('Studio sand',(.16,.19,.20)))
def aim(obj,at):obj.rotation_euler=(Vector(at)-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.6,-4.7,2.0));cam=bpy.context.object;aim(cam,(0,0,.88));cam.data.type='ORTHO';cam.data.ortho_scale=2.2;scene.camera=cam
for loc,power,size in [((2,-3,4),700,4),((-3,-1,2),450,3),((0,3,3),850,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,1))
scene.world.color=(.2,.2,.2);scene.render.engine='CYCLES';prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.cycles.samples=16
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.filepath=str(out/'body.png');scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'athlete.blend'))
bpy.ops.render.render(write_still=True)
(out/'fixture.json').write_text(json.dumps({'vertices':len(h.data.vertices),'bones':len(r.data.bones),'max_evaluated_vertex_delta_m':max_delta,'clothing':clothes.name,'shoes':shoes.name,'eyes':eyes.name,'technique':'pending','visual':'pending'},indent=2))
print('DRESSED_BODY_PASS',max_delta)
