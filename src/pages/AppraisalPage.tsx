import React,{useEffect,useState,useRef,lazy,Suspense} from 'react';
import { useParams } from 'react-router-dom';
import { Plus,Download,RefreshCw,Search } from 'lucide-react';
import { appraisalService as api } from '../services/appraisalService';
import type { DossierSummary,Health } from '../types/appraisal';
import { AppraisalWorkspace } from './projects/appraisal/AppraisalWorkspace';
import { DossierGrid } from '../components/appraisal/DossierGrid';
import { ReviewModal } from '../components/appraisal/ReviewModal';
import { EntityLink } from '../components/ui/EntityLink';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { DateInput } from '../components/ui/DateInput';
import { useSlidePanel } from '../context/SlidePanelContext';
import { useFilterState } from '../hooks/useFilterState';
import { formatDate,formatDateTime } from '../lib/utils';


import type { Project } from '../data/mockData';
import {projectService} from '../services/projectService';
import {ProjectSelect} from '../components/appraisal/ProjectSelect';
import { PROJECT_PROCEDURES, SUBMISSION_STATUS, type ProjectProcedure } from '../lib/projectProcedures';
import { SubmissionWorkspace } from '../components/appraisal/SubmissionWorkspace';
import { SlaBadge, SLA_FILTER_OPTIONS } from '../components/appraisal/SlaBadge';
const ProjectPanel=lazy(()=>import('./projects/ProjectDetailSlidePanel').then(m=>({default:m.ProjectDetailSlidePanel})));

const button='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors inline-flex items-center gap-2 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-sm text-ink-secondary dark:text-ink-secondary disabled:opacity-50';
const input='focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-sm text-ink dark:text-ink';
export function AppraisalPage({procedure='bcnckt',project}:{procedure?:ProjectProcedure;project?:Project}){
  const config=PROJECT_PROCEDURES[procedure];
  const {id}=useParams();const {openPanel}=useSlidePanel();
  const [items,setItems]=useState<DossierSummary[]>([]);const [health,setHealth]=useState<Health|null>(null);
  const [total,setTotal]=useState(0);const requestId=useRef(0);const [sort,setSort]=useFilterState('submission-sort-'+procedure,{key:'updatedAt',direction:'desc'});
  const [page,setPage]=useState(0);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [create,setCreate]=useState(false);
  const [linking,setLinking]=useState<DossierSummary|null>(null);const [linkId,setLinkId]=useState('');
  const [form,setForm]=useState({projectId:project?.id||'',name:'',province:project?.location||'Điện Biên',legalDate:new Date().toISOString().slice(0,10)});const [initial,setInitial]=useState('');
  const [filters,setFilters]=useFilterState('submission-list-'+procedure+'-'+(project?.id||'all'),{search:'',kind:'all',projectId:'',status:'all',sla:'all',from:'',to:''});
  const load=async()=>{const current=++requestId.current;const [h,result]=await Promise.all([api.health(),api.page({offset:page*50,limit:50,procedure,projectId:project?.id||filters.projectId,search:filters.search,kind:filters.kind,status:filters.status,sla:filters.sla,dateFrom:filters.from,dateTo:filters.to,sort:sort.key,direction:sort.direction})]);if(current===requestId.current){setHealth(h);setItems(result.items);setTotal(result.total);}};
  const action=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  useEffect(()=>{const timer=setTimeout(()=>void action(load),180);return()=>{clearTimeout(timer);requestId.current++;};},[page,procedure,project?.id,JSON.stringify(filters),sort.key,sort.direction]);
  useEffect(()=>setPage(0),[JSON.stringify(filters),sort.key,sort.direction]);
  useEffect(()=>{const refresh=()=>{void load().catch(e=>setError(e.message));};window.addEventListener('appraisal:changed',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('appraisal:changed',refresh);window.removeEventListener('focus',refresh);};},[page,procedure,project?.id,JSON.stringify(filters),sort.key,sort.direction]);
  const open=(d:DossierSummary)=>openPanel({id:'dossier-'+d.id,title:d.name,tabTitle:PROJECT_PROCEDURES[d.procedure||'bcnckt'].label,component:(d.procedure||'bcnckt')==='bcnckt'?<AppraisalWorkspace dossierId={d.id}/>:<SubmissionWorkspace dossierId={d.id}/>,storageKey:'dossier-panel-width'});
  useEffect(()=>{if(id&&!project)api.get(id).then(open).catch(e=>setError(e.message));},[id,project?.id]);
  const openProject=(p:Project)=>openPanel({id:'project-'+p.id,title:p.name,subtitle:p.code,tabTitle:p.code,component:<Suspense fallback={<p>Đang tải dự án…</p>}><ProjectPanel key={p.id+procedure} project={p} initialTab={procedure}/></Suspense>,storageKey:'slidepanel-project-'+p.id});
  const projectName=(d:DossierSummary)=>d.projectName||'Chưa gắn dự án';
  const rows=items;
  return <div className={'flex flex-col gap-4 min-w-0 text-ink dark:text-ink '+(project?'flex-1 min-h-[420px] py-4':'h-full min-h-[520px]')}>
    <header><h1 className="text-2xl font-bold">{config.label}</h1></header>
    {error&&<div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-red-800 dark:text-red-200 text-sm">{error}</div>}
    <div className="flex flex-wrap gap-3">
      <button className={button+' !bg-primary-500 !border-primary-500 !text-white dark:!bg-primary-500 dark:!border-primary-500 dark:!text-white hover:!bg-primary-600 dark:hover:!bg-primary-600'} disabled={busy||!health} onClick={()=>{const next={...form,projectId:project?.id||'',name:config.label+' — lần nộp mới',province:project?.location||'Điện Biên'};setForm(next);setInitial(JSON.stringify(next));setCreate(true);}}><Plus size={16}/>Tạo lần nộp hồ sơ</button>
      {procedure==='bcnckt'&&!project&&<>{health?.mode==='demo'&&<><button className={button} disabled={busy||!health} onClick={()=>action(async()=>{const d=await api.sample('initial');await load();open(d);})}>Nạp hồ sơ lần đầu</button>
      <button className={button} disabled={busy||!health} onClick={()=>action(async()=>{const d=await api.sample('revised');await load();open(d);})}>Nạp hồ sơ đã bổ sung</button></>}
      <button className={button} disabled={busy||!health} onClick={()=>action(()=>api.download('/samples.zip','bo-ho-so-bcnckt.zip'))}><Download size={16}/>Tải bộ đầu vào và đầu ra</button></>}
      <button className={button} disabled={busy} onClick={()=>action(load)}><RefreshCw size={16}/>Tải lại</button>
    </div>
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-60"><Search size={16} className="absolute left-3 top-3 text-ink-muted dark:text-ink-muted"/><input aria-label="Tìm hồ sơ" className={input+' pl-9'} value={filters.search} placeholder="Tìm hồ sơ, tên dự án, mã dự án…" onChange={e=>setFilters({...filters,search:e.target.value})}/></div>
      {!project&&<div className="w-64"><ProjectSelect value={filters.projectId} onChange={projectId=>{setPage(0);setFilters({...filters,projectId});}} allowAll/></div>}
      <div className="w-48"><SearchableSelect value={filters.status} onChange={status=>setFilters({...filters,status})} options={[{value:'all',label:'Tất cả trạng thái'},{value:'intake',label:'Tiếp nhận'},{value:'analyzed',label:'Đã kiểm tra'},{value:'request_supplement',label:'Yêu cầu bổ sung'},{value:'reviewed',label:'Đã rà soát nội bộ'}]}/></div>
      <div className="w-48"><SearchableSelect value={filters.sla||'all'} onChange={sla=>setFilters({...filters,sla})} options={SLA_FILTER_OPTIONS}/></div>
      <div className="w-40"><DateInput value={filters.from} placeholder="Ngày đánh giá từ" onChange={from=>setFilters({...filters,from})}/></div><div className="w-40"><DateInput value={filters.to} placeholder="Ngày đánh giá đến" onChange={to=>setFilters({...filters,to})}/></div>
      <button className={button} onClick={()=>{setPage(0);setFilters({search:'',kind:'all',projectId:'',status:'all',sla:'all',from:'',to:''});}}>Đặt lại</button><span className="text-xs text-ink-muted dark:text-ink-muted">{total} hồ sơ · trang {page+1} · {rows.length} hồ sơ đang hiển thị</span>
    </div>
    <DossierGrid fitWidth className="flex-1 min-h-56" storageKey={'submission-compact-v2-'+procedure+(project?'-project':'-all')} rows={rows} serverSort={sort} onSort={(key,direction)=>setSort({key,direction})} columns={[
      {label:'Hồ sơ / tài liệu',sortKey:'name',value:d=>d.name,width:310,render:d=><div className="space-y-2 leading-relaxed"><EntityLink type="dossier" id={d.id} name={d.name} className="whitespace-normal break-words overflow-visible" onClick={()=>open(d)}/><div className="flex flex-wrap items-center gap-2 text-ink-muted dark:text-ink-muted"><span>{d.documentCount??0} tài liệu</span></div></div>},
      ...(!project?[{label:'Dự án',sortKey:'projectName',value:projectName,width:300,render:(d:DossierSummary)=><div className="space-y-2 leading-relaxed">{d.projectId?<EntityLink type="project" id={d.projectId} name={projectName(d)} className="whitespace-normal break-words overflow-visible" onClick={()=>void action(async()=>openProject(await projectService.getById(d.projectId!)))}/>:<span>{projectName(d)}</span>}<button className="block text-xs text-primary-700 dark:text-primary-300 hover:text-primary-600 dark:hover:text-primary-200" disabled={busy} onClick={()=>{setLinkId(d.projectId||'');setLinking(d);}}>{d.projectId?'Đổi dự án':'Gắn dự án'}</button></div>}]:[]),
      {label:'Trạng thái / thụ lý',sortKey:'status',value:d=>SUBMISSION_STATUS[d.status]||'Đang xử lý',width:220,render:d=><div className="space-y-2 leading-relaxed"><span className="inline-block rounded-md bg-primary-50 dark:bg-slate-800 px-2 py-1 font-medium text-primary-800 dark:text-primary-300">{SUBMISSION_STATUS[d.status]||'Đang xử lý'}</span><p>{d.department}</p></div>},
      {label:'Hạn xử lý',sortKey:'slaDueDate',value:d=>d.slaDueDate||'',width:190,render:d=><div className="space-y-1.5 leading-relaxed"><SlaBadge sla={d.slaState} dueDate={d.slaDueDate}/><p className="text-ink-muted dark:text-ink-muted">{d.slaDueDate?'Hạn '+formatDate(d.slaDueDate):'Chưa có hạn'}</p></div>},
      {label:'Địa điểm công trình',sortKey:'province',value:d=>d.province,width:200,render:d=><p className="leading-relaxed">{d.province}</p>},
      {label:'Thời gian',sortKey:'updatedAt',value:d=>d.updatedAt,width:260,render:d=><dl className="space-y-1.5 leading-relaxed">{[
        ['Tạo lần nộp',d.createdAt?formatDateTime(d.createdAt):'Chưa ghi nhận'],
        ['Đánh giá',formatDate(d.legalDate)],
        ['Cập nhật',formatDateTime(d.updatedAt)],
      ].map(([label,value])=><div key={label} className="flex flex-wrap gap-x-2"><dt className="text-ink-muted dark:text-ink-muted">{label}:</dt><dd>{value}</dd></div>)}</dl>},
    ]}/>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-muted dark:text-ink-muted">{total?`${page*50+1}–${page*50+rows.length} / ${total} hồ sơ`:'0 hồ sơ'}</span><div className="flex gap-3"><button className={button} disabled={busy||page===0} onClick={()=>setPage(page-1)}>Trang trước</button><button className={button} disabled={busy||(page+1)*50>=total} onClick={()=>setPage(page+1)}>Trang sau</button></div></div>
    {create&&<ReviewModal heading={'Tiếp nhận hồ sơ — '+config.label} dirty={JSON.stringify(form)!==initial} onClose={()=>setCreate(false)}>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();action(async()=>{const selected=project||await projectService.getById(form.projectId);if(!selected)throw new Error('Chọn dự án trước khi tạo hồ sơ.');const d=await api.create({...form,procedure,projectId:selected.id,projectName:selected.name,projectCode:selected.code});setCreate(false);setForm({...form,name:''});await load();open(d);});}}>
        {!project&&<div className="text-sm">Dự án<ProjectSelect value={form.projectId} onChange={projectId=>setForm({...form,projectId})}/></div>}
        <label className="block text-sm">Tên hồ sơ / lần nộp<input required minLength={3} maxLength={300} className={input} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="block text-sm">Địa phương công trình<input required className={input} value={form.province} onChange={e=>setForm({...form,province:e.target.value})}/></label>
        <label className="block text-sm">Thời điểm áp dụng quy định<DateInput value={form.legalDate} onChange={legalDate=>setForm({...form,legalDate})}/></label>
        <p className="text-xs text-ink-muted dark:text-ink-muted">Địa phương công trình khác phạm vi phân quyền. Phòng thụ lý được gán theo tài khoản.</p>
        {error&&<p role="alert" className="text-red-700 dark:text-red-400">{error}</p>}<button className={button} disabled={busy}>Tạo hồ sơ</button>
      </form>
    </ReviewModal>}
    {linking&&<ReviewModal heading="Gắn hồ sơ với dự án" dirty={linkId!==(linking.projectId||'')} onClose={()=>setLinking(null)}><form className="space-y-4" onSubmit={e=>{e.preventDefault();action(async()=>{const p=await projectService.getById(linkId);if(!p)throw new Error('Chọn dự án để liên kết.');await api.mutate(linking.id,'/project',{revision:linking.revision,projectId:p.id,projectName:p.name,projectCode:p.code});setLinking(null);await load();});}}><ProjectSelect value={linkId} onChange={setLinkId}/><p className="text-sm">Hồ sơ sẽ xuất hiện trong tab tương ứng của dự án đã chọn. Kết quả kiểm tra cũ cần được rà soát lại sau khi đổi dự án.</p>{error&&<p role="alert" className="text-red-700 dark:text-red-400">{error}</p>}<button className={button} disabled={busy||!linkId}>Lưu liên kết</button></form></ReviewModal>}
  </div>;
}
