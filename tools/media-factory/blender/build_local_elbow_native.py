import os
import bpy, json, hashlib, datetime
from pathlib import Path
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
base = root / 'factory-work/evidence/visual-02'
out = base / 'elbow-local-native-01'
out.mkdir(exist_ok=False)
source = base / 'refine-v3-02/curl.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
s = bpy.context.scene
h = bpy.data.objects['Athlete01']
audit = json.loads((base / 'elbow-calibrated-reference-01/final-surface-audit.json').read_text())
adj = {v.index: set() for v in h.data.vertices}
for e in h.data.edges:
    a, b = e.vertices
    adj[a].add(b)
    adj[b].add(a)
visible = {v.index for v in h.data.vertices if any((h.vertex_groups[g.group].name == 'body' and g.weight > 0.5 for g in v.groups))}
regions = {}
group = h.vertex_groups.new(name='Elbow mapped intersection neighborhood')
allids = set()
for side in ['l', 'r']:
    core = {i for row in audit['samples'] if row['stage'] == 'base' and row['region'] == 'elbow_' + side for hit in row['intersections'] for t in hit['original_triangle_ids'] for i in t}
    allowed = {v.index for v in h.data.vertices if v.index in visible and sum((g.weight for g in v.groups if h.vertex_groups[g.group].name in ['upperarm_' + side, 'lowerarm_' + side])) > 0.99}
    assert core <= allowed
    rings = [core]
    seen = set(core)
    for _ in range(2):
        nxt = {j for i in rings[-1] for j in adj[i] if j in allowed} - seen
        rings.append(nxt)
        seen |= nxt
    for ids, w in zip(rings, [1.0, 2 / 3, 1 / 3]):
        if ids:
            group.add(sorted(ids), w, 'REPLACE')
    regions[side] = {'core_source': 'union of actual BASE final-evaluated self-intersection triangle source IDs over all181 frames', 'core_ids': sorted(core), 'feather_rings': [sorted(x) for x in rings[1:]], 'weights': [1.0, 2 / 3, 1 / 3]}
    allids |= seen
s.frame_set(1)
bpy.context.view_layer.update()
saved = [(m, m.show_viewport) for m in h.modifiers]
for m in h.modifiers:
    if m.type != 'ARMATURE':
        m.show_viewport = False
bpy.context.view_layer.update()
eh = h.evaluated_get(bpy.context.evaluated_depsgraph_get())
me = eh.to_mesh()
initial = [v.co.copy() for v in me.vertices]
eh.to_mesh_clear()
mod = h.modifiers.new('Local elbow native Corrective Smooth', 'CORRECTIVE_SMOOTH')
mod.vertex_group = group.name
mod.rest_source = 'BIND'
mod.smooth_type = 'LENGTH_WEIGHTED'
mod.use_pin_boundary = True
mod.use_only_smooth = False
settings = {'factor': mod.factor, 'iterations': mod.iterations, 'scale': mod.scale, 'smooth_type': mod.smooth_type, 'rest_source': mod.rest_source, 'use_pin_boundary': mod.use_pin_boundary, 'use_only_smooth': mod.use_only_smooth}
bpy.context.view_layer.objects.active = h
bpy.ops.object.select_all(action='DESELECT')
h.select_set(True)
with bpy.context.temp_override(object=h, active_object=h):
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=1)
    bpy.ops.object.correctivesmooth_bind(modifier=mod.name)
assert mod.is_bind
bpy.context.view_layer.update()
eh = h.evaluated_get(bpy.context.evaluated_depsgraph_get())
me = eh.to_mesh()
error = max(((v.co - p).length for v, p in zip(me.vertices, initial)))
outside = max(((me.vertices[i].co - initial[i]).length for i in range(len(initial)) if i not in allids))
eh.to_mesh_clear()
assert error < 1e-05, error
for m, state in saved:
    m.show_viewport = state
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'curl.blend'))
report = {'id': 'ELBOW_LOCAL_NATIVE_01', 'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'hypothesis': 'Local mixed-bone deformation folds neighboring skin rings into one another. Native rest-bound Corrective Smooth tests deformation-aware redistribution on measured intersection neighborhood, without a new solver, weight repaint, global orientation change or geometric displacement cap.', 'modifier_settings': settings, 'regions': regions, 'vertex_group': group.name, 'frame1_max_delta_m': error, 'frame1_outside_delta_m': outside, 'source_shape_keys_preserved': True, 'weights_changed': False, 'authoring_controls_changed': False, 'bound_at': 'base animated frame1 evaluated surface; original skeleton REST unchanged', 'status': 'single authorized local intervention; QA pending', 'human_reviews': 'pending'}
(out / 'recipe.json').write_text(json.dumps(report, indent=2))
print('LOCAL_NATIVE_BOUND', settings, 'REGIONS', [(k, len(v['core_ids']), list(map(len, v['feather_rings']))) for k, v in regions.items()], 'FRAME1', error, flush=True)
