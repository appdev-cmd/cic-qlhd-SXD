import { resolve } from 'node:path';
import { probePort } from './runtime_ports.mjs';
import { loadEnvironment } from './environment.mjs';
import configuredPorts from '../config/runtime-ports.json' with {type:'json'};
loadEnvironment(resolve(import.meta.dirname,'..'));
const mode=process.env.APPRAISAL_MODE||'demo';
const missing=[];
if(['cloud','supabase'].includes(mode)) {
  if(!process.env.APPRAISAL_DATABASE_URL)missing.push('APPRAISAL_DATABASE_URL');
  if(!(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL))missing.push('SUPABASE_URL');
  if(!(process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY))missing.push('SUPABASE_ANON_KEY');
}
const ports=await Promise.all(Object.entries(configuredPorts).map(async([service,port])=>({service,...await probePort(port)})));
let gateway={ready:false,url:`http://localhost:${configuredPorts.web}/api/appraisal/runtime`};
try {
  const response=await fetch(`http://127.0.0.1:${configuredPorts.web}/api/appraisal/runtime`,{signal:AbortSignal.timeout(3000)});
  const body=await response.json();
  gateway={...gateway,ready:response.ok&&['cloud','demo'].includes(body.mode)&&typeof body.authenticationRequired==='boolean'};
}catch{}
console.log(JSON.stringify({mode,missing,modelConfigured:Boolean(process.env.AI_PROVIDER==='vertex'?process.env.VERTEX_PROJECT_ID&&process.env.VERTEX_SA_KEY_PATH:process.env.OPENAI_MODEL&&process.env.OPENAI_API_KEY),gateway,ports},null,2));
console.log(gateway.ready?'Web/API đang hoạt động. Không cần khởi động thêm phiên.':'Web/API chưa sẵn sàng. Nếu cổng trống, chạy pnpm dev. Nếu cổng bị chiếm, kiểm tra phiên đang chạy.');
if(missing.length||ports.some(p=>p.code==='EACCES'))process.exitCode=1;
