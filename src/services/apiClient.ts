import { supabase } from '../lib/supabase';
export async function apiRequest<T>(path:string,init:RequestInit={}):Promise<T>{
  const {data}=await supabase.auth.getSession();
  const response=await fetch('/api/appraisal'+path,{...init,headers:{'Content-Type':'application/json',
    ...(data.session?{Authorization:'Bearer '+data.session.access_token}:{}),...init.headers}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(typeof body.detail==='string'?body.detail:'Không thể tải dữ liệu. Vui lòng thử lại.');}
  return response.json();
}
export interface Page<T>{items:T[];total:number;offset:number;limit:number}
