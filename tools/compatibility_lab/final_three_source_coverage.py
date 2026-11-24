import argparse
import collections, hashlib, json, os, tempfile, zipfile, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description="Audit explicitly authorized local sources.")
parser.add_argument("sources", nargs="+", type=Path)
parser.add_argument("--library-roms", required=True, type=Path)
parser.add_argument("--rom-package", required=True, type=Path)
args = parser.parse_args()
roots = [p.resolve() for p in [*args.sources, args.library_roms, args.rom_package.parent]]
db = json.loads((ROOT/'reports/fbneo_driver_database_v014.json').read_text(encoding='utf8'))
games = {'kof99','kof2000','mslug4'}
drivers = [d for d in db['drivers'] if d['short_name'] in games or d.get('parent') in games]
targets = {(m['size'],int(m['crc32'],16)) for d in drivers for m in d['members'] if m['size'] and int(m['crc32'],16)}
sizes = {s for s,_ in targets}
seen = {}
hits = {}
counts = collections.Counter()
errors = []
nonzip = []
limit = 3 * 1024**3

def digest(stream):
    return hashlib.file_digest(stream,'sha256').hexdigest()

def match(data,label):
    key = (len(data),zlib.crc32(data))
    if key in targets:
        sha = hashlib.sha256(data).hexdigest()
        hits.setdefault(sha,dict(size=key[0],crc32=f'{key[1]:08x}',sha1=hashlib.sha1(data).hexdigest(),sources=[]))['sources'].append(label)

def scan_zip(stream,label,depth=0):
    with zipfile.ZipFile(stream) as archive:
        counts['unique_zip_indexes'] += 1
        for info in archive.infolist():
            if info.is_dir():
                continue
            counts['zip_members'] += 1
            name = label+'!'+info.filename
            if info.flag_bits & 1:
                errors.append([name,'encrypted entry'])
                continue
            try:
                with archive.open(info) as member:
                    prefix = member.read(8)
                    if (info.file_size, info.CRC) in targets:
                        match(prefix+member.read(),name)
                    elif prefix.startswith((b'7z\xbc\xaf\x27\x1c',b'Rar!',b'\x1f\x8b',b'MZ')):
                        if prefix.startswith(b'MZ') and info.file_size < 1024*1024:
                            continue
                        nonzip.append([name,prefix[:6].hex()])
                    elif prefix.startswith(b'PK\x03\x04'):
                        if depth >= 4 or info.file_size > limit:
                            errors.append([name,'nested archive limit'])
                            continue
                        with tempfile.SpooledTemporaryFile(max_size=16*1024**2) as child:
                            child.write(prefix)
                            while chunk := member.read(1024**2):
                                child.write(chunk)
                            child.seek(0)
                            sha = digest(child)
                            if sha in seen:
                                counts['duplicate_archives'] += 1
                                continue
                            seen[sha]=name
                            child.seek(0)
                            scan_zip(child,name,depth+1)
            except (OSError,ValueError,RuntimeError,NotImplementedError,zipfile.BadZipFile,zlib.error,EOFError) as exc:
                errors.append([name,str(exc)])

for folder in dict.fromkeys(roots):
    if not folder.is_dir():
        continue
    print('Scanning',folder,flush=True)
    for base, dirs, files in os.walk(folder,followlinks=False):
        dirs[:] = [d for d in dirs if d not in {'.git','node_modules','__pycache__'} and not (Path(base)/d).is_symlink() and not (Path(base)/d).is_junction()]
        for file in files:
            p = Path(base)/file
            if p.is_symlink():
                continue
            counts['files_seen'] += 1
            try:
                with p.open('rb') as stream:
                    size=p.stat().st_size
                    prefix=stream.read(8)
                    if prefix.startswith(b'PK') or p.suffix.lower()=='.zip':
                        stream.seek(0)
                        sha=digest(stream)
                        if sha in seen:
                            counts['duplicate_archives'] += 1
                            continue
                        seen[sha]=str(p)
                        scan_zip(stream,str(p))
                    elif prefix.startswith((b'7z\xbc\xaf\x27\x1c',b'Rar!',b'\x1f\x8b',b'MZ')) and size>=1024*1024:
                        nonzip.append([str(p),prefix[:6].hex()])
                    elif size in sizes:
                        counts['loose_candidates'] += 1
                        match(prefix+stream.read(),str(p))
            except (OSError,ValueError,RuntimeError,NotImplementedError,zipfile.BadZipFile,zlib.error,EOFError) as exc:
                errors.append([str(p),str(exc)])
main=args.library_roms
with zipfile.ZipFile(args.rom_package) as z:
    packaged={Path(n).name for n in z.namelist() if n.startswith('ROMs/')}
local={p.name for p in main.glob('*.zip')}
found={(v['size'],v['crc32']) for v in hits.values()}
rows=[]
for d in drivers:
    missing=[m['name'] for m in d['members'] if m['size'] and int(m['crc32'],16) and not m['type'] & ((1<<25) | (1<<27) | (1<<28)) and (m['size'],m['crc32']) not in found]
    rows.append(dict(driver=d['short_name'],parent=d.get('parent'),missing=missing))
out=dict(roots=[str(p) for p in dict.fromkeys(roots)],counts=dict(counts),archive_sha256_index=seen,errors=errors,unexpanded_formats=nonzip,
         counts_reconciliation=dict(main=len(local),package=len(packaged),both=len(local&packaged),package_only=sorted(packaged-local),main_only=sorted(local-packaged)),
         signature_hits=list(hits.values()),driver_screen=rows)
(ROOT/'reports/FINAL_THREE_SOURCE_COVERAGE.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print(out['counts_reconciliation'],dict(counts),len(errors),len(nonzip),flush=True)
