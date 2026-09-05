import os
import bpy, json, numpy as np, hashlib
from pathlib import Path
from mathutils import Vector
root = Path(os.environ['TROPHE_PROGRAM_ROOT'])
out = root / 'factory-work/evidence/visual-02/elbow-calibrated-reference-01'
audit = json.loads((out / 'final-surface-audit.json').read_text())
qa = json.loads((out / 'temporal-qa.json').read_text())
coords = np.load(out / 'evaluated-skin-181.npz')
records = []
for stage, folder in [('base', 'refine-v3-02'), ('calibrated', 'elbow-calibrated-reference-01')]:
    bpy.ops.wm.open_mainfile(filepath=str(root / 'factory-work/evidence/visual-02' / folder / 'curl.blend'))
    s = bpy.context.scene
    s.frame_set(73)
    bpy.context.view_layer.update()
    joint = bpy.data.objects['Athlete01_ExportRig'].pose.bones['lowerarm_l'].head.copy()
    s.camera.location = joint + Vector((2, -0.3, 0.1))
    s.camera.rotation_euler = (joint - s.camera.location).to_track_quat('-Z', 'Y').to_euler()
    s.camera.data.ortho_scale = 0.3
    normal = (joint - s.camera.location).normalized()
    plane = s.camera.location + normal * 0.5

    def project(p):
        p = Vector(p)
        return p + normal * (plane - p).dot(normal)

    def lines(name, color, segments):
        cu = bpy.data.curves.new(name, 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = 0.00045
        for a, b in segments:
            sp = cu.splines.new('POLY')
            sp.points.add(1)
            for v, p in zip(sp.points, [a, b]):
                v.co = (*project(p), 1)
        ob = bpy.data.objects.new(name, cu)
        bpy.context.collection.objects.link(ob)
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        em = nodes.new('ShaderNodeEmission')
        em.inputs[0].default_value = (*color, 1)
        end = nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(em.outputs[0], end.inputs[0])
        cu.materials.append(mat)
    row = next((x for x in audit['samples'] if x['stage'] == stage and x['region'] == 'elbow_l' and (x['frame'] == 73)))
    segments = []
    for hit in row['intersections']:
        ps = hit['points_m']
        if len(ps) > 1:
            a, b = max(((a, b) for a in ps for b in ps), key=lambda x: (Vector(x[0]) - Vector(x[1])).length)
            segments.append((a, b))
    lines('Evaluated intersection segments', (1, 0.04, 0.01), segments)
    edge = next((x for x in qa['stages'][stage]['samples'] if x['region'] == 'elbow_l' and x['frame'] == 73))['ratio_common_frame1']['min_edge']
    lines('Minimum ratio edge', (0.02, 0.2, 1), [(coords[stage][72, edge[0]], coords[stage][72, edge[1]])])
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
    name = stage + '-localized-073.png'
    s.render.filepath = str(out / name)
    bpy.ops.render.render(write_still=True)
    records.append({'path': name, 'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest(), 'stage': stage, 'frame': 73, 'red': 'Actual final-evaluated triangle intersection segments projected onto camera plane, including hidden segments; not skin material.', 'blue': 'Minimum common-base ratio edge projected onto camera plane', 'actual_final_triangle_pairs': row['intersection_pair_count'], 'minimum_edge_ids': edge})
(out / 'localized-images.json').write_text(json.dumps(records, indent=2))
print('LOCALIZED_IMAGES_COMPLETE')
