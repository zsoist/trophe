"""Complete source inventory. Display buckets are explicitly Trophē curation."""
import pathlib,json,argparse,collections
from catalogue import load_metadata
# Source roots are kept in the output. Traverse typed source child edges, never
# infer membership from an English substring or a mesh's apparent shape.
SYSTEM_ROOTS={'connective':['FMA9721'],'skeleton':['FMA5018','FMA12516','FMA23881','FMA7485'],'muscles':['FMA5022','FMA10474','FMA32558'],'vascular':['FMA50720','FMA50723','FMA7161'],'nervous':['FMA7157','FMA50801','FMA7647','FMA65132'],'organs':['FMA7152','FMA7158','FMA9668']}
CONNECTIVE_NAMES={'ligament','cartilage organ','fascia','aponeurosis'}
ORGAN_NAMES={'urinary system','male genital system','reproductive system','urinary bladder','kidney','testis','eye','ear'}
def inventory(metadata,meshes):
    paths={p.stem:str(p.resolve()) for p in meshes.rglob('*.obj')};d=load_metadata(metadata,set(paths))
    roots={k:list(v) for k,v in SYSTEM_ROOTS.items()}
    for c in d['concepts'].values():
        name=c['source_names'][0].lower()
        if name in CONNECTIVE_NAMES:roots['connective'].append(c['id'])
        if name in ORGAN_NAMES:roots['organs'].append(c['id'])
    children=collections.defaultdict(set)
    for r in d['relations']:children[r['parent']].add(r['child'])
    def descendants(ids):
        seen=set();todo=list(ids);elements=set()
        while todo:
            cid=todo.pop()
            if cid in seen:continue
            seen.add(cid);elements.update(d['concepts'].get(cid,{}).get('elements',[]));todo.extend(children[cid]-seen)
        return elements
    systems={k:descendants(ids) for k,ids in roots.items()}
    for e in d['elements'].values():
        e['system']=next((k for k in roots if e['id'] in systems[k]),'other');e['region']='pending-spatial-band';e['source_path']=paths.get(e['id'])
    d['curation']={'systems':'Trophe display buckets, source root closure through IS-A and PART-OF child edges; overlap resolved by declared priority, not a clinical ontology','system_roots':roots,'system_priority':list(roots),'regions':'Source-coordinate spatial bands for transfer only: upper >=1.35m, middle >=0.82m, lower below0.82m; not anatomical region labels','mapping':'Exercise roles remain in existing curated workout model'}
    return d
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('metadata',type=pathlib.Path);a.add_argument('meshes',type=pathlib.Path);a.add_argument('output',type=pathlib.Path);x=a.parse_args();d=inventory(x.metadata,x.meshes);x.output.write_text(json.dumps(d,sort_keys=True,separators=(',',':')));print(json.dumps({'concepts':len(d['concepts']),'elements':len(d['elements']),'systems':dict(collections.Counter(e['system'] for e in d['elements'].values()))}))
