"""Fetch official metadata once. Pin resolved URLs and bytes; never execute archive code."""
import argparse, pathlib, urllib.request, hashlib, json, datetime
BASE='https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
NAMES=[f'{tree}_{suffix}' for tree in ('isa','partof') for suffix in ('parts_list_e.txt','inclusion_relation_list.txt','element_parts.txt')]
URLS={n:BASE+n for n in NAMES}
URLS.update({'README_e.html':BASE+'README_e.html','license.html':'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html','download.html':'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html'})
def acquire(destination):
    destination.mkdir(parents=True,exist_ok=True)
    records=[]
    for name,url in URLS.items():
        path=destination/name
        if path.exists():
            record=json.loads((destination/(name+'.source.json')).read_text())
            assert hashlib.sha256(path.read_bytes()).hexdigest()==record['sha256']
        else:
            with urllib.request.urlopen(url,timeout=60) as response:
                data=response.read(8*1024*1024+1)
                if len(data)>8*1024*1024: raise ValueError('metadata size cap')
                record={'requested_url':url,'resolved_url':response.url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'publisher_authentication':'official HTTPS origin; hash self-computed, not publisher-signed'}
            path.write_bytes(data); (destination/(name+'.source.json')).write_text(json.dumps(record,indent=2))
        records.append(dict(name=name,**record))
    (destination/'inventory.json').write_text(json.dumps(records,indent=2))
    print(json.dumps({'metadata_files':len(records),'bytes':sum(r['bytes'] for r in records)}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('destination',type=pathlib.Path);acquire(parser.parse_args().destination)
