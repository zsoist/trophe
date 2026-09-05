"""Evaluate bench supports, native shoulder articulation and actual surface crossings."""
import bpy,json,math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from localize_contact import mesh_data
from surface_qa import segment_hit,check


def tree(data):
    p,t,_=data
    return BVHTree.FromPolygons([Vector(v) for v in p],t,all_triangles=True)


def crossings(a,b,same=False):
    ap,at,ai=a;bp,bt,bi=b;hits=[]
    ta=tree(a);tb=ta if same else tree(b)
    for i,j in ta.overlap(tb):
        if same and (i>=j or set(at[i])&set(bt[j])):continue
        A=ap[list(at[i])];B=bp[list(bt[j])]
        points=[hit for x,y in [(A,B),(B,A)] for k,l in [(0,1),(1,2),(2,0)] if (hit:=segment_hit(x[k],x[l],y)) is not None]
        if points:hits.append({'triangles':[i,j],'center_m':np.mean(points,axis=0).tolist(),'source_ids':[[ai[v] for v in at[i]] if ai else None,[bi[v] for v in bt[j]] if bi else None]})
    return hits


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source']);scene=bpy.context.scene
    body=bpy.data.objects['Trophe_R2_Athlete'];rig=bpy.data.objects['Trophe_R2_Authoring'];shoe=bpy.data.objects['Trophe_R2_Trainers']
    assert not any(m.type=='MASK' and m.vertex_group=='CoveredBySportswear' for m in body.modifiers),'Do not propagate obsolete textile mask'
    body_ids={v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='body' and g.weight>.5 for g in v.groups)}
    regions={s:[v.index for v in body.data.vertices if v.index in body_ids and sign*v.co.x>.07 and 1.13<v.co.z<1.54] for s,sign in [('shoulder_l',1),('shoulder_r',-1)]}
    regions['chest']=[v.index for v in body.data.vertices if v.index in body_ids and abs(v.co.x)<.20 and 1.12<v.co.z<1.49]
    supports={name:[v.index for v in body.data.vertices if v.index in body_ids and lo<v.co.z<hi and abs(v.co.x)<width] for name,lo,hi,width in [('head',1.58,1.9,.12),('upper_back',1.18,1.48,.19),('pelvis',.77,1.02,.18)]}
    rows=[];initial=None;tracked={};initial_rigid={};pad=bpy.data.objects['R2 bench pad'];pad_data=mesh_data(pad);pad_tree=tree(pad_data)
    for frame in config.get('frames',[1,46,91,136,181]):
        scene.frame_set(frame);bpy.context.view_layer.update();data=mesh_data(body);p,t,ids=data;source_lookup={v:i for i,v in enumerate(ids)};sp=mesh_data(shoe)[0]
        if initial is None:initial=sp.copy()
        row={'frame':frame,'skin_regions':check(body,regions),'joints':{},'supports':{},'grips':{},'cloth':{},'equipment':{},'shoe_min_z_m':float(sp[:,2].min()),'shoe_motion_m':float(np.max(np.linalg.norm(sp-initial,axis=1)))}
        for side,suffix in [('l','L'),('r','R')]:
            head=lambda name:rig.matrix_world@rig.pose.bones[name+'.'+suffix].head
            shoulder=head('ORG-upper_arm');elbow=head('ORG-forearm');wrist=head('ORG-hand');hand_tail=rig.matrix_world@rig.pose.bones['ORG-hand.'+suffix].tail
            upper=elbow-shoulder;fore=wrist-elbow;hand=hand_tail-wrist
            flat=Vector((upper.x,upper.y,0));flare=math.degrees(flat.angle(Vector((0,-1,0)))) if flat.length>1e-8 else None
            row['joints'][side]={'shoulder_m':list(shoulder),'elbow_m':list(elbow),'wrist_m':list(wrist),'elbow_flexion_deg':math.degrees(upper.angle(fore)),'wrist_bone_axis_angle_deg':math.degrees(fore.angle(hand)),'upper_arm_planar_flare_deg':flare,'wrist_elbow_horizontal_offset_m':math.hypot(fore.x,fore.y)}
            anchor=bpy.data.objects['R2 shared grip '+side];local=(np.c_[p,np.ones(len(p))]@np.array(anchor.matrix_world.inverted()).T)[:,:3]
            if side not in tracked:
                radial=np.linalg.norm(local[:,1:],axis=1);use=np.where((abs(local[:,0])<.075)&(abs(radial-.014)<.002))[0];assert len(use)>10;tracked[side]=(use,local[use].copy())
            use,ref=tracked[side];bar=bpy.data.objects['R2 shared bar authority'];axis=(anchor.matrix_world.to_3x3()@Vector((1,0,0))).normalized();bar_axis=(bar.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
            real=(np.c_[p[use],np.ones(len(use))]@np.array(bar.matrix_world.inverted()).T)[:,:3];shaft_error=np.linalg.norm(real[:,1:],axis=1)-.014
            row['grips'][side]={'tracked_points':len(use),'drift_m':float(np.max(np.linalg.norm(local[use]-ref,axis=1))),'grip_vs_actual_shaft_axis_deg':math.degrees(math.acos(min(1,abs(axis.dot(bar_axis))))),'contact_point_actual_shaft_signed_min_m':float(shaft_error.min()),'contact_point_actual_shaft_abs_max_m':float(np.abs(shaft_error).max()),'actual_hand_axis_world':list(hand.normalized()),'control_hand_axis_world':list((rig.matrix_world@rig.pose.bones['hand_ik.'+suffix].matrix).to_3x3()@Vector((0,1,0)))}
        for name,source in supports.items():
            q=p[[source_lookup[i] for i in source if i in source_lookup]];dist=[]
            for point in q:
                hit,n,face,d=pad_tree.find_nearest(Vector(point));dist.append(float(d))
            row['supports'][name]={'minimum_pad_distance_m':min(dist),'nearest_vertex_world_m':q[int(np.argmin(dist))].tolist(),'sampled_vertices':len(q)}
        bt=tree(data)
        for name in ['SportsTank','SportsShorts']:
            obj=bpy.data.objects[name];cloth=mesh_data(obj);signed=[]
            for v in cloth[0]:
                hit,n,_,d=bt.find_nearest(Vector(v));signed.append(float((Vector(v)-hit).dot(n)))
            row['cloth'][name]={'body_crossings':crossings(data,cloth),'self_crossings':crossings(cloth,cloth,True),'min_signed_vertex_distance_m':min(signed),'negative_1mm_vertices':sum(v<-.001 for v in signed)}
        for obj in scene.objects:
            if obj.type!='MESH' or not obj.name.startswith(('R2 bar','R2 plate','R2 sleeve','R2 collar','R2 bench')):continue
            obj_data=mesh_data(obj);hit=crossings(data,obj_data)
            row['equipment'][obj.name]={'body_crossings':hit,'bounds_min_m':obj_data[0].min(axis=0).tolist(),'bounds_max_m':obj_data[0].max(axis=0).tolist()}
        rows.append(row)
        if frame%30==1:print('BENCH_QA_FRAME',frame,flush=True)
    def sample(f):
        scene.frame_set(math.floor(f),subframe=f-math.floor(f));bpy.context.view_layer.update();return mesh_data(body)[0]
    a=sample(1);b=sample(181);before=sample(180.9);after=sample(181.1)
    report={'source':config['animation_source'],'frames':rows,'regions_source_ids':regions,'support_source_ids':supports,'closure':{'position_max_m':float(np.max(np.linalg.norm(a-b,axis=1))),'velocity_gap_max_m_s_epsilon_0_1_frames':float(np.max(np.linalg.norm((b-before)*300-(after-b)*300,axis=1)))},'method':'Existing noncoplanar triangle intersections on evaluated visible skin and cloth. Regional shoulder/chest checks and world-space support distances. Fixed skin points track hand/bar; native bone axes are diagnostics, not anatomical range limits.','limits':['No internal muscle geometry or activation simulation.','Cloth/bench support may require localized fit; collision pairs identify surfaces, not force or injury.','Selected-pose diagnostic unless all181frames requested.','Human visual and technique review pending.']}
    original_pose=rig.data.pose_position;rig.data.pose_position='REST';bpy.context.view_layer.update()
    shorts_rest=mesh_data(bpy.data.objects['SportsShorts']);report['rest_short_self_crossings']=crossings(shorts_rest,shorts_rest,True)
    rig.data.pose_position=original_pose;bpy.context.view_layer.update()
    (output/'bench-qa.json').write_text(json.dumps(report,indent=2));return {'frames':len(rows),'closure':report['closure'],'max_shoe_motion_m':max(r['shoe_motion_m'] for r in rows),'max_grip_drift_m':max(v['drift_m'] for r in rows for v in r['grips'].values())}
