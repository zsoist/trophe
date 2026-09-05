"""Validate a real curl derivative and atomically create a new private candidate package."""
from pathlib import Path
import datetime, hashlib, json, shutil, subprocess, sys
import jsonschema
from PIL import Image


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()


def run(config):
    root=Path(config['program_root']).resolve(strict=True);release=config['release_id']
    assert release and all(c.islower() or c.isdigit() or c=='-' for c in release)
    destination=root/'handoffs'/release;vault=root/'media-vault'/release
    assert not destination.exists() and not vault.exists()
    source=Path(config['render_job']);master=Path(config['master'])
    result=json.loads((source/'output/result.json').read_text(encoding='utf-8-sig'))
    terminal=json.loads((source/'terminal.json').read_text(encoding='utf-8-sig'))
    assert terminal['exit_code']==0 and result['result']['native_render'] and not result['result']['upscaled']
    assert result['result']['resolution']==[1920,1080]
    assert result['source_hashes']['animation_source']==sha(master)
    for record in ['playback_qa','contact_qa']:
        checked=json.loads((Path(config[record]).parent/'result.json').read_text(encoding='utf-8-sig'))
        assert checked['source_hashes']['animation_source']==sha(master)
    qa=json.loads(Path(config['playback_qa']).read_text());contact=json.loads(Path(config['contact_qa']).read_text())
    assert len(qa['samples'])==181 and len(contact['frames'])==181
    assert all(v['intersection_pairs']==0 for sample in qa['samples'] for v in sample['regions'].values())
    assert qa['shoe_motion_max_m']<1e-6 and max(qa['tracked_grip_drift_max_m'].values())<.001
    assert all(not row[key] for row in contact['frames'] for key in ['actual_disc_intersections','cloth_body_intersection_pairs','cloth_self_intersection_pairs','shirt_negative_vertices'])
    assert all(c['vertices_below_minus_1mm']==0 for row in qa['samples'] for c in row['cloth'].values())
    coverage_records={}
    for key in ['coverage_check','coverage_regression']:
        path=Path(config[key]);record=json.loads(path.read_text())
        checked=json.loads((path.parent/'result.json').read_text(encoding='utf-8-sig'))
        assert checked['source_hashes']['animation_source']==sha(master)
        assert record['passed'] is True
        coverage_records[key]={'path':str(path),'sha256':sha(path)}
    regression=json.loads(Path(config['coverage_regression']).read_text())
    assert regression['source_missing_case_reproduced'] and not regression['helpers_exposed']
    assert 'CoveredBySportswear' not in regression['preserved_masks']
    assert {'body','TrainerCoverage'}<=set(regression['preserved_masks'])
    video=source/'output/motion.mp4';poster=source/'output/poster.webp'
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
    streams=probe['streams'];assert len(streams)==1
    stream=streams[0];assert (stream['codec_name'],stream['width'],stream['height'],stream['r_frame_rate'],stream['nb_frames'])==('h264',1920,1080,'30/1','180')
    assert abs(float(probe['format']['duration'])-6)<.001 and video.stat().st_size<4*1024*1024
    decoded=subprocess.check_output(['ffmpeg','-v','error','-threads','2','-i',str(video),'-f','framemd5','-'],text=True)
    rows=[v for v in decoded.splitlines() if v and not v.startswith('#')];assert len(rows)==180 and len({v.split(',')[-1].strip() for v in rows})==180
    with Image.open(poster) as im:assert im.format=='WEBP' and im.size==(960,540);im.load()
    assert poster.stat().st_size<150000
    vault.mkdir();shutil.copy2(master,vault/'curl.blend')
    master_job=master.parent.parent;master_recipe=vault/'master-recipe';master_recipe.mkdir()
    for file in list(master_job.glob('*.py'))+[master_job/'config.json',master_job/'terminal.json',master_job/'output/result.json']:
        shutil.copy2(file,master_recipe/file.name)
    recipe=json.loads((source/'config.json').read_text());normalized={k:v for k,v in recipe.items() if k not in {'id','animation_source'}}
    fingerprint={'master_sha256':sha(master),'render_recipe':normalized,'modules':result['recipe_modules'],'blender':result['blender'],'blender_build':result['blender_build'],'mpfb':'2.0.17','sources':{Path(v).name:sha(v) for v in config['source_records']}}
    for file in source.glob('*.py'):shutil.copy2(file,vault/file.name)
    for name in ['config.json','terminal.json']:
        shutil.copy2(source/name,vault/('render-'+name))
    shutil.copy2(source/'output/result.json',vault/'render-result.json')
    for file in config['source_records']:shutil.copy2(file,vault/Path(file).name)
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    evidence={'created_at':now,'source_master':str(master),'source_sha256':sha(master),'render_job':str(source),'render_result_sha256':sha(source/'output/result.json'),'code_checkpoint':config['code_checkpoint'],'exact_executed_modules':result['recipe_modules'],'fingerprint':fingerprint,'playback_qa':{'path':config['playback_qa'],'sha256':sha(config['playback_qa'])},'triangle_qa':{'path':config['contact_qa'],'sha256':sha(config['contact_qa'])},'binary_probe':probe,'decoded_frames':180,'distinct_frames':180,'technical_scope':'file, common elbow/wrist regions, handle tracking, feet, actual shirt/body/self and disk/body intersections through181states; not pressure/friction or human exercise technique','cloth_representation':'fitted double-sided textile surface; no volumetric thickness or simulation claimed','human_reviews':'pending'}
    evidence['coverage_qa']=coverage_records
    evidence['master_recipe']={'path':str(master_recipe),'config_sha256':sha(master_recipe/'config.json'),'result_sha256':sha(master_recipe/'result.json')}
    evidence['technical_scope']+='; bounded source01 missing-skin regression and restored common surface comparison; visible armhole renders inspected separately'
    (vault/'source-record.json').write_text(json.dumps(evidence,indent=2));(vault/'decoded-frames.md5').write_text(decoded)
    staging=root/'factory-work/r2/staging'/release;(staging/'assets/curl').mkdir(parents=True)
    files=[]
    for original,name,role,mime,w,h in [(poster,'poster.webp','poster','image/webp',960,540),(video,'motion-1080.mp4','video_hd','video/mp4',1920,1080)]:
        path=staging/'assets/curl'/name;shutil.copy2(original,path)
        entry={'path':'assets/curl/'+name,'role':role,'mime_type':mime,'sha256':sha(path),'bytes':path.stat().st_size,'width':w,'height':h}
        if role=='video_hd':entry.update(fps=30,duration_seconds=6,native_render=True,upscaled=False)
        files.append(entry)
    roster=[{key:f[key] for key in ['path','sha256','bytes']} for f in sorted(files,key=lambda f:f['path'])]
    roster_hash=hashlib.sha256(json.dumps(roster,separators=(',',':')).encode()).hexdigest()
    pending={'status':'pending','reviewer_role':None,'reviewer_ref':None,'reviewed_at':None,'artifact_set_sha256':roster_hash}
    asset={'asset_id':'curl','kind':'exercise','canonical_name':'Standing Dumbbell Biceps Curl','build_key':hashlib.sha256(canonical(fingerprint)).hexdigest(),'source_fingerprint':hashlib.sha256(canonical({'master':sha(master),'sources':fingerprint['sources']})).hexdigest(),'artifact_set_sha256':roster_hash,'provenance':{'method':'blender-authored','license_review_ref':config['license_review_ref'],'redistribution_reviewed':True},'reviews':{'technical':dict(pending,status='passed',reviewer_role='agent',reviewer_ref='ag2',reviewed_at=now),'visual':pending.copy(),'technique':pending.copy()},'files':files,'exercise':{'catalogue_slug':'curl','equipment':'Dumbbell','body_id':'athlete-r2-01','rig_id':'mpfb-rigify-complete-r2-01','clip_ids':['curl-supinated-r2-01'],'anatomy_mapping_ref':None,'phases':[{'id':'concentric','start_seconds':0,'end_seconds':2.4,'label_key':'workout.detail_phase_work'},{'id':'eccentric','start_seconds':2.4,'end_seconds':6,'label_key':'workout.detail_phase_finish'}]}}
    manifest={'schema_version':'trophe.media-package/1','release_id':release,'created_at':now,'release_status':'candidate','assets':[asset]}
    schema=root/'specs/media-package-v1.schema.json';assert sha(schema)==config['schema_sha256'];jsonschema.validate(manifest,json.loads(schema.read_text()))
    (staging/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for entry in files:assert sha(staging/entry['path'])==entry['sha256']
    staging.rename(destination)
    return {'release_id':release,'package':str(destination),'manifest_sha256':sha(destination/'manifest.json'),'build_key':asset['build_key'],'artifact_set_sha256':roster_hash,'video_sha256':sha(video),'source_record_sha256':sha(vault/'source-record.json'),'human_reviews':'pending','published':False}


if __name__=='__main__':print(json.dumps(run(json.loads(Path(sys.argv[1]).read_text())),indent=2))
