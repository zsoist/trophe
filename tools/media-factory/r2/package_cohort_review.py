"""Package private cohort diagnostics with immutable identity, never consumer release."""
from pathlib import Path
import datetime,hashlib,json,shutil,subprocess,sys,zipfile


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def run(spec_path):
    spec=json.loads(Path(spec_path).read_text());root=Path(spec['root']);dest=root/spec['destination'];assert not dest.exists()
    jobs=root/'factory-work/r2/jobs';provenance={}
    for role,entry in spec['jobs'].items():
        job=jobs/entry['id'];obs=json.loads((job/'observed.json').read_text());result=json.loads((job/'output/result.json').read_text())
        assert obs['terminal']['exit_code']==0 and not obs['process_alive'] and obs['task_state']=='Ready',role
        assert digest(job/'config.json')==result['config_sha256']
        for module,sha in result['recipe_modules'].items():
            data=subprocess.check_output(['git','-C',str(root/'code/ag2'),'show',entry['commit']+':tools/media-factory/r2/'+module]);assert hashlib.sha256(data).hexdigest()==sha,(role,module)
        provenance[role]={'job':str(job),'commit':entry['commit'],'observed':obs,'result':result}
    master=Path(provenance['master']['job'])/'output/athlete.blend';master_sha=digest(master)
    for role in ['contact','playback','orbit','photos']:
        assert provenance[role]['result']['source_hashes']['animation_source']==master_sha,role
    contact=json.loads((Path(provenance['contact']['job'])/'output/localization.json').read_text());rows=contact['frames'];assert [r['frame'] for r in rows]==list(range(1,182))
    checks={k:max(len(r[k]) for r in rows) for k in ['cloth_body_intersection_pairs','cloth_self_intersection_pairs','actual_disc_intersections','shirt_negative_vertices']}
    playback=json.loads((Path(provenance['playback']['job'])/'output/playback-qa.json').read_text());assert playback['frames']==181
    summary={'contact_maxima':checks,'contact_states':181,'grip_drift_max_m':playback['tracked_grip_drift_max_m'],'foot_motion_max_m':playback['shoe_motion_max_m'],'closure':playback['closure'],'skin_region_pairs_max':max(v['intersection_pairs'] for r in playback['samples'] for v in r['regions'].values()),'technical_passed':False,'visual_hold':spec['visual_hold'],'human_reviews':{'visual':'pending','technique':'pending'},'method':'Evaluated meshes, BVH plus noncoplanar segment-triangle crossings; shared-vertex self pairs excluded. 1mm negative-vertex and grip targets. Pair counts are not holes; no friction/force or human-technique certification.'}
    assert not any(checks.values()) and max(summary['grip_drift_max_m'].values())<.001 and summary['skin_region_pairs_max']==0
    regression=json.loads((Path(provenance['regression']['job'])/'output/render-regression.json').read_text());assert regression['passed']
    dest.mkdir()
    for entry in spec['files']:
        source=Path(provenance[entry['role']]['job'])/entry['file'];shutil.copy2(source,dest/entry['name'])
    video=dest/spec['video'];probe=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_entries','stream=width,height,r_frame_rate,nb_frames:format=duration','-of','json',str(video)]));st=probe['streams'][0]
    assert (st['width'],st['height'],st['r_frame_rate'],int(st['nb_frames']))==(1280,720,'30/1',540) and abs(float(probe['format']['duration'])-18)<.01
    decoded=subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(video),'-f','framemd5','-'],text=True);distinct=len({r.rsplit(',',1)[-1] for r in decoded.splitlines() if not r.startswith('#')});assert distinct>500
    (dest/'provenance.json').write_text(json.dumps(provenance,indent=2));(dest/'qa-summary.json').write_text(json.dumps(summary,indent=2))
    fingerprint={'master':master_sha,'orbit_config':provenance['orbit']['result']['config_sha256'],'orbit_recipe':provenance['orbit']['result']['recipe_modules'],'blender':provenance['orbit']['result']['blender']}
    index={'id':spec['id'],'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'PRIVATE_VISUAL_TECHNICAL_HOLD','asset_ready':False,'published':False,'human_reviews':summary['human_reviews'],'master':{'path':str(master),'sha256':master_sha},'recipe_commit':provenance['master']['commit'],'parent':spec['parent'],'build_key':hashlib.sha256(json.dumps(fingerprint,sort_keys=True).encode()).hexdigest(),'video':{'path':str(video),'sha256':digest(video),'probe':probe,'distinct_frames':distinct},'qa':summary,'photos':[{'path':str(p),'sha256':digest(p)} for p in sorted(dest.glob('*.png'))],'provenance_sha256':digest(dest/'provenance.json')}
    (dest/'index.json').write_text(json.dumps(index,indent=2));(dest/'REPORT.md').write_text(spec['report'])
    html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Curl · camiseta reutilizable</title><style>body{background:#17191d;color:#eee;font:16px system-ui;max-width:1080px;margin:auto;padding:24px}video,img{width:100%}section{display:grid;grid-template-columns:1fr 1fr;gap:16px}p{line-height:1.5}</style><h1>Curl · comparación de camiseta</h1><p>Órbita de18 segundos. Cuello cerrado y sisa recortada. El borde necesita acabado: diagnóstico privado, sin aprobación de publicación ni técnica humana.</p><video controls playsinline preload="metadata" src="'+spec['video']+'"></video><section>'
    for name,label in spec['gallery']:html+='<figure><img loading="lazy" src="'+name+'"><figcaption>'+label+'</figcaption></figure>'
    (dest/'revision.html').write_text(html+'</section>')
    (dest/'SHA256SUMS').write_text(''.join(digest(p)+'  '+p.name+'\n' for p in sorted(dest.iterdir()) if p.is_file()))
    with zipfile.ZipFile(dest/'video-fotos.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(dest.iterdir()):
            if p.suffix!='.zip':z.write(p,p.name)
    for line in (dest/'SHA256SUMS').read_text().splitlines():
        sha,name=line.split('  ',1);assert digest(dest/name)==sha
    for p in dest.iterdir():p.chmod(0o444)
    dest.chmod(0o555)
    print(json.dumps({'directory':str(dest),'index_sha256':digest(dest/'index.json'),'master_sha256':master_sha,'video_sha256':digest(video),'build_key':index['build_key'],'qa':summary},indent=2))


if __name__=='__main__':run(sys.argv[1])
