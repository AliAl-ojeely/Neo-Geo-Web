"""Apply the code-only 0.1.5.1 hotfix; never writes game/core/browser data."""
import argparse,datetime,hashlib,json,re,shutil
from pathlib import Path

PIN='2d2c70daffbc70448dec0516abec37a96486adaf8a2af090de5326b59bce24f9'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def apply(package,root,check=False):
 package=Path(package).resolve();root=Path(root).resolve();manifest=json.loads((package/'hotfix_manifest.json').read_text(encoding='utf-8'))
 if manifest.get('version')!='0.1.5.1':raise ValueError('Not a v0.1.5.1 hotfix')
 if not re.search(r"VERSION\s*=\s*['\"]0\.1\.5(?:\.1)?['\"]",(root/'manage.py').read_text(encoding='utf-8')):raise ValueError('Requires an existing v0.1.5 or v0.1.5.1 project')
 if sha(root/'vendor/fbneo-selected-bios/fbneo-legacy-wasm.data')!=PIN:raise ValueError('Pinned FBNeo core mismatch; core will not be replaced')
 records=[]
 for name,expected in manifest['files'].items():
  rel=Path(name);source=(package/rel).resolve();target=(root/rel).resolve()
  if not source.is_relative_to(package) or not target.is_relative_to(root) or rel.is_absolute() or '..' in rel.parts:raise ValueError('Unsafe hotfix path')
  if not (name in ('manage.py','README.md','upgrade_v0151.py') or name.startswith(('web/','docs/','tests/')) or name in ('app/server.py','app/web_distribution.py')):raise ValueError('Hotfix is not allowed to modify '+name)
  if sha(source)!=expected:raise ValueError('Hotfix checksum mismatch: '+name)
  records.append((name,source,target))
 if check:return {'status':'PASS','files':len(records),'dry_run':True,'core_unchanged':True}
 backup=root/'backups'/('before_hotfix_v0151_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f'));backup.mkdir(parents=True)
 preserved={}
 for name,source,target in records:
  if target.is_file():copy=backup/name;copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,copy);preserved[name]=sha(target)
 (backup/'restore_manifest.json').write_text(json.dumps({'sha256':preserved},indent=2),encoding='utf-8')
 for name,source,target in records:target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 assert sha(root/'vendor/fbneo-selected-bios/fbneo-legacy-wasm.data')==PIN
 return {'status':'PASS','files':len(records),'backup':str(backup),'core_unchanged':True,'config_rom_bios_browser_data_touched':False}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--project',required=True,type=Path);parser.add_argument('--check',action='store_true');args=parser.parse_args()
 try:print(json.dumps(apply(Path(__file__).parent,args.project,args.check),ensure_ascii=False,indent=2))
 except (OSError,ValueError) as e:raise SystemExit(str(e))
