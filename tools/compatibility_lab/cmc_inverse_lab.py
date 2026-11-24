"""Read-only CMC inverse experiment using tables from the pinned FBNeo source.
No encrypted output is accepted unless all reference CRCs/sizes and inverse SHA match.
"""
import re,hashlib,zipfile,zlib
import numpy as np
from app import compatibility as c
from app.rom_layouts import role as chip_role
SOURCE=c.ROOT/'work/recovery-build/FBNeo/src/burn/drv/neogeo/neo_decrypt.cpp'

def tables(family):
 frozen=c.load(c.ROOT/'tools/compatibility_lab/cmc_tables_v014.json')
 if SOURCE.is_file() and c.sha(SOURCE)!=frozen['source_sha256']:raise ValueError('Pinned CMC source changed')
 return {name:np.array(values,dtype=np.uint8) for name,values in frozen['tables'][str(family)].items()}

def transform(data,family,extra_xor,inverse=False):
 if len(data)%4 or len(data)>0x4000000:raise ValueError('Only complete <=64 MiB cart graphics domains supported')
 t=tables(family);n=len(data)//4;i=np.arange(n,dtype=np.uint32);base=i.copy();base^=t['address_0_7_xor'][(base>>8)&255];base^=t['address_16_23_xor2'][(base>>8)&255].astype(np.uint32)<<16;base^=t['address_16_23_xor1'][base&255].astype(np.uint32)<<16
 clamp=1<<(n.bit_length()-1);base=np.where(i<clamp,base&(clamp-1),clamp+(base&((clamp>>1)-1))).astype(np.uint32)
 base^=t['address_8_15_xor2'][base&255].astype(np.uint32)<<8;base^=t['address_8_15_xor1'][(base>>16)&255].astype(np.uint32)<<8;base^=extra_xor
 if int(base.max())>=n:raise ValueError('Address permutation outside domain')
 # The source processes 4 MiB blocks; their word offsets have zero low 16 bits,
 # so the data table indices below are identical for the complete domain.
 source=np.frombuffer(data,dtype=np.uint8).reshape(-1,4);work=source[base].copy() if inverse else source.copy()
 for a,b,hi,lo,one,flip in [(0,3,'type0_t03','type0_t12','type1_t03',(i>>8)&1),(1,2,'type0_t12','type0_t03','type1_t12',((i>>16)^t['address_16_23_xor2'][(i>>8)&255])&1)]:
  temp=t[one][(i&255)^t['address_0_7_xor'][(i>>8)&255]];xor0=(t[hi][(i>>8)&255]&254)|(temp&1);xor1=(temp&254)|(t[lo][(i>>8)&255]&1);first=work[:,a].copy();second=work[:,b].copy()
  if inverse:work[:,a]=np.where(flip,second^xor1,first^xor0);work[:,b]=np.where(flip,first^xor0,second^xor1)
  else:work[:,a]=np.where(flip,second,first)^xor0;work[:,b]=np.where(flip,first,second)^xor1
 if inverse:return work.tobytes()
 result=np.empty_like(work);result[base]=work;return result.tobytes()

def experiment(name='bangbead.zip',family=42,key=0x03):
 with zipfile.ZipFile(c.catalog.pick_rom(name)) as z:
  names=sorted(n for n in z.namelist() if re.search(r'-c\d+\.',n));members=[z.read(n) for n in names]
 raw=bytearray()
 for a,b in zip(members[::2],members[1::2]):
  if len(a)!=len(b):raise ValueError('Unequal C chip pair')
  pair=bytearray(len(a)*2);pair[::2]=a;pair[1::2]=b;raw.extend(pair)
 encrypted=transform(raw,family,key,True);recovered=transform(encrypted,family,key,False);assert hashlib.sha256(recovered).digest()==hashlib.sha256(raw).digest()
 db=c.load(c.REPORTS/'fbneo_driver_database_v014.json');d=next(d for d in db['drivers'] if d['short_name']==name[:-4]);expected=[m for m in d['members'] if chip_role(m['name'])=='c' and not m['type']&c.BIOS];output=[];offset=0
 for first,second in zip(expected[::2],expected[1::2]):
  n=first['size'];pair=encrypted[offset:offset+n*2];offset+=n*2
  for m,part in [(first,pair[::2]),(second,pair[1::2])]:output.append({'name':m['name'],'size':len(part),'expected_size':m['size'],'crc32':f'{zlib.crc32(part):08x}','expected_crc32':m['crc32'],'match':len(part)==m['size'] and f'{zlib.crc32(part):08x}'==m['crc32'],'sha256':hashlib.sha256(part).hexdigest()})
 report={'filename':name,'family':family,'extra_xor':key,'source_sha256':c.sha(SOURCE),'inverse_sha256':hashlib.sha256(recovered).hexdigest(),'original_interleaved_sha256':hashlib.sha256(raw).hexdigest(),'inverse_pass':True,'all_crc_match':all(m['match'] for m in output),'members':output,'output_written':False};c.save(c.REPORTS/('cmc_inverse_'+name+'.json'),report);print(report)
if __name__=='__main__':experiment()


from functools import lru_cache
@lru_cache(maxsize=1)
def derive_archive(name,family,key,archive_sha256):
 path=c.catalog.pick_rom(name)
 if c.sha(path)!=archive_sha256:raise ValueError('CMC source archive changed')
 with zipfile.ZipFile(path) as z:
  names=sorted((n for n in z.namelist() if re.search(r'-c\d+\.',n)),key=lambda n:int(re.search(r'-c(\d+)',n)[1]));members=[z.read(n) for n in names]
 if not members or len(members)%2:raise ValueError('Incomplete C chip pairs')
 raw=bytearray()
 for a,b in zip(members[::2],members[1::2]):
  if len(a)!=len(b):raise ValueError('Unequal C chips')
  pair=bytearray(len(a)*2);pair[::2]=a;pair[1::2]=b;raw.extend(pair)
 encrypted=transform(raw,family,key,True);recovered=transform(encrypted,family,key,False)
 if hashlib.sha256(recovered).digest()!=hashlib.sha256(raw).digest():raise ValueError('CMC inverse group SHA mismatch')
 proof=[];offset=0
 for i in range(0,len(members),2):
  n=len(members[i]);pair=recovered[offset:offset+n*2];offset+=n*2
  for lane in (0,1):
   actual=hashlib.sha256(pair[lane::2]).hexdigest();before=hashlib.sha256(members[i+lane]).hexdigest()
   if actual!=before:raise ValueError('CMC inverse member SHA mismatch')
   proof.append({'name':names[i+lane],'size':n,'sha256_before':before,'sha256_reconstructed':actual})
 return encrypted,proof

def discover_cmc():
 # Corrected keys are documented in the pinned source NeoCMCGetExtraXor.
 keys42={'bangbead':0x03,'ganryu':0xfc,'garou':0xfd,'mslug3':0x56,'nitd':0x04,'preisle2':0x64,'sengoku3':0x05,'s1945p':0xfe,'kof99':0xfb,'zupapa':0x46}
 keys50={'jockeygp':0xf0,'matrim':0x36,'mslug4':0x6d,'mslug5':0x45,'pnyaa':0x72,'rotd':0x63,'samsho5':0x53,'samsh5sp':0x51,'kof2000':0x5c,'kof2001':0x42,'kof2002':0xb0,'kof2003':0xc1}
 db={d['short_name']:d for d in c.load(c.REPORTS/'fbneo_driver_database_v014.json')['drivers']};archives={a['filename']:a for a in c.load(c.REPORTS/'rom_library_manifest_v014.json')['archives']};matrix=c.load(c.REPORTS/'game_boot_matrix_v014.json') or {'games':[dict(g,boot_status='NOT VERIFIED') for g in c.load(c.REPORTS/'rom_compatibility_static_v014.json')['games']]};previous=c.load(c.REPORTS/'cmc_repairs_v014.json',{'archives':{}});experiments=[]
 for game in matrix['games']:
  short=game['filename'][:-4]
  if game['boot_status']=='PASS':continue
  reference=short
  if reference not in keys42 and reference not in keys50:
   chip=next((re.match(r'^(\d{3})d?-c1',x['name']) for x in archives[game['filename']]['members'] if re.match(r'^(\d{3})d?-c1',x['name'])),None)
   reference={'251':'kof99','252':'ganryu','253':'garou','254':'s1945p','255':'preisle2','256':'mslug3','257':'kof2000','259':'bangbead','260':'nitd','261':'sengoku3','262':'kof2001','263':'mslug4','264':'rotd','265':'kof2002','267':'pnyaa','268':'mslug5','269':'svc','270':'samsho5','271':'kof2003','272':'samsh5sp','070':'zupapa','008':'jockeygp'}.get(chip[1] if chip else '')
  if reference=='svc':keys50['svc']=0x0b
  if reference not in keys42 and reference not in keys50 or reference not in db:continue
  short=reference
  family=42 if short in keys42 else 50;key=(keys42 if family==42 else keys50)[short];a=archives[game['filename']];expected=[m for m in db[short]['members'] if chip_role(m['name'])=='c' and not m['type']&c.BIOS]
  try:
   encrypted,proof=derive_archive(a['filename'],family,key,a['sha256'])
   if sum(m['size'] for m in expected)!=len(encrypted):raise ValueError('Graphics domain size differs from reference')
   solutions=[];offset=0
   for i in range(0,len(expected),2):
    n=expected[i]['size']
    for lane in (0,1):
     m=expected[i+lane];part=encrypted[offset+lane:offset+n*2:2];crc=f'{zlib.crc32(part):08x}'
     if len(part)!=m['size'] or crc!=m['crc32']:raise ValueError('Reference CRC mismatch '+m['name']+' actual '+crc)
     solutions.append({'archive':a['filename'],'name':proof[0]['name'],'size':len(part),'crc32':crc,'sha256':hashlib.sha256(part).hexdigest(),'transform':{'kind':'cmc','family':family,'key':key,'archive_sha256':a['sha256'],'domain_start':offset+lane,'output_size':n,'inverse_pass':True,'sources':proof,'source_definition_sha256':c.load(c.ROOT/'tools/compatibility_lab/cmc_tables_v014.json')['source_sha256']}})
    offset+=n*2
   preserved=[v for v in previous['archives'].get(a['filename'],{}).get('solutions',[]) if v.get('transform',{}).get('kind')!='cmc'];previous['archives'][a['filename']]={'source_sha256':a['sha256'],'core_sha256':c.sha(c.CORE),'solutions':solutions+preserved};experiments.append({'filename':a['filename'],'status':'PASS_REFERENCE_AND_INVERSE','members':len(solutions)});print('[CMC PASS]',a['filename'],flush=True)
  except ValueError as error:experiments.append({'filename':a['filename'],'status':'NOT_MATCHED','reason':str(error)});print('[CMC NOT MATCHED]',a['filename'],error,flush=True)
  previous['experiments']=experiments;previous['core_sha256']=c.sha(c.CORE);c.save(c.REPORTS/'cmc_repairs_v014.json',previous)
 return previous

def m1_transform(data,inverse=False):
 if len(data)%65536 or not 65536<=len(data)<=524288:raise ValueError('Unsupported complete M1 chip size')
 defs=c.load(c.ROOT/'tools/compatibility_lab/cmc_tables_v014.json')['m1'];t0=np.array(defs['m1_address_0_7_xor'],dtype=np.uint32);t8=np.array(defs['m1_address_8_15_xor'],dtype=np.uint32);p=np.array(defs['p1'],dtype=np.uint32)
 def swap(value,order):
  out=np.zeros_like(value,dtype=np.uint32)
  for bit,source in enumerate(reversed(order)):out|=((value>>source)&1)<<bit
  return out
 original=np.frombuffer(data,dtype=np.uint8);key=int(original[:65536].sum(dtype=np.uint64))&65535;i=np.arange(len(data),dtype=np.uint32);block=(i>>16)&7;aux=(i&65535)^int(swap(np.array(key,dtype=np.uint32),[12,0,2,4,8,15,7,13,10,1,3,6,11,9,14,5]));v=np.zeros_like(aux)
 for bit in range(16):v|=((aux>>p[block,bit])&1)<<bit
 aux=v^t0[(v>>8)&255];aux^=t8[aux&255]<<8;aux=swap(aux,[7,15,14,6,5,13,12,4,11,3,10,2,9,1,8,0]);address=(block<<16)|aux
 if len(np.unique(address))!=len(data):raise ValueError('M1 mapping is not bijective')
 if inverse:out=np.empty_like(original);out[address]=original
 else:out=original[address]
 if int(out[:65536].sum(dtype=np.uint64))&65535!=key:raise ValueError('M1 key checksum invariant failed')
 return out.tobytes()

def discover_m1():
 manifest=c.load(c.REPORTS/'rom_library_manifest_v014.json');db=c.load(c.REPORTS/'fbneo_driver_database_v014.json');targets={(m['size'],m['crc32']):m for d in db['drivers'] if d.get('bios')=='neogeo' for m in d['members'] if re.search(r'-m(?:g)?1\.',m['name']) and not m['type']&c.BIOS};matrix={g['filename']:g for g in (c.load(c.REPORTS/'game_boot_matrix_v014.json') or {'games':[dict(g,boot_status='NOT VERIFIED') for g in c.load(c.REPORTS/'rom_compatibility_static_v014.json')['games']]})['games']};report=c.load(c.REPORTS/'cmc_repairs_v014.json');outcomes=[]
 for a in manifest['archives']:
  if a['filename'] not in matrix or matrix[a['filename']]['boot_status']=='PASS':continue
  for member in a['members']:
   if not re.search(r'-m1\.',member['name']) or member['size'] not in [131072,262144,524288]:continue
   with zipfile.ZipFile(c.catalog.pick_rom(a['filename'])) as z:data=z.read(member['name'])
   encrypted=m1_transform(data,True);key=(len(encrypted),f'{zlib.crc32(encrypted):08x}')
   if key not in targets:continue
   recovered=m1_transform(encrypted,False)
   if recovered!=data:raise ValueError('M1 inverse mismatch')
   row=report['archives'].setdefault(a['filename'],{'source_sha256':a['sha256'],'core_sha256':c.sha(c.CORE),'solutions':[]});row['solutions'].append({'archive':a['filename'],'name':member['name'],'size':key[0],'crc32':key[1],'sha256':hashlib.sha256(encrypted).hexdigest(),'transform':{'kind':'m1','source_sha256':member['sha256'],'source_size':member['size'],'inverse_pass':True,'inverse_sha256':hashlib.sha256(recovered).hexdigest()}});outcomes.append({'filename':a['filename'],'source':member['name'],'expected':targets[key]['name'],'crc32':key[1],'inverse_sha256':hashlib.sha256(recovered).hexdigest()});print('[M1 MATCH]',outcomes[-1],flush=True)
 report['m1_experiments']=outcomes;c.save(c.REPORTS/'cmc_repairs_v014.json',report)
