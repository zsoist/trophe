import os,bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(os.environ['TROPHE_PROGRAM_ROOT']);out=root/'factory-work/evidence/visual-02/forearm-twist-trial-01';out.mkdir(exist_ok=False);source=root/'factory-work/evidence/visual-02/refine-v3-02/curl.blend';bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;r=bpy.data.objects['Athlete01_ExportRig'];h=bpy.data.objects['Athlete01'];s.frame_set(1)
bpy.ops.object.select_all(action='DESELECT');r.select_set(True);bpy.context.view_layer.objects.active=r;bpy.ops.object.mode_set(mode='EDIT')
for side in ['l','r']:
 old=r.data.edit_bones['lowerarm_'+side];b=r.data.edit_bones.new('lowerarm_proximal_'+side);b.head=old.head;b.tail=old.tail;b.roll=old.roll;b.parent=old.parent;b.use_deform=True
bpy.ops.object.mode_set(mode='OBJECT');controls={}
for side in ['l','r']:
 o=bpy.data.objects.new('CTRL_forearm_proximal_'+side,None);bpy.context.collection.objects.link(o);o.rotation_mode='QUATERNION';controls[side]=o;con=r.pose.bones['lowerarm_proximal_'+side].constraints.new('COPY_TRANSFORMS');con.target=o;con.owner_space='WORLD';con.target_space='WORLD'
for f in range(1,182):
 s.frame_set(f);bpy.context.view_layer.update()
 for side in ['l','r']:
  upper=r.pose.bones['upperarm_'+side];fore=r.pose.bones['lowerarm_'+side];deform=upper.matrix@upper.bone.matrix_local.inverted();axis=(deform.to_3x3()@(fore.bone.tail_local-fore.bone.head_local)).normalized();direction=(fore.tail-fore.head).normalized();swing=axis.rotation_difference(direction);q=swing@deform.to_quaternion()@fore.bone.matrix_local.to_quaternion();o=controls[side];o.matrix_world=r.matrix_world@(Matrix.Translation(fore.head)@q.to_matrix().to_4x4());o.keyframe_insert('location',frame=f);o.keyframe_insert('rotation_quaternion',frame=f)
changed={}
for obj in bpy.data.objects:
 if obj.type!='MESH' or not any(m.type=='ARMATURE' and m.object==r for m in obj.modifiers):continue
 for side in ['l','r']:
  old=obj.vertex_groups.get('lowerarm_'+side)
  if not old:continue
  bone=r.data.bones['lowerarm_'+side];axis=bone.tail_local-bone.head_local;new=obj.vertex_groups.new(name='lowerarm_proximal_'+side);count=0
  for v in obj.data.vertices:
   w=next((g.weight for g in v.groups if g.group==old.index),0)
   if w<=0:continue
   co=r.matrix_world.inverted()@obj.matrix_world@v.co;t=(co-bone.head_local).dot(axis)/axis.length_squared;x=max(0,min(1,(t-.12)/.63));distal=x*x*(3-2*x)
   if distal<1:old.add([v.index],w*distal,'REPLACE');new.add([v.index],w*(1-distal),'REPLACE');count+=1
  changed[obj.name+'-'+side]=count
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'curl.blend'));(out/'recipe.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'hypothesis':'Supination concentrated in whole lowerarm deformation causes excessive axial mismatch at elbow. Add proximal swing-only deformation and blend toward existing supinated lowerarm over distal length.','new_deform_bones':['lowerarm_proximal_l','lowerarm_proximal_r'],'changed_vertex_counts':changed,'existing_hand_controls_changed':False,'exercise_amplitude_changed':False,'pose_correctives_adopted':False,'status':'experimental; geometric and visual QA pending'},indent=2));print('TWIST_TRIAL_CREATED',changed)
