import os
import bpy, json, hashlib, time
from pathlib import Path
from mathutils import Vector
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
base = root / 'factory-work/evidence/visual-02'
out = base / 'elbow-local-native-01'
items = []
start = time.monotonic()
for stage, folder in [('local_native', 'elbow-local-native-01')]:
    bpy.ops.wm.open_mainfile(filepath=str(base / folder / 'curl.blend'))
    s = bpy.context.scene
    r = bpy.data.objects['Athlete01_ExportRig']
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 12
    s.cycles.use_denoising = True
    s.render.threads_mode = 'FIXED'
    s.render.threads = 2
    s.render.resolution_percentage = 100
    s.render.image_settings.media_type = 'IMAGE'
    s.render.image_settings.file_format = 'PNG'
    for view, frames in [('close', [46, 73, 97]), ('arm', [1, 46, 73, 97])]:
        for f in frames:
            s.frame_set(f)
            bpy.context.view_layer.update()
            if view == 'close':
                target = r.pose.bones['lowerarm_l'].head.copy()
                s.camera.location = target + Vector((2, -0.3, 0.1))
                s.camera.data.ortho_scale = 0.3
                s.render.resolution_x = 480
                s.render.resolution_y = 480
            else:
                target = Vector((0, -0.12, 1.15))
                s.camera.location = (3, -0.1, 1.25)
                s.camera.data.ortho_scale = 1.18
                s.render.resolution_x = 384
                s.render.resolution_y = 480
            s.camera.rotation_euler = (target - s.camera.location).to_track_quat('-Z', 'Y').to_euler()
            name = f'{stage}-{view}-{f:03}.png'
            s.render.filepath = str(out / name)
            bpy.ops.render.render(write_still=True)
            items.append({'path': name, 'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest(), 'stage': stage, 'frame': f, 'pts_seconds': (f - 1) / 30, 'evidence_type': 'native_scene_render', 'camera_world_matrix': [list(row) for row in s.camera.matrix_world], 'ortho_scale': s.camera.data.ortho_scale, 'exposure': s.view_settings.look, 'source_sha256': hashlib.sha256((base / folder / 'curl.blend').read_bytes()).hexdigest()})
            print('STILL_DONE', name, flush=True)
(out / 'stills.json').write_text(json.dumps({'images': items, 'backend': 'Blender5.2.1 Cycles CPU2threads12samples', 'elapsed_seconds': time.monotonic() - start, 'terminal': 0}, indent=2))
import shutil
old = root / 'factory-work/evidence/visual-02/elbow-calibrated-reference-01'
for x in json.loads((old / 'stills.json').read_text())['images']:
    if x['stage'] == 'base':
        shutil.copy2(old / x['path'], out / x['path'])
        x['reuse_provenance'] = 'Exact prior native base render, same immutable master/frame/camera/light/backend/sample settings'
        items.append(x)
(out / 'stills.json').write_text(json.dumps({'images': items, 'backend': 'Blender5.2.1 Cycles CPU2threads12samples', 'terminal': 0}, indent=2))
