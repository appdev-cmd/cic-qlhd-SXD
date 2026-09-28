import React,{useEffect,useState} from 'react';
import type { Dossier,DossierSummary } from '../../types/appraisal';
import { appraisalService as api } from '../../services/appraisalService';
import { DossierGrid } from './DossierGrid';
import { ReviewModal } from './ReviewModal';
import { EntityLink } from '../ui/EntityLink';
import { DateInput } from '../ui/DateInput';
import { formatDateTime } from '../../lib/utils';
import { useEntityPanel } from '../../hooks/useEntityPanel';

const button='rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-sm text-ink dark:text-ink disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary-500';
const input='mt-1 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-ink dark:text-ink focus:ring-2 focus:ring-primary-500';
const statuses:Record<string,string>={intake:'Tiếp nhận',analyzing:'Đang kiểm tra',analyzed:'Đã kiểm tra',request_supplement:'Yêu cầu bổ sung',reviewed:'Đã rà soát'};
type Form={requestId:string;name:string;legalDate:string;reason:string};

export function SubmissionHistory({dossier:d}:{dossier:Dossier}){
  const {open}=useEntityPanel();
  const [page,setPage]=useState<{items:DossierSummary[];total:number;latestId:string}|null>(null);
  const [offset,setOffset]=useState(0);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [form,setForm]=useState<Form|null>(null);const [initial,setInitial]=useState('');
  useEffect(()=>{let active=true;setPage(null);api.lineage(d.id,offset).then(p=>{if(active)setPage(p);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[d.id,d.revision,offset]);
  const start=()=>{const next={requestId:crypto.randomUUID(),name:`${d.projectName||d.name} · Lần ${1+(d.submissionRound||1)}`.slice(0,300),legalDate:'',reason:''};
    // DateInput accepts ISO dates; use the local calendar date without locale-dependent formatting.
    const today=new Date();next.legalDate=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    setForm(next);setInitial(JSON.stringify(next));setError('');};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!form||busy)return;setBusy(true);setError('');
    try{const next=await api.mutate(d.id,'/supplements',{...form,revision:d.revision});setForm(null);setPage(await api.lineage(d.id,offset));open('dossier',{id:next.id,name:next.name});}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <section className="space-y-3 rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-4 text-ink dark:text-ink">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Các lần nộp hồ sơ {page?`(${page.total})`:''}</h3>
      {page?.latestId===d.id&&<button type="button" className={button+' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white'} disabled={busy||d.job?.status==='running'} onClick={start}>Tạo lần bổ sung</button>}</div>
    {page&&page.latestId!==d.id&&<p className="text-sm text-ink-secondary dark:text-ink-secondary">Lần nộp này đã có lần bổ sung. Tài liệu và kết quả được giữ nguyên để đối chiếu.</p>}
    {error&&!form&&<p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    {page?<><DossierGrid storageKey="submission-lineage" rows={page.items} columns={[
      {label:'Lần nộp',value:r=>r.submissionRound||1,width:90},
      {label:'Hồ sơ',value:r=>r.name,width:320,render:r=><EntityLink type="dossier" id={r.id} name={r.name}/>},
      {label:'Tài liệu',value:r=>r.documentCount||0,width:100},
      {label:'Trạng thái',value:r=>statuses[r.status]||'Đang xử lý',width:150},
      {label:'Ngày tiếp nhận',value:r=>r.createdAt||'',render:r=>r.createdAt?formatDateTime(r.createdAt):'—',width:170},
    ]}/>{page.total>50&&<div className="flex gap-2"><button className={button} disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Trang trước</button><button className={button} disabled={offset+50>=page.total} onClick={()=>setOffset(offset+50)}>Trang sau</button></div>}</>:<p className="text-sm">Đang tải các lần nộp…</p>}
    {form&&<ReviewModal heading="Tạo lần bổ sung" dirty={busy||JSON.stringify(form)!==initial} onClose={()=>{if(!busy)setForm(null);}}>
      <form onSubmit={submit} className="space-y-4"><p className="text-sm text-ink-secondary dark:text-ink-secondary">Lần bổ sung kế thừa dự án và danh mục thành phần. Nộp bộ tài liệu áp dụng cho lần này; chuyên viên sẽ xác nhận dữ liệu và rà soát lại kết quả.</p>
        <label className="block text-sm">Tên lần nộp<input className={input} value={form.name} disabled={busy} minLength={3} maxLength={300} required onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="block text-sm">Ngày đánh giá<DateInput disabled={busy} value={form.legalDate} onChange={legalDate=>setForm({...form,legalDate})}/></label>
        <label className="block text-sm">Nội dung bổ sung<textarea className={input} value={form.reason} disabled={busy} minLength={10} maxLength={3000} required rows={3} onChange={e=>setForm({...form,reason:e.target.value})}/></label>
        {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={busy||!form.legalDate||form.reason.trim().length<10} className={button+' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white'}>{busy?'Đang tạo…':'Tạo lần bổ sung'}</button>
      </form>
    </ReviewModal>}
  </section>;
}
