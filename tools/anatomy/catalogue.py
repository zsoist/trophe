"""Official concept/representation/ELEMENT relations, without conflating hierarchy types."""
import csv,io,re,json,pathlib,argparse

def rows(text,header):
    reader=csv.DictReader(io.StringIO(text.lstrip('\ufeff')),delimiter='\t')
    if reader.fieldnames!=header:raise ValueError('Unexpected source columns')
    for row in reader:
        if None in row or any(v is None or not v.strip() for v in row.values()):raise ValueError('Malformed source row')
        yield {k:v.strip() for k,v in row.items()}

def laterality(name):
    left=bool(re.search(r'\bleft\b',name,re.I));right=bool(re.search(r'\bright\b',name,re.I))
    return 'bilateral' if left and right else 'left' if left else 'right' if right else 'unspecified'

def parse_catalogue(tree,parts,relations,elements):
    if tree not in ('isa','partof'):raise ValueError('Unknown hierarchy')
    concepts={};representations={}
    for r in rows(parts,['concept id','representation id','en']):
        cid,rid=r['concept id'],r['representation id']
        if not re.fullmatch(r'FMA\d+',cid) or not re.fullmatch(r'BP\d+',rid):raise ValueError('Invalid identity')
        if rid in representations and representations[rid]!=cid:raise ValueError('Conflicting representation')
        representations[rid]=cid
        c=concepts.setdefault(cid,{'id':cid,'source_names':[],'representations':[],'elements':[],'laterality':laterality(r['en'])})
        for key,val in [('source_names',r['en']),('representations',rid)]:
            if val not in c[key]:c[key].append(val)
    links=[]
    for r in rows(relations,['parent id','parent name','child id','child name']):
        links.append({'parent':r['parent id'],'child':r['child id']})
    for r in rows(elements,['concept id','name','element file id']):
        cid,eid=r['concept id'],r['element file id']
        if cid not in concepts:raise ValueError('Compound references unknown concept')
        if not re.fullmatch(r'[A-Z]+\d+M?',eid):raise ValueError('Invalid element identity')
        if eid not in concepts[cid]['elements']:concepts[cid]['elements'].append(eid)
    for c in concepts.values():c['elements'].sort()
    return {'tree':tree,'concepts':concepts,'relations':links}

def merge_catalogues(catalogues,geometry_ids):
    concepts={};links=[]
    for cat in catalogues:
        for cid,c in cat['concepts'].items():
            merged=concepts.setdefault(cid,{'id':cid,'source_names':[],'representations':[],'elements':[],'trees':[],'memberships':{},'laterality':c['laterality']})
            merged['trees'].append(cat['tree'])
            merged['memberships'][cat['tree']]={key:list(c[key]) for key in ('representations','elements')}
            for key in ('source_names','representations','elements'):merged[key]=sorted(set(merged[key]+c[key]))
        links.extend(dict(link,type=cat['tree']) for link in cat['relations'])
    elements={eid:{'id':eid,'concept_ids':[],'availability':'available' if eid in geometry_ids else 'missing'} for eid in geometry_ids}
    for cid,c in concepts.items():
        c['missing_elements']=sorted(set(c['elements'])-geometry_ids)
        c['availability']='unmapped' if not c['elements'] else 'missing' if len(c['missing_elements'])==len(c['elements']) else 'partial' if c['missing_elements'] else 'available'
        for eid in c['elements']:elements.setdefault(eid,{'id':eid,'concept_ids':[],'availability':'available' if eid in geometry_ids else 'missing'})['concept_ids'].append(cid)
    for e in elements.values():e['concept_ids'].sort()
    return {'concepts':concepts,'elements':elements,'relations':links}

def load_metadata(directory,geometry_ids):
    cats=[parse_catalogue(t,*[(directory/f'{t}_{n}').read_text() for n in ('parts_list_e.txt','inclusion_relation_list.txt','element_parts.txt')]) for t in ('isa','partof')]
    return merge_catalogues(cats,geometry_ids)
