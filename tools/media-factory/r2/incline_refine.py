"""Reference-led incline press revision; motion and textile changes remain separable."""
import bpy,json,math
import numpy as np
from mathutils import Matrix,Vector,Quaternion
from incline import ease
from cohort import key
from playback_qa import points


def motion(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;r=bpy.data.objects['Trophe_R2_Authoring'];b=bpy.data.objects['Trophe_R2_Athlete']
    s.frame_set(100);bpy.context.view_layer.update();anchors={};targets={};orientations={};lengths={};shoulders={};orientation_checks={}
    for side,sign in [('L',1),('R',-1)]:
        a=bpy.data.objects['Incline dumbbell '+side];target=bpy.data.objects['Incline wrist target '+side];anchors[side]=a;targets[side]=target
        head=lambda n:r.matrix_world@r.pose.bones[n+'.'+side].head
        sh=head('ORG-upper_arm');e=head('ORG-forearm');w=head('ORG-hand');shoulders[side]=sh.copy();lengths[side]=((e-sh).length,(w-e).length)
        # Preserve full signed anchor basis: the left calibrated grasp uses a
        # reflected object frame. Quaternion-only reconstruction loses that sign
        # and reflects the wrist target, singularizing Rigify's midpoint blend.
        old=a.matrix_world.to_3x3().to_4x4();shaft=(old.to_3x3()@Vector((1,0,0))).normalized()
        horizontal=Vector((1 if shaft.x>=0 else -1,0,0))
        orientations[side]=shaft.rotation_difference(horizontal).to_matrix().to_4x4()@old
        orientation_checks[side]={'source_anchor_determinant':old.to_3x3().determinant(),'new_anchor_determinant':orientations[side].to_3x3().determinant(),'wrist_local_determinant':target.matrix_basis.to_3x3().determinant()}
        assert abs(orientation_checks[side]['source_anchor_determinant']-orientation_checks[side]['new_anchor_determinant'])<1e-5
        assert (orientations[side]@target.matrix_basis).to_3x3().determinant()>0
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
        row={'frame':f,'descent':q,'surface_step_m':float(np.linalg.norm(p-previous,axis=1).max()) if previous is not None else 0,'sides':{},'hand_determinants':{side:r.pose.bones['ORG-hand.'+side].matrix.to_3x3().determinant() for side in ['L','R']}};previous=p.copy()
        assert all(x>0 for x in row['hand_determinants'].values()),row
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
    report={'reference':'User-supplied StrengthLog screen recording09-06-2026 19:26:39; NASM incline chest press posture/controlled descent. No inferred joint angles measured from2D footage.','change':'Upper arm arc about fixed shoulder, lower towards upper chest; forearms nearly vertical, shafts horizontal instead of forced bone-axis alignment that tilted the weights. Existing calibrated grasp and wrist relation kept.','wrist_note':'Metacarpal bone axis has a fixed anatomical/model offset in the existing grasp; zero bone-axis angle is not imposed as an anatomical wrist criterion.','orientation_checks':orientation_checks,'frames':180,'closure_frame':181,'duration_s':6,'disc_radius_m':config.get('disc_radius_m',.085),'bottom_extension':config.get('bottom_extension',.12),'rows':rows,'closure_surface_m':float(np.linalg.norm(p-initial,axis=1).max()),'human_reviews':'pending'}
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


def constraint_audit(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);r=bpy.data.objects['Trophe_R2_Authoring'];rows={}
    for name in ['ORG-forearm.L','MCH-forearm_tweak.L.001','forearm_tweak.L.001','DEF-forearm.L','DEF-forearm.L.001']:
        p=r.pose.bones[name];rows[name]={'parent':p.parent.name if p.parent else None,'constraints':[],'bbone':{n:getattr(p.bone,n) for n in ['bbone_segments','bbone_handle_type_start','bbone_handle_type_end']},'handles':[p.bone.bbone_custom_handle_start.name if p.bone.bbone_custom_handle_start else None,p.bone.bbone_custom_handle_end.name if p.bone.bbone_custom_handle_end else None]}
        for c in p.constraints:
            row={'name':c.name,'type':c.type}
            for prop in ['subtarget','head_tail','keep_axis','volume','track_axis','up_axis','owner_space','target_space','mix_mode','rest_length','influence']:
                if hasattr(c,prop):row[prop]=getattr(c,prop)
            if hasattr(c,'target'):row['target']=c.target.name if c.target else None
            rows[name]['constraints'].append(row)
    rows['poses']=[]
    for f in [1,36,46,91,153,154,158]:
        bpy.context.scene.frame_set(f);bpy.context.view_layer.update();row={'frame':f}
        for side in ['L','R']:
            p=r.pose.bones['forearm_tweak.'+side+'.001'];target=r.pose.bones['ORG-hand.'+side].head-p.head
            row[side]={'tweak_y_to_wrist_dot':(p.matrix.to_3x3()@Vector((0,1,0))).normalized().dot(target.normalized()),'org_forearm_y_dot':(r.pose.bones['ORG-forearm.'+side].matrix.to_3x3()@Vector((0,1,0))).normalized().dot(target.normalized()),'tweak_y':list(p.matrix.to_3x3()@Vector((0,1,0))),'to_wrist':list(target.normalized())}
        rows['poses'].append(row)
    (out/'constraints.json').write_text(json.dumps(rows,indent=2));return rows


def scale_reference(config,out):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;r=bpy.data.objects['Trophe_R2_Authoring'];b=bpy.data.objects['Trophe_R2_Athlete'];before={}
    for f in [1,36,46,91,100,153,154,158,181]:
        s.frame_set(f);bpy.context.view_layer.update();before[f]={side:np.array(r.pose.bones['ORG-hand.'+side].matrix) for side in ['L','R']}
    for side in ['L','R']:
        pb=r.pose.bones['forearm_tweak.'+side+'.001']
        for c in list(pb.constraints):
            if c.name=='Continuous calibrated forearm roll':pb.constraints.remove(c)
        c=pb.constraints.new('COPY_TRANSFORMS');c.name='Complete calibrated forearm reference';c.target=bpy.data.objects['Incline calibrated mid-forearm '+side];c.owner_space='WORLD';c.target_space='WORLD';c.mix_mode='REPLACE'
    rows=[];previous=None;first=None;old_matrices=None
    source_ids=__import__('localize_contact').mesh_data(b)[2]
    determinant={side:{'wrist_target':bpy.data.objects['Incline wrist target '+side].matrix_world.to_3x3().determinant(),'ORG_hand':r.pose.bones['ORG-hand.'+side].matrix.to_3x3().determinant(),'ORG_forearm':r.pose.bones['ORG-forearm.'+side].matrix.to_3x3().determinant()} for side in ['L','R']}
    for f in range(1,182):
        s.frame_set(f);bpy.context.view_layer.update();p=points(b)
        if first is None:first=p.copy()
        row={'frame':f,'step_m':float(np.linalg.norm(p-previous,axis=1).max()) if previous is not None else 0,'scales':{side:list(r.pose.bones['forearm_tweak.'+side+'.001'].matrix.to_scale()) for side in ['L','R']}}
        matrices={pb.name:pb.matrix.copy() for pb in r.pose.bones if any(n in pb.name for n in ['upper_arm','forearm','hand'])}
        if previous is not None and row['step_m']>.025:
            i=int(np.argmax(np.linalg.norm(p-previous,axis=1)));v=b.data.vertices[source_ids[i]];row['worst_vertex']={'source_id':source_ids[i],'rest':list(v.co),'weights':[(b.vertex_groups[g.group].name,g.weight) for g in v.groups]};row['bone_jumps']={n:math.degrees(m.to_quaternion().rotation_difference(old_matrices[n].to_quaternion()).angle) for n,m in matrices.items() if math.degrees(m.to_quaternion().rotation_difference(old_matrices[n].to_quaternion()).angle)>15}
        previous=p.copy();old_matrices=matrices
        assert all(.98<v<1.02 for vs in row['scales'].values() for v in vs),row
        if f in before:
            row['hand_matrix_delta']=max(float(np.abs(np.array(r.pose.bones['ORG-hand.'+side].matrix)-before[f][side]).max()) for side in ['L','R']);assert row['hand_matrix_delta']<1e-5,row
        rows.append(row)
    maximum=max(x['step_m'] for x in rows)
    if not config.get('diagnostic_only'):assert maximum<.025,maximum
    s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    (out/'scale-reference.json').write_text(json.dumps({'cause':'Confirmed near-zero/inverting scale in left mid-forearm inherited from native50% COPY_TRANSFORMS blend when hand orientation opposes forearm. Existing COPY_ROTATION preserved orientation but did not prevent singular inherited scale, making Stretch To unstable.','intervention':'Native COPY_TRANSFORMS from the existing positively oriented calibrated forearm reference on both middle tweaks. COPY_SCALE alone retained the negative determinant and failed; full transform replacement removes the inherited singular matrix. Reference retains midpoint offset, rotation and scale calibrated fromV1 frame1. IK, wrists, grasp, motion and body weights remain unchanged.','rows':rows,'determinants':determinant,'diagnostic_only':config.get('diagnostic_only',False),'max_surface_step_m':maximum,'closure_surface_m':float(np.linalg.norm(p-first,axis=1).max()),'human_reviews':'pending'},indent=2));return {'maximum_step_m':maximum,'closure_m':float(np.linalg.norm(p-first,axis=1).max())}


def garment_rest_clearance(config,out):
    # Nearest-point projection during flexion can switch from upper arm to
    # forearm. Fit once in the original skeleton rest pose, then use skinning.
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;r=bpy.data.objects['Trophe_R2_Authoring'];c=bpy.data.objects['SportsTank'];s.frame_set(1)
    r.data.pose_position='REST';bpy.context.view_layer.update()
    wrap=c.modifiers['Native garment skin clearance'];bpy.ops.object.select_all(action='DESELECT');c.select_set(True);bpy.context.view_layer.objects.active=c
    bpy.ops.object.modifier_move_to_index(modifier=wrap.name,index=0)
    bpy.ops.object.modifier_apply(modifier=wrap.name)
    r.data.pose_position='POSE';s.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    record={'cause':'Visible sleeve spikes and strips when live whole-body nearest-surface projection selects the opposing forearm during elbow flexion.','change':'Apply native Shrinkwrap4mm clearance once on garment in original skeleton REST before armature deformation; retain fitted garment geometry, native transferred weights, PV, subdivision and shell. No live closest-surface reassignment. Body, rig, grasp and motion unchanged.','human_reviews':'pending'}
    (out/'garment-clearance.json').write_text(json.dumps(record,indent=2));return record


def local_gate(config,out):
    from surface_qa import check
    from localize_contact import mesh_data
    from bench_qa import crossings
    from compare_baseline import studio,place
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring'];c=bpy.data.objects['SportsTank']
    regions={side:[v.index for v in b.data.vertices if sign*v.co.x>.07 and 1.10<v.co.z<1.54 and any(b.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)] for side,sign in [('L',1),('R',-1)]}
    modifiers=[m for m in b.modifiers if m.name.startswith('Native elbow deformation finish')]
    record={'body_modifiers':[{'name':m.name,'type':m.type,**({'volume':m.use_deform_preserve_volume,'vertex_group':m.vertex_group} if m.type=='ARMATURE' else {})} for m in b.modifiers],'native_elbow_modifiers':[m.name for m in modifiers],'variants':{}}
    camera=studio(s);s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720;camera.data.sensor_fit='VERTICAL'
    for variant in ['inherited','without_inherited_smooth']:
        if variant!='inherited':
            for m in modifiers:m.show_viewport=m.show_render=False
        rows=[]
        for f in [1,76,91,110,181]:
            s.frame_set(f);bpy.context.view_layer.update();data=mesh_data(b);row={'frame':f,'skin':check(b,regions),'garment_crossing_pairs':len(crossings(data,mesh_data(c)))};rows.append(row)
            if f==91:
                e=r.matrix_world@r.pose.bones['ORG-forearm.L'].head
                place(camera,e+Vector((1,-1,.45)),e,.40);s.render.filepath=str(out/(variant+'-elbow.png'));bpy.ops.render.render(write_still=True)
        record['variants'][variant]=rows
    (out/'local-gate.json').write_text(json.dumps(record,indent=2));return {'diagnostic_only':True}


def garment_collider(config,out):
    # Existing native Shrinkwrap, with a deformation-compatible collider that
    # cannot select the forearm/hand across the bent sleeve opening.
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];c=bpy.data.objects['SportsTank']
    proxy=b.copy();proxy.data=b.data.copy();s.collection.objects.link(proxy);proxy.name='Incline upper garment collision surface';proxy.hide_render=True;proxy.display_type='WIRE'
    group=proxy.vertex_groups.new(name='Torso and proximal arm clothing collision');kept=[]
    for v in b.data.vertices:
        w={b.vertex_groups[g.group].name:g.weight for g in v.groups}
        distal=sum(weight for name,weight in w.items() if name.startswith(('DEF-forearm','DEF-hand','DEF-palm','DEF-f_','DEF-thumb')))
        if w.get('body',0)>.5 and distal<.02 and v.co.z>.85:kept.append(v.index)
    group.add(kept,1.,'REPLACE');mask=proxy.modifiers.new('Exclude distal arm from textile collider','MASK');mask.vertex_group=group.name
    wrap=c.modifiers.new('Upper garment clearance without distal projection','SHRINKWRAP');wrap.target=proxy;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.004
    c.modifiers.move(len(c.modifiers)-1,next(i for i,m in enumerate(c.modifiers) if m.type=='SOLIDIFY'))
    s.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    record={'cause':'Rest-only fit removed projection strips but subdivision/pose response left visible chest intersections. Whole-body live projection previously selected forearm across sleeve.','change':'Native live Shrinkwrap after subdivision and before1.2mm solidify, on a hidden copy of the SAME deformed body with only torso/proximal arm collision region.4mm offset unchanged; forearm/hand excluded by native weights. Rendered body and its skin masks unchanged.','collider_vertices':kept,'not_simulation':True,'human_reviews':'pending'}
    (out/'garment-collider.json').write_text(json.dumps(record,indent=2));return {'native_filtered_collider':True,'collider_vertices':len(kept)}


def elbow_hinge(config,out):
    from surface_qa import check
    from localize_contact import mesh_data
    from compare_baseline import studio,place
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring']
    def hinge(side):
        a=r.pose.bones['ORG-upper_arm.'+side].head;e=r.pose.bones['ORG-forearm.'+side].head;w=r.pose.bones['ORG-hand.'+side].head
        u=(e-a).normalized();v=(w-e).normalized();y=(u+v).normalized();x=u.cross(v).normalized();z=x.cross(y).normalized();return Matrix((x,y,z)).transposed().to_quaternion()
    regions={side:[v.index for v in b.data.vertices if sign*v.co.x>.07 and 1.10<v.co.z<1.54 and any(b.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)] for side,sign in [('L',1),('R',-1)]}
    before={};samples={};s.frame_set(1);bpy.context.view_layer.update();reference={side:(hinge(side),r.pose.bones['forearm_tweak.'+side].matrix.to_quaternion()) for side in ['L','R']}
    for f in range(1,182):
        s.frame_set(f);bpy.context.view_layer.update();samples[f]={side:r.pose.bones['forearm_tweak.'+side].matrix.copy() for side in ['L','R']}
        if f in [1,76,91,110,181]:before[f]={'p':points(b),'hands':{side:np.array(r.pose.bones['ORG-hand.'+side].matrix) for side in ['L','R']},'skin':check(b,regions)}
    for f in range(1,182):
        s.frame_set(f);bpy.context.view_layer.update()
        for side in ['L','R']:
            pb=r.pose.bones['forearm_tweak.'+side];loc,rot,scale=samples[f][side].decompose();initial,offset=reference[side];target=hinge(side)@initial.inverted()@offset;pb.matrix=Matrix.LocRotScale(loc,target,scale);key(pb,f)
    for layer in r.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    if not any(('forearm_tweak.'+side+'"') in fc.data_path for side in ['L','R']):continue
                    for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type='AUTO_CLAMPED';k.handle_right_type='AUTO_CLAMPED'
                    if not any(m.type=='CYCLES' for m in fc.modifiers):fc.modifiers.new('CYCLES')
    rows=[];cam=studio(s);cam.data.sensor_fit='VERTICAL';s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
    for f,base in before.items():
        s.frame_set(f);bpy.context.view_layer.update();rows.append({'frame':f,'before_skin':base['skin'],'after_skin':check(b,regions),'surface_delta_m':float(np.linalg.norm(points(b)-base['p'],axis=1).max()),'hand_matrix_delta':max(float(np.abs(np.array(r.pose.bones['ORG-hand.'+side].matrix)-base['hands'][side]).max()) for side in ['L','R'])})
        if f==91:
            e=r.matrix_world@r.pose.bones['ORG-forearm.L'].head
            for name,offset in [('outside',(1,-1,.45)),('inside',(-1,-1,.45))]:place(cam,e+Vector(offset),e,.40);s.render.filepath=str(out/(name+'-elbow.png'));bpy.ops.render.render(write_still=True)
    assert rows[0]['surface_delta_m']<1e-5;assert all(x['hand_matrix_delta']<1e-5 for x in rows)
    s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    report={'method':'Reuse established Copa native elbow hinge compensation at the main forearm_tweak control, calibrated to THIS incline frame1. Source exercise reset cleared Copa tweak actions. Rotate local deform control with the actual humerus/forearm bisector; do not rotate global arm or move wrist/pole/prop. Native skinning unchanged.','rows':rows,'human_reviews':'pending','adopted':False}
    (out/'elbow-hinge.json').write_text(json.dumps(report,indent=2));return {'diagnostic_variant':True,'before_max_pairs':max(v['intersection_pairs'] for x in rows for v in x['before_skin'].values()),'after_max_pairs':max(v['intersection_pairs'] for x in rows for v in x['after_skin'].values())}


def pose_fold(config,out):
    from cohort import local_pose_fold
    from surface_qa import check
    from compare_baseline import studio,place
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring']
    regions={side:[v.index for v in b.data.vertices if sign*v.co.x>.07 and 1.10<v.co.z<1.54 and any(b.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)] for side,sign in [('L',1),('R',-1)]};before={}
    for f in [1,46,76,91,110,136,181]:s.frame_set(f);bpy.context.view_layer.update();before[f]={'p':points(b),'skin':check(b,regions)}
    core={side:sorted({i for h in before[91]['skin'][side]['hits'] for t in h['triangles'] for i in t}) for side in ['L','R']};assert all(core.values())
    changed=local_pose_fold(b,r,core)
    proxy=bpy.data.objects.get('Incline upper garment collision surface')
    if proxy:local_pose_fold(proxy,r,core)
    rows=[];cam=studio(s);cam.data.sensor_fit='VERTICAL';s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=720
    for f,base in before.items():
        s.frame_set(f);bpy.context.view_layer.update();rows.append({'frame':f,'before_skin':base['skin'],'after_skin':check(b,regions),'surface_delta_max_m':float(np.linalg.norm(points(b)-base['p'],axis=1).max()),'native_factors':{m.name:m.factor for m in b.modifiers if m.name.startswith('Localized pose fold')}})
        if f==91:
            e=r.matrix_world@r.pose.bones['ORG-forearm.L'].head;place(cam,e+Vector((-1,-1,.45)),e,.40);s.render.filepath=str(out/'inner-elbow.png');bpy.ops.render.render(write_still=True)
    assert rows[0]['surface_delta_max_m']<1e-6
    assert all(v>.79 for v in next(x for x in rows if x['frame']==91)['native_factors'].values())
    s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'));(out/'pose-fold.json').write_text(json.dumps({'method':'Native local pose-dependent fold correction in actual crossing region, two feather rings. No displacement cap; report actual surface displacement. Existing control isolation did not resolve crossings, so no hinge variant adopted. Original body, pose, grip, native rig and motion retained outside local region.','region':changed,'rows':rows,'adopted':False,'human_reviews':'pending'},indent=2));return {'max_pairs':max(v['intersection_pairs'] for row in rows for v in row['after_skin'].values())}


def garment_surface_bind(config,out):
    # Replace frame-by-frame nearest projection with Blender's native persistent
    # surface binding. The binding is computed once in original skeleton REST.
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);s=bpy.context.scene;b=bpy.data.objects['Trophe_R2_Athlete'];r=bpy.data.objects['Trophe_R2_Authoring'];old=bpy.data.objects['SportsTank']
    s.frame_set(1);r.data.pose_position='REST'
    for m in old.modifiers:
        if m.type=='SOLIDIFY':m.show_viewport=m.show_render=False
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();ev=old.evaluated_get(dg);mesh=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=dg)
    cloth=bpy.data.objects.new('Persistent surface-bound jersey',mesh);s.collection.objects.link(cloth);cloth.matrix_world=old.matrix_world.copy()
    proxy=b.copy();proxy.data=b.data.copy();s.collection.objects.link(proxy);proxy.name='Incline native cloth binding surface';proxy.hide_render=True;proxy.display_type='WIRE';proxy.modifiers.new('Triangulated native cloth binding target','TRIANGULATE')
    bpy.data.objects.remove(old,do_unlink=True);cloth.name='SportsTank';bpy.ops.object.select_all(action='DESELECT');cloth.select_set(True);bpy.context.view_layer.objects.active=cloth
    bind=cloth.modifiers.new('Persistent native garment surface binding','SURFACE_DEFORM');bind.target=proxy;bind.falloff=4.;bpy.context.view_layer.update();bpy.ops.object.surfacedeform_bind(modifier=bind.name);assert bind.is_bound
    shell=cloth.modifiers.new('Textile thickness','SOLIDIFY');shell.thickness=.0012;shell.offset=1.;shell.use_even_offset=True;shell.thickness_clamp=1.
    r.data.pose_position='POSE';s.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(out/'incline.blend'))
    record={'cause':'Nearest-surface projection switches triangle attachments around sleeve/axilla. Restricting collider did not eliminate switching; those variants are not adopted.','change':'Native Blender Surface Deform bound once to triangulated deformed body in original skeleton REST. Garment native fitted/subdivided surface with4mm rest clearance preserved; stable binding replaces nearest projection and duplicate garment skinning. Native1.2mm shell after deformation. Body masks and body skin unchanged.','vertices':len(mesh.vertices),'native_bound':bind.is_bound,'human_reviews':'pending'}
    (out/'garment-surface-bind.json').write_text(json.dumps(record,indent=2));return record
