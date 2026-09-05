import os
import bpy,pathlib,math,json
from mathutils import Vector,Matrix
root=pathlib.Path(os.environ['TROPHE_FACTORY_ROOT']).resolve(strict=True);out=root/'curl-draft-02';out.mkdir(exist_ok=False)
bpy.ops.wm.open_mainfile(filepath=str(root/'male-draft-01/athlete.blend'))
s=bpy.context.scene;r=bpy.data.objects['Athlete01_ExportRig'];h=bpy.data.objects['Athlete01']
r.animation_data_clear()
for b in r.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
def point_bone(name,direction):
 b=r.pose.bones[name];pos=b.head.copy();rest=b.bone.matrix_local.to_quaternion();q=(b.bone.tail_local-b.bone.head_local).rotation_difference(Vector(direction))
 b.matrix=Matrix.Translation(pos)@(q@rest).to_matrix().to_4x4();bpy.context.view_layer.update()
metal=bpy.data.materials.new('Dumbbell steel');metal.diffuse_color=(.08,.09,.1,1);metal.use_nodes=True;metal.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.7;metal.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.06,.07,.08,1)
props={}
for side in ['l','r']:
 bpy.ops.object.empty_add();e=bpy.context.object;e.name='Dumbbell_'+side;props[side]=e
 for x,rad,depth in [(0,.014,.20),(-.115,.065,.055),(.115,.065,.055)]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=rad,depth=depth,rotation=(0,math.pi/2,0));o=bpy.context.object;o.name='DumbbellPart';o.parent=e;o.location=(x,0,0);o.data.materials.append(metal)
  bev=o.modifiers.new('Soft machined edges','BEVEL');bev.width=.003;bev.segments=2
for frame in range(1,122):
 s.frame_set(frame);phase=(frame-1)/120;angle=.08+2.05*(1-math.cos(2*math.pi*phase))/2
 for side in ['l','r']:
  point_bone('upperarm_'+side,((.25 if side=='l' else -.25),0,-1))
  direction=Vector((0,-math.sin(angle),-math.cos(angle)))
  point_bone('lowerarm_'+side,direction)
  point_bone('hand_'+side,direction)
  for name in ['upperarm_'+side,'lowerarm_'+side,'hand_'+side]:
   b=r.pose.bones[name];b.rotation_mode='QUATERNION';b.keyframe_insert('rotation_quaternion',frame=frame)
  for digit in ['index','middle','ring','pinky']:
   for seg in ['01','02','03']:
    b=r.pose.bones[digit+'_'+seg+'_'+side];b.rotation_mode='XYZ';b.rotation_euler.x=1.1;b.keyframe_insert('rotation_euler',frame=frame)
  props[side].location=r.pose.bones['hand_'+side].head+direction*.06;props[side].keyframe_insert('location',frame=frame)
s.frame_start=1;s.frame_end=120;s.render.fps=30;s.render.resolution_x=640;s.render.resolution_y=360;s.camera.data.ortho_scale=3.9;s.cycles.samples=12
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
assert any(d.use and d.type=='OPTIX' for d in prefs.devices)
s.cycles.device='GPU'
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'curl.blend'))
for f in [1,31,61,91]:
 s.frame_set(f);s.render.filepath=str(out/('pose-%03d.png'%f));bpy.ops.render.render(write_still=True)
(out/'recipe.json').write_text(json.dumps({'exercise':'Standing Dumbbell Biceps Curl','equipment':'Dumbbell','fps':30,'duration_seconds':4,'frames':120,'loop_endpoint':121,'technique':'pending','visual':'pending'},indent=2))
print('CURL_DRAFT_POSES_PASS')
