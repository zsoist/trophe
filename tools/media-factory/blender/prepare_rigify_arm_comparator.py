import os
import bpy, bmesh, addon_utils, json, hashlib, datetime
from pathlib import Path
from mathutils import Vector
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
base = root / 'factory-work/evidence/visual-02'
out = base / 'elbow-rigify-comparator-01'
out.mkdir(exist_ok=False)
source = base / 'refine-v3-02/curl.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
addon_utils.enable('rigify', default_set=True, persistent=False)
from rigify.rigs.limbs.arm import create_sample
s = bpy.context.scene
h = bpy.data.objects['Athlete01']
old = bpy.data.objects['Athlete01_ExportRig']
names = ['upperarm_l', 'lowerarm_l', 'hand_l']
captured = {}
for f in range(1, 182):
    s.frame_set(f)
    bpy.context.view_layer.update()
    captured[f] = {n: old.matrix_world @ old.pose.bones[n].matrix for n in names}
s.frame_set(1)
bpy.context.view_layer.update()
allowed = {b.name for b in old.data.bones if b.name == 'upperarm_l' or any((p.name == 'upperarm_l' for p in b.parent_recursive))}
ids = {v.index for v in h.data.vertices if any((h.vertex_groups[g.group].name == 'body' and g.weight > 0.5 for g in v.groups)) and sum((g.weight for g in v.groups if h.vertex_groups[g.group].name in allowed)) > 0.99}
attr = h.data.attributes.new('diagnostic_source_id', 'INT', 'POINT')
for i, v in enumerate(attr.data):
    v.value = i
settings = [(m, m.show_viewport) for m in h.modifiers]
for m in h.modifiers:
    if m.type != 'ARMATURE':
        m.show_viewport = False
bpy.context.view_layer.update()
eh = h.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = bpy.data.meshes.new_from_object(eh, preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
deform_layer = bm.verts.layers.deform.active
if deform_layer:
    for v in bm.verts:
        v[deform_layer].clear()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in ids], context='VERTS')
bm.to_mesh(mesh)
bm.free()
fixture = bpy.data.objects.new('Rigify native arm comparison', mesh)
bpy.context.collection.objects.link(fixture)
fixture.matrix_world = h.matrix_world.copy()
for m, state in settings:
    m.show_viewport = state
keep = h.vertex_groups.new(name='Comparison body outside left arm')
keep.add(sorted(set(range(len(h.data.vertices))) - ids), 1, 'REPLACE')
mask = h.modifiers.new('Comparison replace left arm only', 'MASK')
mask.vertex_group = keep.name
meta = bpy.data.objects.new('Rigify native arm metarig', bpy.data.armatures.new('Rigify arm metarig'))
bpy.context.collection.objects.link(meta)
bpy.ops.object.select_all(action='DESELECT')
meta.select_set(True)
bpy.context.view_layer.objects.active = meta
sample = create_sample(meta)
for n, srcname in zip(['upper_arm.L', 'forearm.L', 'hand.L'], names):
    b = meta.data.edit_bones[n]
    b.use_connect = False
    b.head = captured[1][srcname].translation
    b.tail = captured[1][srcname] @ Vector((0, old.data.bones[srcname].length, 0))
    b.align_roll(captured[1][srcname].to_3x3() @ Vector((0, 0, 1)))
for n in ['forearm.L', 'hand.L']:
    meta.data.edit_bones[n].use_connect = True
bpy.ops.object.mode_set(mode='OBJECT')
coll = meta.data.collections.new('Arm controls')
coll.rigify_ui_row = 1
for b in meta.data.bones:
    coll.assign(b)
params = meta.pose.bones['upper_arm.L'].rigify_parameters
configuration = {'rig_type': 'limbs.arm', 'segments': params.segments, 'bbones': params.bbones, 'rotation_axis': params.rotation_axis}
bpy.ops.pose.rigify_generate()
rig = bpy.context.object
assert rig.type == 'ARMATURE' and rig != meta
rig.name = 'NativeRigifyArmComparator'
meta.hide_render = True
meta.hide_set(True)
for b in rig.pose.bones:
    if 'IK_FK' in b:
        b['IK_FK'] = 1.0
bpy.context.view_layer.update()
initial = {v.index: v.co.copy() for v in fixture.data.vertices}
fixture.vertex_groups.clear()
bpy.ops.object.select_all(action='DESELECT')
fixture.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
assert any((g.name.startswith('DEF-') for g in fixture.vertex_groups))
assert any((v.groups for v in fixture.data.vertices))
controls = ['upper_arm_fk.L', 'forearm_fk.L', 'hand_fk.L']
targets = {}
for control, oldname in zip(controls, names):
    assert control in rig.pose.bones
    rest = rig.matrix_world @ rig.data.bones[control].matrix_local
    offset = captured[1][oldname].inverted() @ rest
    ob = bpy.data.objects.new('Recorded target ' + control, None)
    bpy.context.collection.objects.link(ob)
    ob.rotation_mode = 'QUATERNION'
    targets[control] = ob
    prev = None
    for f in range(1, 182):
        matrix = captured[f][oldname] @ offset
        loc, q, scale = matrix.decompose()
        if prev is not None:
            q.make_compatible(prev)
        ob.location = loc
        ob.rotation_quaternion = q
        ob.scale = scale
        prev = q.copy()
        for p in ['location', 'rotation_quaternion', 'scale']:
            ob.keyframe_insert(data_path=p, frame=f)
    con = rig.pose.bones[control].constraints.new('COPY_TRANSFORMS')
    con.target = ob
    con.owner_space = 'WORLD'
    con.target_space = 'WORLD'
rows = []
for f in [1, 46, 73, 97, 181]:
    s.frame_set(f)
    bpy.context.view_layer.update()
    errors = {}
    for org, oldname in zip(['ORG-upper_arm.L', 'ORG-forearm.L', 'ORG-hand.L'], names):
        b = rig.pose.bones[org]
        target = captured[f][oldname]
        errors[oldname] = {'head_m': (rig.matrix_world @ b.head - target.translation).length, 'tail_m': (rig.matrix_world @ b.tail - target @ Vector((0, old.data.bones[oldname].length, 0))).length}
    rows.append({'frame': f, 'joint_errors': errors})
    assert max((v for e in errors.values() for v in e.values())) < 1e-05, (f, errors)
s.frame_set(1)
bpy.context.view_layer.update()
ev = fixture.evaluated_get(bpy.context.evaluated_depsgraph_get())
me = ev.to_mesh()
frame1delta = max(((v.co - initial[v.index]).length for v in me.vertices))
ev.to_mesh_clear()
assert frame1delta < 1e-05, frame1delta
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'comparison.blend'))
report = {'id': 'ELBOW_RIGIFY_COMPARATOR_01', 'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'configuration': configuration, 'configuration_source': 'Bundled Blender5.2.1 Rigify limbs.arm sample and generator; native automatic weights; no new solver or tuned corrective.', 'mesh': 'Exact BASE frame1 evaluated left arm/hand surface, isolated by original skin/deform-group IDs; original source IDs retained in diagnostic_source_id', 'initial_surface_delta_m': frame1delta, 'vertices': len(mesh.vertices), 'joint_checks': rows, 'retarget': 'FK world targets = original sampled bone world matrix × constant frame1 alignment offset. Same recorded trajectory; no amplitude reduction. Rigify implementation unmodified.', 'limitations': ['Comparator prepared, not a consumer candidate or adopted replacement.', 'Native automatic weights and generated B-Bone distribution differ together: this is a documented configuration comparison, not unique causal isolation of one weight parameter.', 'Critical joint poses and initial surface verified; mature configuration full-cycle surface/contact QA still required.'], 'status': 'prepared; no technique/visual approval', 'human_reviews': 'pending'}
(out / 'recipe.json').write_text(json.dumps(report, indent=2))
print('RIGIFY_COMPARISON_PREPARED', configuration, frame1delta)
s.render.engine = 'CYCLES'
s.cycles.device = 'CPU'
s.cycles.samples = 12
s.cycles.use_denoising = True
s.render.threads_mode = 'FIXED'
s.render.threads = 2
s.render.resolution_x = 480
s.render.resolution_y = 480
s.render.resolution_percentage = 100
s.render.image_settings.media_type = 'IMAGE'
s.render.image_settings.file_format = 'PNG'
for f in [46, 73, 97]:
    s.frame_set(f)
    bpy.context.view_layer.update()
    target = old.pose.bones['lowerarm_l'].head.copy()
    s.camera.location = target + Vector((2, -0.3, 0.1))
    s.camera.rotation_euler = (target - s.camera.location).to_track_quat('-Z', 'Y').to_euler()
    s.camera.data.ortho_scale = 0.3
    s.render.filepath = str(out / f'rigify-close-{f:03}.png')
    bpy.ops.render.render(write_still=True)
print('RIGIFY_COMPARATOR_STILLS_DONE')
