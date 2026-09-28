import React,{useEffect,useState} from 'react';
import {apiRequest,type Page} from '../../services/apiClient';
import {DossierGrid} from './DossierGrid';
import {EntityLink} from '../ui/EntityLink';
import {formatDateTime} from '../../lib/utils';

interface AuditEvent{id:string;at:string;actor:string;action:string;detail:string;caseId:string|null;caseName:string}
export function AuditHistoryTab({projectId}:{projectId:string}){
  const [page,setPage]=useState(0);const [result,setResult]=useState<Page<AuditEvent>|null>(null);const [error,setError]=useState('');
  useEffect(()=>{let current=true;
    apiRequest<Page<AuditEvent>>('/projects/'+encodeURIComponent(projectId)+'/audit?offset='+page*50+'&limit=50').then(data=>{if(current){setResult(data);setError('');}}).catch(e=>{if(current)setError(e.message);});
    return()=>{current=false;};},[projectId,page]);
  const button='rounded-lg border border-border dark:border-border p-2 text-ink dark:text-ink disabled:opacity-50';
  return <section className="space-y-4 text-sm text-ink dark:text-ink">
    <h3 className="font-semibold">Lịch sử dự án và hồ sơ</h3>
    {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    <DossierGrid storageKey="project-submission-audit" rows={result?.items||[]} columns={[
      {label:'Thời gian',value:r=>r.at,render:r=>formatDateTime(r.at),width:170},
      {label:'Hồ sơ / Dự án',value:r=>r.caseName,render:r=><EntityLink type={r.caseId?'dossier':'project'} id={r.caseId||projectId} name={r.caseName}/>,width:320},
      {label:'Người thực hiện',value:r=>r.actor,width:180},
      {label:'Thao tác',value:r=>r.action,width:220},
      {label:'Nội dung',value:r=>r.detail,width:400},
    ]}/>
    <div className="flex items-center gap-3"><button className={button} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Trang trước</button><span>{result?.total??0} sự kiện · Trang {page+1} · sắp xếp trong trang</span><button className={button} disabled={!result||(page+1)*50>=result.total} onClick={()=>setPage(p=>p+1)}>Trang sau</button></div>
  </section>;
}
