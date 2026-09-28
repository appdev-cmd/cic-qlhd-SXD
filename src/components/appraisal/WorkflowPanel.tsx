import React,{useEffect,useState} from 'react';
import type {Dossier} from '../../types/appraisal';
import {apiRequest} from '../../services/apiClient';
import {appraisalService} from '../../services/appraisalService';
import {ReviewModal} from './ReviewModal';
import {SearchableSelect} from '../ui/SearchableSelect';
import {DateInput} from '../ui/DateInput';
import {DossierGrid} from './DossierGrid';
import {formatDate,formatDateTime} from '../../lib/utils';
import {SlaSummary} from './SlaBadge';
type Info={state:string;label:string;actions:{id:string;label:string}[];canAssign:boolean;canReopen:boolean;reviewers:{id:string;full_name:string;role:string}[];workflow:{assigneeName?:string;deadline?:string;deadlineBasis?:string;visitDate?:string;history?:{action:string;actor:string;at:string;note:string}[]}};
const button='rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-sm text-ink dark:text-ink disabled:opacity-50';
export function WorkflowPanel({dossier:d,onChange}:{dossier:Dossier;onChange:(d:Dossier)=>void}){
  const [info,setInfo]=useState<Info|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [modal,setModal]=useState<{id:string;label:string}|null>(null);
  const [form,setForm]=useState({note:'',assigneeId:'',deadline:'',visitDate:''});const [initial,setInitial]=useState('');const [history,setHistory]=useState(false);
  useEffect(()=>{let live=true;setError('');apiRequest<Info>('/cases/'+d.id+'/workflow').then(r=>{if(live)setInfo(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[d.id,d.revision]);
  const open=(item:{id:string;label:string})=>{const f={note:'',assigneeId:'',deadline:info?.workflow.deadline||'',visitDate:info?.workflow.visitDate||''};setForm(f);setInitial(JSON.stringify(f));setModal(item);};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!modal)return;setBusy(true);setError('');try{
    const body=modal.id==='assign'?{assigneeId:form.assigneeId,deadline:form.deadline||null,note:form.note}:{action:modal.id,note:form.note,visitDate:modal.id==='schedule_visit'?form.visitDate||null:null};
    onChange(await appraisalService.mutate(d.id,modal.id==='assign'?'/assignment':modal.id==='reopen'?'/reopen':'/workflow',{revision:d.revision,...(modal.id==='reopen'?{note:form.note}:body)}));setModal(null);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <section className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-4 space-y-3 text-ink dark:text-ink"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">Quy trình xử lý · {info?.label||'Đang tải…'}</h3><button className={button} onClick={()=>setHistory(!history)}>{history?'Ẩn lịch sử':'Lịch sử quy trình'}</button></div>
    <div className="flex flex-wrap gap-4 text-sm text-ink-muted dark:text-ink-muted"><p>Phụ trách: {info?.workflow.assigneeName||'Chưa phân công'}</p><p>Hạn nội bộ: {info?.workflow.deadline?formatDate(info.workflow.deadline):'Chưa xác nhận'}</p>{info?.workflow.visitDate&&<p>Kiểm tra hiện trường: {formatDate(info.workflow.visitDate)}</p>}</div>
    <SlaSummary facts={d.sla} state={d.slaState}/>
    {info?.workflow.deadlineBasis&&<p className="text-xs text-ink-muted dark:text-ink-muted">Ghi chú phân công/hạn xử lý: {info.workflow.deadlineBasis}</p>}
    <div className="flex flex-wrap gap-2">{info?.canAssign&&<button className={button} onClick={()=>open({id:'assign',label:'Phân công xử lý'})}>Phân công</button>}{info?.canReopen&&<button className={button} onClick={()=>open({id:'reopen',label:'Mở lại để rà soát'})}>Mở lại để rà soát</button>}{info?.actions.map(a=><button key={a.id} disabled={busy||d.job?.status==='running'} className={button} onClick={()=>open(a)}>{a.label}</button>)}</div>
    <p className="text-xs text-ink-muted dark:text-ink-muted">Luồng xử lý nội bộ phục vụ rà soát. Hoàn tất bước này chưa ký hoặc ban hành giấy phép/thông báo nghiệm thu. Hạn nội bộ do người phụ trách xác nhận.</p>
    {error&&!modal&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {history&&<DossierGrid storageKey="workflow-history" rows={(info?.workflow.history||[]).map((r,i)=>({...r,id:String(i)}))} columns={[{label:'Thời điểm',value:r=>r.at,render:r=>formatDateTime(r.at)},{label:'Thao tác',value:r=>r.action},{label:'Người thực hiện',value:r=>r.actor},{label:'Nội dung',value:r=>r.note,width:360}]}/>}
    {modal&&<ReviewModal heading={modal.label} dirty={busy||initial!==JSON.stringify(form)} onClose={()=>{if(!busy)setModal(null);}}><form className="space-y-4" onSubmit={submit}>
      {modal.id==='assign'&&<><label className="block text-sm">Chuyên viên phụ trách<SearchableSelect value={form.assigneeId} disabled={busy} onChange={assigneeId=>setForm({...form,assigneeId})} options={(info?.reviewers||[]).map(r=>({value:r.id,label:r.full_name}))}/></label><label className="block text-sm">Hạn xử lý nội bộ<DateInput value={form.deadline} disabled={busy} onChange={deadline=>setForm({...form,deadline})}/></label></>}
      {modal.id==='schedule_visit'&&<label className="block text-sm">Ngày kiểm tra dự kiến<DateInput value={form.visitDate} disabled={busy} onChange={visitDate=>setForm({...form,visitDate})}/></label>}
      <label className="block text-sm">Nội dung và căn cứ xử lý<textarea required minLength={10} maxLength={3000} rows={4} disabled={busy} className={button+' block mt-2 w-full'} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
      {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      <button className={button+' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white'} disabled={busy||form.note.trim().length<10||(modal.id==='assign'&&!form.assigneeId)}>{busy?'Đang lưu…':'Lưu xử lý'}</button>
    </form></ReviewModal>}
  </section>;
}
