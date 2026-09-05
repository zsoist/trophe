"""Native FBX export copy; keep the MPFB/Rigify authoring master unchanged."""
import bpy,json,hashlib
import numpy as np
from mathutils import Vector


def skin(obj):
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    ids=[a.value for a in mesh.attributes['diagnostic_source_id'].data]
    component=mesh.attributes.get('R2_component_id');p={}
    for i,v in enumerate(mesh.vertices):
        if component is None or component.data[i].value==1:p[ids[i]]=np.array(obj.matrix_world@v.co)
    ev.to_mesh_clear();return p


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene
    rig=bpy.data.objects['Trophe_R2_Authoring'];body=bpy.data.objects['Trophe_R2_Athlete'];original={}
    for frame in [1,37,73,115,181]:scene.frame_set(frame);bpy.context.view_layer.update();original[frame]=skin(body)
    scene.frame_set(1);bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
    # Visual bake only in this export copy. Native driver-based IK/FK remains in the source master.
    bpy.ops.nla.bake(frame_start=1,frame_end=181,step=1,only_selected=False,visual_keying=True,clear_constraints=True,clear_parents=False,use_current_action=False,clean_curves=False,bake_types={'POSE'})
    rig.data.pose_position='REST';bpy.context.view_layer.update();parts=[];material_values={}
    for obj in list(scene.objects):
        if obj.type!='MESH' or obj.hide_render or not (obj.name.startswith(('Trophe_R2','DumbbellPart')) or obj.name in {'SportsTank','SportsShorts'}):continue
        for mod in obj.modifiers:
            if mod.type=='ARMATURE':mod.show_viewport=False;mod.show_render=False
        bpy.context.view_layer.update();ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
        copy=obj.copy();copy.data=mesh;copy.name='Export_'+obj.name;scene.collection.objects.link(copy)
        world=obj.matrix_world.copy();copy.parent=None;copy.matrix_world=world
        for mod in list(copy.modifiers):copy.modifiers.remove(mod)
        attr=mesh.attributes.get('R2_component_id') or mesh.attributes.new('R2_component_id','INT','POINT')
        for value in attr.data:value.value=1 if obj==body else 2
        if obj.name.startswith('DumbbellPart'):
            side='L' if obj.matrix_world.translation.x>0 else 'R';group=copy.vertex_groups.new(name='DEF-hand.'+side);group.add(list(range(len(mesh.vertices))),1,'REPLACE')
        for mat in mesh.materials:
            if not mat:continue
            principled=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat.use_nodes else None
            material_values[mat.name]={'base_color':list(principled.inputs['Base Color'].default_value) if principled else list(mat.diffuse_color),'roughness':principled.inputs['Roughness'].default_value if principled else .5,'metallic':principled.inputs['Metallic'].default_value if principled else 0}
        parts.append(copy)
    assert len(parts)>=6
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in parts if o.name=='Export_Trophe_R2_Athlete')
    bpy.ops.object.join();combined=bpy.context.object;combined.name='Trophe_R2_Curl'
    mod=combined.modifiers.new('Export linear skinning','ARMATURE');mod.object=rig
    for obj in list(scene.objects):
        if obj not in {combined,rig}:bpy.data.objects.remove(obj,do_unlink=True)
    rig.data.pose_position='POSE';scene.frame_start=1;scene.frame_end=181;scene.render.fps=30
    differences=[]
    for frame,source in original.items():
        scene.frame_set(frame);bpy.context.view_layer.update();p=skin(combined)
        assert set(source)<=set(p)
        delta=np.array([np.linalg.norm(v-p[i]) for i,v in source.items()]);differences.append({'frame':frame,'vertices':len(source),'max_m':float(delta.max()),'p95_m':float(np.quantile(delta,.95))})
    scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(output/'export-copy.blend'))
    bpy.ops.object.select_all(action='DESELECT');combined.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    path=output/'Trophe_R2_Curl.fbx'
    bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'ARMATURE','MESH'},use_mesh_modifiers=True,mesh_smooth_type='FACE',use_armature_deform_only=True,add_leaf_bones=False,apply_unit_scale=True,axis_forward='-Y',axis_up='Z',bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,bake_anim_step=1,path_mode='COPY',embed_textures=True)
    assert path.stat().st_size>100000
    export={'method':'Native visual NLA bake and FBX export; one export mesh, deform-only skeleton, embedded available textures. Editable Rigify source remains separate.','frames':181,'fps':30,'unit':'metres in Blender; FBX unit conversion on import must be checked','fbx_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'fbx_bytes':path.stat().st_size,'native_vs_export_skin':differences,'limitation':'FBX/Unreal linear skinning cannot reproduce the two native MPFB armature modifiers/PV blend or B-Bone interpolation exactly; compare actual output before adoption.','materials':material_values}
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(path))
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert len(rigs)==1 and meshes and rigs[0].animation_data and rigs[0].animation_data.action
    bounds=[]
    for frame in [1,73,181]:
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();p=[]
        for obj in meshes:
            ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();p.extend([list(obj.matrix_world@v.co) for v in mesh.vertices]);ev.to_mesh_clear()
        p=np.array(p);bounds.append({'frame':frame,'min_m':p.min(axis=0).tolist(),'max_m':p.max(axis=0).tolist()})
    export['roundtrip']={'armatures':len(rigs),'bones':len(rigs[0].data.bones),'meshes':len(meshes),'animation_range':list(rigs[0].animation_data.action.frame_range),'bounds':bounds}
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'fbx-roundtrip.blend'))
    (output/'export.json').write_text(json.dumps(export,indent=2));return export
