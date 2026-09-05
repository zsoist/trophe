import os
import bpy, json, hashlib, datetime
from pathlib import Path
from mathutils import Matrix
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
out = root / 'factory-work/evidence/visual-02/elbow-calibrated-reference-01'
out.mkdir(exist_ok=False)
source = root / 'factory-work/evidence/visual-02/refine-v3-02/curl.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
s = bpy.context.scene
r = bpy.data.objects['Athlete01_ExportRig']
s.frame_set(1)
bpy.context.view_layer.update()
initial = {b.name: b.matrix.copy() for b in r.pose.bones}
rest_original = {b.name: [list(row) for row in b.matrix_local] for b in r.data.bones}
objects = []
initial_vertices = {}
weight_hashes = {}

def whash(o):
    return hashlib.sha256(json.dumps([[(o.vertex_groups[g.group].name, g.weight) for g in v.groups] for v in o.data.vertices], separators=(',', ':')).encode()).hexdigest()
for o in list(bpy.data.objects):
    arms = [m for m in o.modifiers if m.type == 'ARMATURE' and m.object == r] if o.type == 'MESH' else []
    if not arms:
        continue
    settings = [(m, m.show_viewport) for m in o.modifiers]
    for m in o.modifiers:
        if m not in arms:
            m.show_viewport = False
    bpy.context.view_layer.update()
    eo = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = eo.to_mesh()
    assert len(me.vertices) == len(o.data.vertices)
    coords = [v.co.copy() for v in me.vertices]
    eo.to_mesh_clear()
    initial_vertices[o.name] = coords
    weight_hashes[o.name] = whash(o)
    for m, state in settings:
        m.show_viewport = state
    o.shape_key_clear()
    for v, p in zip(o.data.vertices, coords):
        v.co = p
    o.data.update()
    objects.append(o)
proxy = bpy.data.objects.new('Athlete01_Frame1Reference', r.data.copy())
bpy.context.collection.objects.link(proxy)
proxy.matrix_world = r.matrix_world.copy()
bpy.ops.object.select_all(action='DESELECT')
proxy.select_set(True)
bpy.context.view_layer.objects.active = proxy
bpy.ops.object.mode_set(mode='EDIT')
for b in proxy.data.edit_bones:
    b.use_connect = False
for b in proxy.data.edit_bones:
    length = r.data.bones[b.name].length
    b.matrix = initial[b.name]
    b.length = length
bpy.ops.object.mode_set(mode='OBJECT')
for b in proxy.pose.bones:
    con = b.constraints.new('COPY_TRANSFORMS')
    con.target = r
    con.subtarget = b.name
    con.owner_space = 'WORLD'
    con.target_space = 'WORLD'
for o in objects:
    for m in o.modifiers:
        if m.type == 'ARMATURE' and m.object == r:
            m.object = proxy
    assert whash(o) == weight_hashes[o.name]
proxy.hide_render = True
proxy.display_type = 'WIRE'
s.frame_set(1)
bpy.context.view_layer.update()
errors = {}
for o in objects:
    settings = [(m, m.show_viewport) for m in o.modifiers]
    for m in o.modifiers:
        if m.type != 'ARMATURE':
            m.show_viewport = False
    bpy.context.view_layer.update()
    eo = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = eo.to_mesh()
    errors[o.name] = max(((v.co - p).length for v, p in zip(me.vertices, initial_vertices[o.name])))
    eo.to_mesh_clear()
    for m, state in settings:
        m.show_viewport = state
assert max(errors.values()) < 1e-05, errors
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'curl.blend'))
record = {'id': 'ELBOW_CALIBRATED_REFERENCE_01', 'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'hypothesis': 'Separate old bind-pose axial orientation from animated flexion by calibrating native DQ skinning to the exact evaluated frame1 surface. Existing authoring rig, full hand/prop transforms, topology and weights unchanged.', 'implementation': 'Copied deformation skeleton with same53 names/parent hierarchy, rest matrices=authoring pose matrices at frame1; COPY_TRANSFORMS from existing authoring rig; initial evaluated shape+skinning baked on copied source meshes; post-skin masks/subdivision/materials retained. No sculpt or weight repaint.', 'original_skeleton_rest': rest_original, 'frame1_reference_matrices': {n: [list(row) for row in m] for n, m in initial.items()}, 'frame1_skin_max_delta_m': errors, 'weight_sha256': weight_hashes, 'shape_keys': 'initial phenotype baked exactly; editable source shape keys remain in immutable base; no manual geometry adjustment', 'state': 'one experimental calibration; not adopted; temporal and wrist/contact QA pending', 'human_reviews': 'pending'}
(out / 'recipe.json').write_text(json.dumps(record, indent=2))
print('CALIBRATED_REFERENCE', errors)
