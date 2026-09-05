import os
import bpy, json, numpy as np, hashlib
from pathlib import Path
from mathutils import Vector
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
out = root / 'factory-work/evidence/visual-02/elbow-rigify-comparator-01'
bpy.ops.wm.open_mainfile(filepath=str(out / 'comparison.blend'))
s = bpy.context.scene
h = bpy.data.objects['Rigify native arm comparison']
ids = [v.value for v in h.data.attributes['diagnostic_source_id'].data]
p = np.load(root / 'factory-work/evidence/visual-02/elbow-local-native-01/evaluated-skin-181.npz')['base']
old = bpy.data.objects['Athlete01_ExportRig']
items = []
for m in list(h.modifiers):
    h.modifiers.remove(m)
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
    for v, i in zip(h.data.vertices, ids):
        v.co = p[f - 1, i]
    h.data.update()
    bpy.context.view_layer.update()
    target = old.pose.bones['lowerarm_l'].head.copy()
    s.camera.location = target + Vector((2, -0.3, 0.1))
    s.camera.rotation_euler = (target - s.camera.location).to_track_quat('-Z', 'Y').to_euler()
    s.camera.data.ortho_scale = 0.3
    name = f'base-same-isolation-{f:03}.png'
    s.render.filepath = str(out / name)
    bpy.ops.render.render(write_still=True)
    items.append({'path': name, 'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest(), 'frame': f, 'method': 'Exact cached immutable BASE evaluated coordinates, same1999 source IDs and polygon isolation boundary as prepared Rigify fixture, same camera/light. Not a new deformation trial.'})
(out / 'baseline-controls.json').write_text(json.dumps(items, indent=2))
print('MATCHED_ISOLATION_BASELINE_DONE')
