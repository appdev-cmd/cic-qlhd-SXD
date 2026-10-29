"""Copy a source BIM project with original IFC, Fragments and paginated elements; credentials stay in memory."""
import argparse,hashlib,json,os,re,time,zipfile,sys
from pathlib import Path
from urllib.parse import quote
import httpx
import threading
from concurrent.futures import ThreadPoolExecutor
from verify_schema import load_environment

ROOT=Path(__file__).resolve().parents[1]
def env_file(path):
 result={}
 for line in path.read_text(encoding='utf-8-sig').splitlines():
  m=re.match(r'^([A-Z_0-9]+)=(.*)$',line)
  if m:result[m[1]]=m[2].strip().strip('"\'')
 return result

def main():
 if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
 parser=argparse.ArgumentParser();parser.add_argument('--source-env',type=Path,required=True)
 args=parser.parse_args();cfg=env_file(args.source_env);load_environment()
 folder=ROOT/'.appraisal-data/imported-bim/qa-si-xd';folder.mkdir(parents=True,exist_ok=True)
 source_url=cfg['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
 if 'fgfsraukrlklhqdpgqra' not in source_url:raise RuntimeError('Unexpected source project')
 client=httpx.Client(timeout=120)
 def call(url,method='GET',**kwargs):
  for attempt in range(4):
   try:
    response=client.request(method,url,**kwargs)
    if response.status_code>=500 and attempt<3:time.sleep(attempt+1);continue
    if response.status_code>=400:raise RuntimeError(f'{method} failed ({response.status_code}): '+response.text[:350])
    return response
   except (httpx.TimeoutException,httpx.NetworkError):
    if attempt==3:raise
    time.sleep(attempt+1)
 # The source's local test account does not own these models. Obtain a server-only
 # read credential through the configured project administrator; never persist it.
 keys=call('https://api.supabase.com/v1/projects/fgfsraukrlklhqdpgqra/api-keys?reveal=true',headers={'Authorization':'Bearer '+cfg['SUPABASE_ACCESS_TOKEN']}).json()
 source_key=next(k['api_key'] for k in keys if k.get('name')=='service_role')
 sh={'apikey':source_key,'Authorization':'Bearer '+source_key}
 destination_url=os.environ.get('SUPABASE_URL',os.environ.get('VITE_SUPABASE_URL')).rstrip('/')
 destination_key=os.environ.get('SUPABASE_ANON_KEY',os.environ.get('VITE_SUPABASE_ANON_KEY'))
 token=call('http://127.0.0.1:8208/api/appraisal/test-login','POST',json={'role':'admin'}).json()['access_token']
 dh={'apikey':destination_key,'Authorization':'Bearer '+token}
 def rpc(name,data):return call(destination_url+'/rest/v1/rpc/'+name,'POST',headers=dh,json=data).json()
 workspace=rpc('sxd_bim_import_project',{'p_code':'BIM-QA-NOXH-HVT','p_name':'Mô hình BIM NOXH HVT'})
 project=workspace['id']
 manifest_path=folder/'transfer.json'
 manifest=json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'source':'qa-si-xd','targetProjectId':workspace['targetProjectId'],'bimProjectId':project,'models':{}}
 lock=threading.Lock()
 def persist():
  with lock:manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 models=call(source_url+'/rest/v1/bim_models',headers=sh,params={'project_id':'eq.6ecc14fe-fc1a-4ef3-b320-20c537eb8ce8','deleted_at':'is.null','status':'eq.ready','select':'id,file_name,file_size,discipline,phien_ban,ifc_path,frag_path,element_count,file_hash,georef,toa_do_offset','order':'created_at','limit':'1000'}).json()
 print('Found',len(models),'source models; target workspace',workspace['name'],flush=True)
 def process(entry):
  index,m=entry
  state=manifest['models'].setdefault(m['id'],{'name':m['file_name']})
  if state.get('ready'):print(f"[{index+1}/{len(models)}] Already copied {m['file_name']}",flush=True);return
  print(f"[{index+1}/{len(models)}] Copying {m['file_name']}",flush=True)
  target_id=state.get('targetId',m['id'])
  if state.get('targetId'):
   current=call(destination_url+'/rest/v1/bim_models',headers=dh,params={'id':'eq.'+target_id,'select':'status,element_count,ma_job','limit':'1'}).json()[0]
   if current['status']=='ready' and current['element_count']==m['element_count']:
    state.update(ready=True,elements=current['element_count']);persist();print('  Verified ready',flush=True);return
   if current.get('ma_job') and current['ma_job']!=state.get('job'):
    rpc('bim_browser_fail_conversion',{'p_model':target_id,'p_job':current['ma_job'],'p_error':'Tiếp tục chuyển bộ dữ liệu từ qa-si-xd','p_kind':'transient'})
    state['job']=None;persist()
  paths={}
  for kind in ('ifc','frag'):
   origin=m[kind+'_path'];suffix='.ifczip' if kind=='ifc' and origin.endswith('.ifczip') else '.'+kind
   local=folder/(m['id']+suffix)
   if not local.exists():
    data=call(source_url+'/storage/v1/object/authenticated/bim-models/'+quote(origin,safe='/'),headers=sh).content
    local.write_bytes(data)
   data=local.read_bytes();digest=hashlib.sha256(data).hexdigest()
   destination=('models' if kind=='ifc' else 'frags')+'/'+project+'/'+(m['id'] if kind=='ifc' else target_id)+suffix
   if not state.get(kind+'_uploaded'):
    call(destination_url+'/storage/v1/object/bim-models/'+destination,'POST',headers={**dh,'Content-Type':'application/octet-stream','x-upsert':'true'},content=data)
    state[kind+'_uploaded']=True;state[kind+'_sha256']=digest;persist()
   paths[kind+'_path']=destination
   if kind=='ifc' and not state.get('targetId'):
    row=rpc('bim_register_model_upload',{'p_project':project,'p_ifc_path':destination,'p_file_name':m['file_name'],'p_file_size':m['file_size'],'p_file_hash':m['file_hash'],'p_discipline':m['discipline'],'p_uploaded_by':'Chuyển từ qa-si-xd'})
    state['targetId']=row['id'];target_id=row['id'];persist()
   if kind=='ifc':
    original_folder=folder/'ifc';original_folder.mkdir(exist_ok=True)
    original=original_folder/m['file_name']
    if not original.exists():
     if suffix=='.ifczip':
      with zipfile.ZipFile(local) as archive:
       entry=next(f for f in archive.infolist() if f.filename.lower().endswith('.ifc'))
       original.write_bytes(archive.read(entry))
     else:original.write_bytes(data)
  if not state.get('job'):
   state['job']=rpc('bim_browser_claim_conversion',{'p_model':target_id});persist()
  if not state['job']:
   # A viewer may have converted the newly registered IFC while the transfer was
   # downloading its prepared Fragments. Never overwrite that active lease.
   for attempt in range(24):
    current=call(destination_url+'/rest/v1/bim_models',headers=dh,params={'id':'eq.'+target_id,'select':'status,element_count','limit':'1'}).json()[0]
    if current['status']=='ready':break
    time.sleep(5)
   if current['status']=='ready' and current['element_count']==m['element_count']:
    state.update(ready=True,elements=current['element_count']);persist();print('  Ready (verified concurrent conversion)',flush=True);return
   state['job']=rpc('bim_browser_claim_conversion',{'p_model':target_id});persist()
   if not state['job']:raise RuntimeError('A conversion is still active; run again to resume safely.')
  total=0
  for offset in range(0,m['element_count']+1000,1000):
   rows=call(source_url+'/rest/v1/bim_elements',headers=sh,params={'model_id':'eq.'+m['id'],'select':'express_id,global_id,ten_cau_kien,loai_cau_kien,phan_doan_tang,parent_express_id,vat_lieu,the_tich_be_tong,dien_tich,dien_tich_van_khuon,chieu_dai,trong_luong,nguon_khoi_luong,thuoc_tinh,hash_noi_dung','order':'express_id','offset':str(offset),'limit':'1000'}).json()
   if not rows:break
   rpc('bim_browser_stage_elements',{'p_model':target_id,'p_job':state['job'],'p_elements':rows,'p_progress':min(95,int((offset+len(rows))/max(1,m['element_count'])*90))})
   total+=len(rows)
  if total!=m['element_count']:raise RuntimeError(f'Element count mismatch: {total} versus {m["element_count"]}')
  rpc('bim_browser_complete_conversion',{'p_model':target_id,'p_job':state['job'],'p_patch':{**paths,'element_count':total,'ifc_schema':'IFC','thong_tin_mo_rong':{'source':'qa-si-xd','original_file_name':m['file_name']}}})
  state.update(ready=True,elements=total);persist()
  print('  Ready:',total,'elements',flush=True)
 with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(process,enumerate(models)))
 print('Completed',len(models),'models;',sum(v.get('elements',0) for v in manifest['models'].values()),'elements',flush=True)
if __name__=='__main__':main()
