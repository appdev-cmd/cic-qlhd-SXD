import { supabase } from '../lib/supabase';
export class ApiError extends Error {constructor(message:string,public readonly status:number){super(message);this.name='ApiError';}}
export async function apiResponse(path:string,init:RequestInit={}):Promise<Response>{
  const {data}=await supabase.auth.getSession();
  const headers=new Headers(init.headers);if(!headers.has('Content-Type')&&init.body)headers.set('Content-Type','application/json');
  if(data.session)headers.set('Authorization','Bearer '+data.session.access_token);
  let response:Response;
  try {response=await fetch('/api/appraisal'+path,{...init,headers,signal:init.signal||AbortSignal.timeout(120_000)});}
  catch(error){if(init.signal?.aborted)throw error;throw new ApiError('Không kết nối được Core API. Kiểm tra dịch vụ hoặc thử lại.',503);}
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new ApiError(typeof body.detail==='string'?body.detail:response.status>=500?'Dịch vụ đang khởi động hoặc mất kết nối. Vui lòng thử kết nối lại.':'Dữ liệu chưa hợp lệ hoặc không thể tải. Vui lòng thử lại.',response.status);}
  if(init.method&&!['GET','HEAD'].includes(init.method.toUpperCase()))window.dispatchEvent(new Event('appraisal:changed'));
  return response;
}
export async function apiRequest<T>(path:string,init:RequestInit={}):Promise<T>{return (await apiResponse(path,init)).json();}
export interface Runtime {mode:'demo'|'cloud';environment:string;authenticationRequired:boolean}
let runtimePromise:Promise<Runtime>|null=null,runtimeUntil=0;
export function getRuntime(){if(!runtimePromise||Date.now()>runtimeUntil){runtimeUntil=Date.now()+10_000;runtimePromise=apiRequest<Runtime>('/runtime').catch(error=>{runtimePromise=null;throw error;});}return runtimePromise;}
window.addEventListener('appraisal:session-changed',()=>{runtimePromise=null;});
export interface Page<T>{items:T[];total:number;offset:number;limit:number}
