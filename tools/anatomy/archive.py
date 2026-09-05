"""Fail-closed archive inspection before any extraction; source assets are data only."""
import zipfile,pathlib,stat,re,json,argparse
MAX_TOTAL=2*1024**3

def inspect_archive(path):
    entries=[];seen=set();ids=set();total=0
    with zipfile.ZipFile(path) as z:
        if len(z.infolist())>15000:raise ValueError('Archive entry cap')
        for i in z.infolist():
            p=pathlib.PurePosixPath(i.filename);mode=i.external_attr>>16
            if p.is_absolute() or '..' in p.parts or '\\' in i.filename or ':' in i.filename or i.filename in seen:raise ValueError('Unsafe or duplicate archive path')
            seen.add(i.filename)
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) and not stat.S_ISREG(mode) and not stat.S_ISDIR(mode)):raise ValueError('Archive special file')
            if i.is_dir():continue
            if p.suffix.lower() not in ('.obj','.mtl','.txt'):raise ValueError('Unexpected archive file type')
            if i.file_size>64*1024**2:raise ValueError('Entry size cap')
            total+=i.file_size
            if total>MAX_TOTAL:raise ValueError('Expanded archive cap')
            if p.suffix.lower()=='.obj':
                if not re.fullmatch(r'[A-Z]+\d+M?',p.stem) or p.stem in ids:raise ValueError('Duplicate or invalid element')
                ids.add(p.stem)
            entries.append({'path':i.filename,'bytes':i.file_size,'compressed_bytes':i.compress_size})
    return {'entries':entries,'obj_count':len(ids),'element_ids':sorted(ids),'expanded_bytes':total}

def extract(path,destination):
    report=inspect_archive(path)
    destination.mkdir(parents=True,exist_ok=False)
    with zipfile.ZipFile(path) as z:
        for e in report['entries']:
            target=destination/e['path'];target.parent.mkdir(parents=True,exist_ok=True)
            with z.open(e['path']) as src,target.open('xb') as dst:
                while block:=src.read(1024*1024):dst.write(block)
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archive',type=pathlib.Path);parser.add_argument('--extract',type=pathlib.Path);a=parser.parse_args();r=extract(a.archive,a.extract) if a.extract else inspect_archive(a.archive);print(json.dumps(r,indent=2))
