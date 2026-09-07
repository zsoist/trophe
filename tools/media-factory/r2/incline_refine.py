"""Reference-led incline press revision; motion and textile changes remain separable."""
import bpy,json,math
import numpy as np
from mathutils import Matrix,Vector,Quaternion
from incline import ease
from cohort import key
from playback_qa import points


def motion(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;r=bpy.data.objects['Trophe_R2_Authoring'];b=bpy.data.objects['Trophe_R2_Athlete']
    s.frame_set(100);bpy.context.view_layer.update();anchors={};targets={};orientations={};lengths={};shoulders={}
    for side,sign in [('L',1),('R',-1)]:
        a=bpy.data.objects['Incline dumbbell '+side];target=bpy.data.objects['Incline wrist target '+side];anchors[side]=a;targets[side]=target
        head=lambda n:r.matrix_world@r.pose.bones[n+'.'+side].head
        sh=head('ORG-upper_arm');e=head('ORG-forearm');w=head('ORG-hand');shoulders[side]=sh.copy();lengths[side]=((e-sh).length,(w-e).length)
        old=a.matrix_world.to_quaternion();shaft=old@Vector((1,0,0));orientations[side]=(shaft.rotation_difference(Vector((1,0,0)))@old).to_matrix().to_4x4()
        a.animation_data.action=None
    r.animation_data.action=None
    # Preserve calibrated native forearm constraints, grip/hand relation and skin.
    for obj in s.objects:
        if obj.name.startswith('Incline weight head'):
            obj.scale.x=obj.scale.y=config.get('disc_radius_m',.085)/.065
        if obj.name.startswith('Incline weight'):
            for mat in obj.data.materials:
                if mat.use_nodes:
                    p=mat.node_tree.nodes.get('Principled BSDF')
                    if p and 'rubber' in mat.name.lower():p.inputs['Roughness'].default_value=.37
    rows=[];initial=None;previous=None
    for f in range(1,182):
        s.frame_set(f);t=(f-1)/180
        # Three seconds descent,0.2s controlled reversal,2.5s ascent,0.3s reset.
        q=ease(t/.50) if t<=.50 else (1. if t<=.5333333333 else (1-ease((t-.5333333333)/.4166666667) if t<=.95 else 0.))
        for side,sign in [('L',1),('R',-1)]:
            upper,fore=lengths[side];sh=shoulders[side]
            top=Vector((sign*.025,.025,math.sqrt(upper*upper-.025**2-.025**2))).normalized()
            bottom=(Vector((sign*math.sin(math.pi/4),-math.cos(math.pi/4)*math.cos(math.pi/6),-math.cos(math.pi/4)*math.sin(math.pi/6)))-Vector((0,-.5,.8660254))*config.get('bottom_extension',.12)).normalized()
            direction=Quaternion().slerp(top.rotation_difference(bottom),q)@top
            elbow=sh+direction*upper;wrist=elbow+Vector((0,0,fore))
            orientation=orientations[side];offset=(orientation@targets[side].matrix_basis).translation
            a=anchors[side];a.matrix_world=Matrix.Translation(wrist-offset)@orientation
            for prop in ['location','rotation_quaternion','scale']:a.keyframe_insert(prop,frame=f)
            mid=(sh+wrist)/2;pb=r.pose.bones['upper_arm_ik_target.'+side];pb.matrix.translation=r.matrix_world.inverted()@(mid+4*(elbow-mid));key(pb,f)
        bpy.context.view_layer.update();p=points(b)
        if initial is None:initial=p.copy()
        row={'frame':f,'descent':q,'surface_step_m':float(np.linalg.norm(p-previous,axis=1).max()) if previous is not None else 0,'sides':{}};previous=p.copy()
        for side in ['L','R']:
            head=lambda n:r.matrix_world@r.pose.bones[n+'.'+side].head
            sh=head('ORG-upper_arm');e=head('ORG-forearm');w=head('ORG-hand');h=r.matrix_world@r.pose.bones['ORG-hand.'+side].tail
            row['sides'][side]={'elbow_flex_deg':math.degrees((e-sh).angle(w-e)),'shoulder':list(sh),'elbow':list(e),'wrist':list(w),'dumbbell_center':list(anchors[side].matrix_world.translation),'wrist_target_error_m':(w-targets[side].matrix_world.translation).length,'forearm_from_vertical_deg':math.degrees((w-e).angle(Vector((0,0,1)))),'hand_bone_axis_deg':math.degrees((w-e).angle(h-w))}
        rows.append(row)
    for obj in [r,*anchors.values()]:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type='AUTO_CLAMPED';k.handle_right_type='AUTO_CLAMPED'
                        fc.modifiers.new('CYCLES')
    s.frame_set(1);s.frame_end=180;s.render.fps=30;bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    report={'reference':'User-supplied StrengthLog screen recording09-06-2026 19:26:39; NASM incline chest press posture/controlled descent. No inferred joint angles measured from2D footage.','change':'Upper arm arc about fixed shoulder, lower towards upper chest; forearms nearly vertical, shafts horizontal instead of forced bone-axis alignment that tilted the weights. Existing calibrated grasp and wrist relation kept.','wrist_note':'Metacarpal bone axis has a fixed anatomical/model offset in the existing grasp; zero bone-axis angle is not imposed as an anatomical wrist criterion.','frames':180,'closure_frame':181,'duration_s':6,'disc_radius_m':config.get('disc_radius_m',.085),'bottom_extension':config.get('bottom_extension',.12),'rows':rows,'closure_surface_m':float(np.linalg.norm(p-initial,axis=1).max()),'human_reviews':'pending'}
    (out/'motion-refinement.json').write_text(json.dumps(report,indent=2));return {'max_surface_step_m':max(x['surface_step_m'] for x in rows),'wrist_target_error_m':max(v['wrist_target_error_m'] for x in rows for v in x['sides'].values())}


def garment(config,out):
    import addon_utils,bmesh,hashlib
    from pathlib import Path
    from garment_binding import coordinates
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring'];s.frame_set(1)
    addon_utils.enable('bl_ext.user_default.mpfb',default_set=True,persistent=False)
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    before_masks={m.name for m in b.modifiers if m.type=='MASK'};pose=r.data.pose_position;r.data.pose_position='REST';bpy.context.view_layer.update();rest=coordinates(b)
    asset=config['garment_source'];clothes=HumanService.add_mhclo_asset(asset,b,asset_type='Clothes',subdiv_levels=0)
    assert clothes and clothes.type=='MESH';clothes.name='Incline V2 tailored crew top'
    for m in list(b.modifiers):
        if m.type=='MASK' and m.name not in before_masks:b.modifiers.remove(m)
    for m in list(clothes.modifiers):clothes.modifiers.remove(m)
    # The CC0 suit contains independent trousers. Keep the authored upper garment
    # component, preserving the original neck and cap-sleeve topology.
    bm=bmesh.new();bm.from_mesh(clothes.data);bm.verts.ensure_lookup_table();seen=set();components=[]
    for v in bm.verts:
        if v in seen:continue
        stack=[v];component=set()
        while stack:
            q=stack.pop()
            if q in component:continue
            component.add(q);seen.add(q);stack.extend(e.other_vert(q) for e in q.link_edges)
        components.append(component)
    keep=set().union(*(c for c in components if max(v.co.z for v in c)>1.40))
    assert keep
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v not in keep],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(clothes.data);bm.free();clothes.data.update()
    clothes.parent=b.parent;clothes.matrix_basis=b.matrix_basis.copy()
    donor=b.copy();donor.data=b.data.copy();s.collection.objects.link(donor);donor.shape_key_clear()
    for i,v in enumerate(donor.data.vertices):v.co=rest[i]
    for m in list(donor.modifiers):donor.modifiers.remove(m)
    bm=bmesh.new();bm.from_mesh(donor.data);layer=bm.verts.layers.deform.active;idx=donor.vertex_groups['body'].index
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v[layer].get(idx,0)<.5],context='VERTS');bm.to_mesh(donor.data);bm.free();bpy.context.view_layer.update()
    clothes.vertex_groups.clear();bpy.ops.object.select_all(action='DESELECT');clothes.select_set(True);bpy.context.view_layer.objects.active=clothes
    transfer=clothes.modifiers.new('Native torso garment weight transfer','DATA_TRANSFER');transfer.object=donor;transfer.use_vert_data=True;transfer.data_types_verts={'VGROUP_WEIGHTS'};transfer.vert_mapping='POLYINTERP_NEAREST';transfer.layers_vgroup_select_src='ALL';transfer.layers_vgroup_select_dst='NAME';transfer.mix_factor=1
    bpy.ops.object.datalayout_transfer(modifier=transfer.name);bpy.ops.object.modifier_apply(modifier=transfer.name);bpy.data.objects.remove(donor,do_unlink=True)
    # Preserve native PV partition of the compatible MPFB/Rigify body.
    for src in b.modifiers:
        if src.type!='ARMATURE':continue
        a=clothes.modifiers.new('Compatible garment '+src.name,'ARMATURE');a.object=r;a.use_deform_preserve_volume=src.use_deform_preserve_volume;a.use_multi_modifier=src.use_multi_modifier;a.vertex_group=src.vertex_group
    sub=clothes.modifiers.new('Tailored textile subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
    wrap=clothes.modifiers.new('Native garment skin clearance','SHRINKWRAP');wrap.target=b;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.004
    shell=clothes.modifiers.new('Textile thickness','SOLIDIFY');shell.thickness=.0012;shell.offset=1.;shell.use_even_offset=True;shell.thickness_clamp=1.
    for p in clothes.data.polygons:p.use_smooth=True
    # Narrow bound-edge facing gives the neck, sleeves and waist a readable finish.
    edges={}
    for face in clothes.data.polygons:
        for e in face.edge_keys:edges[e]=edges.get(e,0)+1
    boundary={v for e,n in edges.items() if n==1 for v in e};attr=clothes.data.attributes.new('Sportswear binding','FLOAT','POINT')
    for v in clothes.data.vertices:
        dist=min((v.co-clothes.data.vertices[j].co).length for j in boundary);attr.data[v.index].value=max(0.,1.-dist/.012)
    mat=bpy.data.materials.new('Burgundy performance jersey without logos');mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.64;p.inputs['Sheen Weight'].default_value=.28
    a=n.new('ShaderNodeAttribute');a.attribute_name='Sportswear binding';mix=n.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.26,.028,.048,1);mix.inputs[2].default_value=(.065,.008,.017,1);l.new(a.outputs['Fac'],mix.inputs[0]);l.new(mix.outputs[0],p.inputs['Base Color'])
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=350;tex.inputs['Detail'].default_value=2;bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.00018;l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
    clothes.data.materials.clear();clothes.data.materials.append(mat)
    old=bpy.data.objects['SportsTank'];bpy.data.objects.remove(old,do_unlink=True);clothes.name='SportsTank'
    r.data.pose_position=pose;s.frame_set(1);bpy.context.view_layer.update()
    assert {m.name for m in b.modifiers if m.type=='MASK'}==before_masks
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    p=Path(asset);record={'source':asset,'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_header':p.read_text(encoding='utf-8',errors='replace')[:2400],'upper_component_vertices':len(clothes.data.vertices),'reused':'Existing MakeHuman core male_casualsuit04 upper garment, collar and cap sleeves; generated trousers removed, existing shorts retained','treatment':'Brand-free burgundy performance jersey, narrow bound edges, native body weights/PV and4mm skin clearance,1.2mm textile shell','masks_preserved':sorted(before_masks),'human_reviews':'pending'}
    (out/'garment-refinement.json').write_text(json.dumps(record,indent=2));return {'vertices':len(clothes.data.vertices),'body_masks_preserved':True}
