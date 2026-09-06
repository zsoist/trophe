"""Bounded, parameterized R2 Blender jobs. Private masters never enter Git."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import sys
import time
import bpy


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2), encoding='utf-8')


def build_character(config, output):
    import addon_utils
    addon_utils.enable('rigify', default_set=True, persistent=False)
    addon_utils.enable('bl_ext.user_default.mpfb', default_set=True, persistent=False)
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    from bl_ext.user_default.mpfb.services.targetservice import TargetService
    from bl_ext.user_default.mpfb.services.rigservice import RigService
    from bl_ext.user_default.mpfb.services.locationservice import LocationService
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    macros = TargetService.get_default_macro_info_dict()
    macros.update(config['character']['macros'])
    body = HumanService.create_human(macro_detail_dict=macros)
    body.name = 'Trophe_R2_Athlete'
    source_body = None
    if config.get('preserve_source_form'):
        with bpy.data.libraries.load(config['material_source'], link=False) as (available, requested):
            requested.objects = ['Athlete01', 'SportsTank', 'SportsShorts'] + (['Athlete01.shoes01', 'Athlete01.low-poly'] if config.get('preserve_presentation') else [])
        source_body = requested.objects[0]
        assert len(source_body.data.vertices) == len(body.data.vertices)
        def surface_coords(obj):
            keys = obj.data.shape_keys.key_blocks
            coords = [v.co.copy() for v in keys[0].data]
            for key in list(keys)[1:]:
                for i, v in enumerate(key.data):
                    coords[i] += (v.co - key.relative_key.data[i].co) * key.value
            return coords
        fresh = surface_coords(body)
        old_basis = source_body.data.shape_keys.key_blocks[0]
        correspondence_error = max((v - old_basis.data[i].co).length for i, v in enumerate(fresh))
        assert correspondence_error < 0.00001, correspondence_error
        for old_key in list(source_body.data.shape_keys.key_blocks)[1:]:
            key = body.shape_key_add(name='Preserved R1: ' + old_key.name)
            key.value = old_key.value
            for i, v in enumerate(key.data):
                v.co = key.relative_key.data[i].co + old_key.data[i].co - old_key.relative_key.data[i].co
        body['source_form_max_initial_correspondence_m'] = correspondence_error
        body['source_form_sha256'] = digest(config['material_source'])
        bpy.context.view_layer.update()
    meta = HumanService.add_builtin_rig(body, config['character']['rig'], import_weights=True)
    assert meta is not None
    user_data = Path(LocationService.get_user_data())
    assets = []
    for role, rel in config['character'].get('core_assets', {}).items():
        path = user_data / rel
        assert path.is_file(), path
        obj = HumanService.add_mhclo_asset(str(path), body, asset_type=role, subdiv_levels=0)
        assets.append({'role': role, 'object': obj.name, 'path': str(path), 'sha256': digest(path)})
    # This is MPFB's supported generation helper, including its asset adjustment pass.
    rig = RigService.generate_rigify_rig(meta, name='Trophe_R2_Authoring', meta_rig_action='hide')
    assert rig is not None
    if source_body:
        # Transfer in the initial unposed surface; helpers are excluded from the nearest-face donor.
        donor = body.copy()
        donor.data = body.data.copy()
        bpy.context.collection.objects.link(donor)
        for m in list(donor.modifiers):
            donor.modifiers.remove(m)
        import bmesh
        visible = body.vertex_groups['body'].index
        bm = bmesh.new(); bm.from_mesh(donor.data)
        layer = bm.verts.layers.deform.active
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[layer].get(visible, 0) < .5], context='VERTS')
        bm.to_mesh(donor.data); bm.free()
        for garment in (requested.objects[1:4] if config.get('preserve_presentation') else requested.objects[1:]):
            bpy.context.collection.objects.link(garment)
            garment.parent = None
            garment.vertex_groups.clear()
            for mod in list(garment.modifiers):
                if mod.type == 'ARMATURE': garment.modifiers.remove(mod)
            bpy.ops.object.select_all(action='DESELECT')
            garment.select_set(True); bpy.context.view_layer.objects.active = garment
            transfer = garment.modifiers.new('Supplied body weights to fitted garment', 'DATA_TRANSFER')
            transfer.object = donor; transfer.use_vert_data = True
            transfer.data_types_verts = {'VGROUP_WEIGHTS'}; transfer.vert_mapping = 'POLYINTERP_NEAREST'
            bpy.ops.object.datalayout_transfer(modifier=transfer.name)
            bpy.ops.object.modifier_apply(modifier=transfer.name)
            arm = garment.modifiers.new('Supported body rig', 'ARMATURE'); arm.object = rig
            bpy.ops.object.modifier_move_up(modifier=arm.name)
            bpy.ops.object.modifier_move_up(modifier=arm.name)
            for poly in garment.data.polygons: poly.use_smooth = True
        bpy.data.objects.remove(donor, do_unlink=True)
        # Transfer the exact garment coverage selection, preserving legs and helper masking.
        coverage_old = source_body.vertex_groups.get('CoveredBySportswear')
        coverage = body.vertex_groups.new(name='CoveredBySportswear')
        ids = [v.index for v in source_body.data.vertices if any(g.group == coverage_old.index and g.weight > .5 for g in v.groups)]
        coverage.add(ids, 1, 'REPLACE')
        mask = body.modifiers.new('Sportswear coverage only', 'MASK')
        mask.vertex_group = coverage.name; mask.invert_vertex_group = True
        if config.get('preserve_presentation'):
            shoe = requested.objects[3]; shoe.name = 'Trophe_R2_Trainers'
            old_eye = requested.objects[4]
            eye = bpy.data.objects[next(a['object'] for a in assets if a['role']=='Eyes')]
            eye.data.materials.clear()
            for mat in old_eye.data.materials: eye.data.materials.append(mat)
            bpy.data.objects.remove(old_eye, do_unlink=True)
            original = source_body.vertex_groups['TrainerCoverage']
            foot = body.vertex_groups.new(name='TrainerCoverage')
            ids = [v.index for v in source_body.data.vertices if any(g.group==original.index and g.weight>.5 for g in v.groups)]
            foot.add(ids,1,'REPLACE')
            mask = body.modifiers.new('Trainer foot coverage','MASK');mask.vertex_group=foot.name;mask.invert_vertex_group=True
        bpy.data.objects.remove(source_body, do_unlink=True)
    assert any(m.type == 'ARMATURE' and m.object == rig for m in body.modifiers)
    assert len([b for b in rig.data.bones if b.use_deform]) > 50
    material_source = config.get('material_source')
    if material_source:
        with bpy.data.libraries.load(material_source, link=False) as (available, requested):
            requested.materials = [name for name in available.materials if name == 'Skin - warm medium controlled']
        if requested.materials:
            body.data.materials.clear()
            body.data.materials.append(requested.materials[0])
    if not body.data.materials:
        mat = bpy.data.materials.new('R2 neutral skin')
        mat.use_nodes = True
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.27, .135, .095, 1)
        mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .62
        body.data.materials.append(mat)
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for face in obj.data.polygons:
                face.use_smooth = True
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    data_dir = Path(LocationService.get_mpfb_data('rigs')) / 'rigify'
    rig_files = [{'path': str(p), 'sha256': digest(p)} for p in sorted(data_dir.glob('*.json')) if 'human' in p.name]
    deform_names = {b.name for b in rig.data.bones if b.use_deform}
    weighted = sum(any(body.vertex_groups[g.group].name in deform_names and g.weight > 0 for g in v.groups) for v in body.data.vertices)
    assert weighted > 10000, weighted
    record = {'body': body.name, 'rig': rig.name, 'meta_rig': meta.name, 'vertices': len(body.data.vertices), 'weighted_vertices': weighted,
              'source_form': {k: body[k] for k in body.keys() if k.startswith('source_form')}, 'modifiers': [{'name':m.name,'type':m.type,'preserve_volume':m.use_deform_preserve_volume if m.type=='ARMATURE' else None} for m in body.modifiers], 'shape_keys': [k.name for k in body.data.shape_keys.key_blocks], 'core_assets': assets, 'supplied_rig_sources': rig_files,
              'import_weights': True, 'generation_method': 'MPFB HumanService.add_builtin_rig + RigService.generate_rigify_rig (includes adjust_children_for_rigify)',
              'preset': config['character'], 'macros_full': macros,
              'bones': {b.name: {'head': list(b.head_local), 'tail': list(b.tail_local), 'deform': b.use_deform} for b in rig.data.bones},
              'controls_properties': {b.name: {key: b[key] for key in b.keys() if isinstance(b[key], (str, int, float, bool))} for b in rig.pose.bones if b.keys()},
              'reviews': {'technical_scene': 'pending pose comparison', 'visual_human': 'pending', 'technique_human': 'pending'}}
    write_json(output / 'character-preset.json', record)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'character.blend'))
    return {'character_sha256': digest(output / 'character.blend'), 'vertices': len(body.data.vertices), 'weighted_vertices': weighted}


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('config')
    parsed = parser.parse_args(args)
    cfg_path = Path(parsed.config).resolve(strict=True)
    config = json.loads(cfg_path.read_text(encoding='utf-8-sig'))
    output = cfg_path.parent / 'output'
    output.mkdir(exist_ok=False)
    start = time.monotonic()
    sys.path.insert(0, str(Path(__file__).parent))
    import compare_baseline
    import playback_qa
    import render_media
    import localize_contact
    import contact_fit
    import shirt_clearance
    import garment_binding
    import garment_pattern
    import cohort
    import arnold
    import arnold_refine
    import triceps
    import bench_qa
    import export_unreal
    dispatch = {'build_character': build_character, 'compare_baseline': compare_baseline.run, 'playback_qa': playback_qa.run, 'render_media': render_media.run, 'localize_contact': localize_contact.run, 'contact_fit': contact_fit.run, 'shirt_clearance': shirt_clearance.run, 'garment_binding': garment_binding.run, 'garment_pattern': garment_pattern.run}
    dispatch['cohort']=cohort.run
    dispatch['bench_qa']=bench_qa.run
    dispatch['arnold']=arnold.run
    dispatch['arnold_inspect']=arnold_refine.inspect
    dispatch['arnold_refine']=arnold_refine.revise
    dispatch['arnold_anatomy']=arnold_refine.anatomy
    dispatch['triceps_inspect']=triceps.inspect
    dispatch['triceps']=triceps.run
    dispatch['triceps_qa']=triceps.qa
    dispatch['coverage_finish']=garment_pattern.finish_coverage
    dispatch['coverage_check']=garment_pattern.check_coverage
    dispatch['coverage_regression']=garment_pattern.coverage_regression
    dispatch['export_unreal']=export_unreal.run
    result = dispatch[config['stage']](config, output)
    write_json(output / 'result.json', {'job_id': config['id'], 'stage': config['stage'], 'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'elapsed_seconds': time.monotonic() - start, 'blender': bpy.app.version_string, 'blender_build': bpy.app.build_hash.decode(),
        'recipe_sha256': digest(__file__), 'recipe_modules': {p.name: digest(p) for p in Path(__file__).parent.glob('*.py')}, 'source_hashes': {k: digest(v) for k,v in config.items() if k.endswith('_source') and isinstance(v,str)}, 'config_sha256': digest(cfg_path), 'result': result, 'script_terminal': 0})
    print('R2_JOB_COMPLETE', config['id'], flush=True)


if __name__ == '__main__':
    main()
