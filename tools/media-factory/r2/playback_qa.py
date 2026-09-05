"""Playback checks on the saved editable animation; no scene repair or publication."""
import bpy, json, math
import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector
import surface_qa


def points(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    p=np.array([list(obj.matrix_world@v.co) for v in mesh.vertices]);evaluated.to_mesh_clear();return p


def clip_axis(poly, value, keep_greater):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ia=(a[0]>=value) if keep_greater else (a[0]<=value)
        ib=(b[0]>=value) if keep_greater else (b[0]<=value)
        if ia:out.append(a)
        if ia!=ib:out.append(a+(b-a)*((value-a[0])/(b[0]-a[0])))
    return out


def disc_clearance(p,tri):
    results=[]
    for center in [-.115,.115]:
        lower,upper=center-.0275,center+.0275
        ts=p[tri]
        use=(np.max(ts[:,:,0],axis=1)>=lower)&(np.min(ts[:,:,0],axis=1)<=upper)&(np.min(ts[:,:,1],axis=1)<=.065)&(np.max(ts[:,:,1],axis=1)>=-.065)&(np.min(ts[:,:,2],axis=1)<=.065)&(np.max(ts[:,:,2],axis=1)>=-.065)
        distances=[]
        for t in ts[use]:
            poly=clip_axis(clip_axis(list(t),lower,True),upper,False)
            if len(poly)<3:continue
            q=[v[1:] for v in poly];cross=[];nearest=[]
            for a,b in zip(q,q[1:]+q[:1]):
                d=b-a;f=np.clip(-a.dot(d)/max(d.dot(d),1e-20),0,1)
                nearest.append(np.linalg.norm(a+f*d));cross.append(a[0]*b[1]-a[1]*b[0])
            distances.append(0 if all(v>=0 for v in cross) or all(v<=0 for v in cross) else min(nearest))
        results.append({'center_x_m':center,'candidate_triangles':int(sum(use)),'min_bound_clearance_m':float(min(distances)-.065) if distances else None,'triangles_inside_bound_1mm':int(sum(d<.064 for d in distances))})
    return results


def run(config,output):
    bpy.ops.wm.open_mainfile(filepath=config['animation_source'])
    scene=bpy.context.scene;body=bpy.data.objects['Trophe_R2_Athlete'];rig=bpy.data.objects['Trophe_R2_Authoring']
    shoes=bpy.data.objects['Trophe_R2_Trainers'];garments=[bpy.data.objects[n] for n in ['SportsTank','SportsShorts']]
    anchors={side:bpy.data.objects['R2_Grip_'+side] for side in ['l','r']}
    collider=body.copy();collider.name='R2 QA body without clothing coverage';scene.collection.objects.link(collider);collider.hide_render=True
    for mod in list(collider.modifiers):
        if mod.type=='MASK' and mod.vertex_group in {'CoveredBySportswear','TrainerCoverage'}:collider.modifiers.remove(mod)
    initial={};tracking={};samples=[];previous={};maxdrift={'l':0.,'r':0.};maxshoe=0.;maxcloth={g.name:0. for g in garments}
    for frame in range(1,182):
        scene.frame_set(frame);bpy.context.view_layer.update()
        skin=points(body);sole=points(shoes)
        if frame==1:initial['skin']=skin;initial['sole']=sole;floor_z=float(sole[:,2].min())
        maxshoe=max(maxshoe,float(np.max(np.linalg.norm(sole-initial['sole'],axis=1))))
        # Original masks remain on the authoring body; the private QA duplicate exposes under-garment skin only.
        evaluated=collider.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
        full=np.array([list(collider.matrix_world@v.co) for v in mesh.vertices]);tri=np.array([list(t.vertices) for t in mesh.loop_triangles]);tree=BVHTree.FromPolygons([Vector(p) for p in full],tri.tolist(),all_triangles=True)
        row={'regions':surface_qa.check(body,config['skin_regions']) if config.get('skin_regions') else None,'frame':frame,'sole_min_z_m':float(sole[:,2].min()),'contacts':{},'cloth':{}}
        for side,anchor in anchors.items():
            matrix=np.array(anchor.matrix_world.inverted());local=(np.c_[skin,np.ones(len(skin))]@matrix.T)[:,:3];radius=np.linalg.norm(local[:,1:],axis=1)
            if frame==1:
                ids=np.where((np.abs(local[:,0])<.075)&(np.abs(radius-.014)<.002))[0]
                assert len(ids)>10,(side,len(ids));tracking[side]={'ids':ids,'initial':local[ids].copy()}
            tracked=tracking[side];delta=local[tracked['ids']]-tracked['initial'];drift=float(np.max(np.linalg.norm(delta,axis=1)));maxdrift[side]=max(maxdrift[side],drift)
            full_local=(np.c_[full,np.ones(len(full))]@matrix.T)[:,:3]
            near=local[(np.abs(local[:,0])<.085)&(np.abs(local[:,1])<.07)&(np.abs(local[:,2])<.07)]
            row['contacts'][side]={'tracked_points':len(tracked['ids']),'max_local_drift_m':drift,'hand_disk_axial_margin_m':float(.0875-np.abs(near[:,0]).max()),'disc_body_bounds':disc_clearance(full_local,tri)}
        for garment in garments:
            p=points(garment)
            if frame==1:initial[garment.name]=p
            maxcloth[garment.name]=max(maxcloth[garment.name],float(np.max(np.linalg.norm(p-initial[garment.name],axis=1))))
            signed=[]
            for point in p:
                hit,normal,_,distance=tree.find_nearest(Vector(point))
                signed.append(float((Vector(point)-hit).dot(normal)))
            row['cloth'][garment.name]={'vertices':len(p),'min_signed_vertex_clearance_m':min(signed),'vertices_below_minus_1mm':sum(v<-.001 for v in signed),'method':'evaluated garment vertices versus nearest full-body surface normals; not an exact cloth triangle self-intersection test'}
        evaluated.to_mesh_clear();samples.append(row)
        if frame%30==0:print('R2_PLAYBACK_QA_FRAME',frame,flush=True)
    # Fractional samples straddle the actual Cycles-modified action boundary.
    def sample(t):
        f=math.floor(t);scene.frame_set(f,subframe=t-f);bpy.context.view_layer.update();return points(body)
    a=sample(1);b=sample(181);fractional=[]
    for epsilon in [.5,.1,.05,.01]:
        before=sample(181-epsilon);after=sample(181+epsilon)
        fractional.append({'epsilon_frames':epsilon,'velocity_gap_max_m_s':float(np.max(np.linalg.norm((b-before)*30/epsilon-(after-b)*30/epsilon,axis=1)))})
    closure={'position_max_m':float(np.max(np.linalg.norm(a-b,axis=1))),'fractional_velocity_samples':fractional,'method':'Finite differences on evaluated surface across native repeated action; small epsilon is sensitive to float geometry noise. Values are not a human technique gate.'}
    bpy.data.objects.remove(collider,do_unlink=True)
    report={'source':config['animation_source'],'frames':181,'render_frames':180,'duration_s':6,'fps':30,'floor_z_m':floor_z,'shoe_motion_max_m':maxshoe,'garment_motion_max_m':maxcloth,'tracked_grip_drift_max_m':maxdrift,'closure':closure,'samples':samples,'human_reviews':'pending','limits':['Geometric tracking does not certify friction/pressure or exercise technique.','Cloth/body nearest-vertex checks can miss triangle-only crossings; targeted visual and triangle follow-up required if suspect.','Disc bounds conservatively include beveled corners; flagged cases require actual-surface localization.']}
    (output/'playback-qa.json').write_text(json.dumps(report,indent=2))
    print('R2_PLAYBACK_QA_COMPLETE',closure,flush=True)
    return {k:report[k] for k in ['frames','shoe_motion_max_m','garment_motion_max_m','tracked_grip_drift_max_m','closure']}
