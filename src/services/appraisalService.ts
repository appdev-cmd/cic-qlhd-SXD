import { supabase } from '../lib/supabase';
import type { Dossier, DossierSummary, Health, ModelProvider } from '../types/appraisal';
import {apiRequest,apiResponse,getRuntime,type Page} from './apiClient';

async function request(path:string, body?:unknown, method='GET') {
  return apiResponse(path,{method,body:body!==undefined?JSON.stringify(body):undefined});
}
export const appraisalService={
  page:async(options:Record<string,string|number|undefined>):Promise<Page<DossierSummary>>=>{
    const query=new URLSearchParams();Object.entries(options).forEach(([k,v])=>{if(v!==undefined&&v!==''&&v!=='all')query.set(k,String(v));});
    return apiRequest('/submissions?'+query);
  },
  checkModel:async():Promise<ModelProvider>=>(await request('/model/check',{},'POST')).json(),
  health:async():Promise<Health>=>(await request('/health')).json(),
  list:async(offset=0,scope:{procedure?:string;projectId?:string}={}):Promise<DossierSummary[]>=>{
    const query=new URLSearchParams({offset:String(offset)});
    if(scope.procedure)query.set('procedure',scope.procedure);
    if(scope.projectId)query.set('projectId',scope.projectId);
    return (await request('/cases?'+query)).json();
  },
  get:async(id:string):Promise<Dossier>=>(await request('/cases/'+id)).json(),
  lineage:async(id:string,offset=0):Promise<Page<DossierSummary>&{latestId:string}>=>(await request('/cases/'+id+'/submissions?offset='+offset)).json(),
  legal:async(id:string)=>(await request('/cases/'+id+'/legal')).json(),
  create:async(body:unknown):Promise<Dossier>=>(await request('/cases',body,'POST')).json(),
  sample:async(scenario:string):Promise<Dossier>=>(await request('/samples/'+scenario,{},'POST')).json(),
  mutate:async(id:string,path:string,body:unknown,method='POST'):Promise<Dossier>=>(await request('/cases/'+id+path,body,method)).json(),
  upload:async(d:Dossier,requirementId:string,file:File,role:string)=>{
    if(file.size>18*1024*1024)throw new Error('Giới hạn 18 MB mỗi tệp.');
    const runtime=await getRuntime();
    if(runtime.mode!=='demo'){
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      const sha256=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
      const session=await apiRequest<{id:string;path:string;token:string}>('/cases/'+d.id+'/uploads',{
        method:'POST',body:JSON.stringify({revision:d.revision,requirementId,name:file.name,size:file.size,sha256,role})});
      const {error}=await supabase.storage.from('appraisal-originals').uploadToSignedUrl(session.path,session.token,file,{upsert:false});
      if(error)throw new Error('Tải tệp chưa hoàn tất. Vui lòng thử lại.');
      return appraisalService.mutate(d.id,'/uploads/'+session.id+'/finalize',{});
    }
    const contentBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
    return appraisalService.mutate(d.id,'/documents',{revision:d.revision,requirementId,name:file.name,contentBase64,role});
  },
  blob:async(path:string)=>(await request(path)).blob(),
  download:async(path:string,name:string)=>{const blob=await appraisalService.blob(path);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},
};
