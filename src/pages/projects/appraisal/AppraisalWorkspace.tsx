import {WorkflowPanel} from '../../../components/appraisal/WorkflowPanel';
import {OcrPanel} from '../../../components/appraisal/OcrPanel';
import {useCaseProgress} from '../../../hooks/useCaseProgress';
import { SubmissionHistory } from '../../../components/appraisal/SubmissionHistory';
import { AnalysisFeedback } from '../../../components/appraisal/AnalysisFeedback';
import React,{useEffect,useState,useRef,Suspense,lazy} from 'react';
import { Upload,Play,FileText,Download,RefreshCw,Search,Plus,ShieldCheck,AlertTriangle,Database,Check } from 'lucide-react';
import { appraisalService as api } from '../../../services/appraisalService';
import type { Dossier,Fact,Finding,Health,SourceRef } from '../../../types/appraisal';
import { DossierGrid } from '../../../components/appraisal/DossierGrid';
import { ReviewModal } from '../../../components/appraisal/ReviewModal';
import { LegalReview } from '../../../components/appraisal/LegalReview';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { NumberInput } from '../../../components/ui/NumberInput';
import { Tooltip } from '../../../components/ui/Tooltip';
import { EntityLink } from '../../../components/ui/EntityLink';
import { useFilterState } from '../../../hooks/useFilterState';
import { formatCurrency,formatDateTime } from '../../../lib/utils';
import { matchesSmartSearch } from '../../../lib/smartSearch';
import type { Project } from '../../../data/mockData';
const PdfPreview=lazy(()=>import('../../../components/appraisal/PdfPreview').then(module=>({default:module.PdfPreview})));

const button='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors inline-flex items-center justify-center gap-2 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary dark:text-ink-secondary hover:bg-subtle dark:hover:bg-subtle disabled:opacity-50';
const primary=button+' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white !border-primary-500 dark:!border-primary-500 hover:!bg-primary-600 dark:hover:!bg-primary-600';
const input='focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-sm text-ink dark:text-ink';
const labels:Record<string,string>={missing:'Chưa nộp',submitted:'Đã nộp',verified:'Đã kiểm tra',needs_supplement:'Cần bổ sung',consistent:'Khớp trong phạm vi kiểm tra',inconsistent:'Cần làm rõ',insufficient_evidence:'Chưa đủ dữ liệu',requires_specialist:'Cần chuyên viên',pending:'Chờ xác nhận',confirmed:'Đã xác nhận',rejected:'Không sử dụng',accept:'Ghi nhận nhận xét',reject:'Không chấp nhận nhận xét',defer:'Chờ làm rõ',running:'Đang kiểm tra',completed:'Hoàn tất',cancelled:'Đã hủy',failed:'Thất bại',interrupted:'Gián đoạn'};
const tabs=[['intake','Hồ sơ đầu vào'],['legal','Căn cứ pháp lý'],['facts','Dữ liệu trích xuất'],['findings','Nội dung thẩm định'],['cost','Tổng mức đầu tư'],['responses','Ý kiến và giải trình'],['drafts','Dự thảo kết quả'],['audit','Lịch sử']];
function Badge({value}:{value:string}){return <span className="inline-block rounded-md bg-subtle dark:bg-subtle px-2 py-1 text-xs font-medium text-ink-secondary dark:text-ink-secondary">{labels[value]||value}</span>;}
type Modal={type:'fact'|'finding'|'requirement'|'add'|'consultation'|'final'|'reopen';item?:any};

export function AppraisalWorkspace({dossierId,project}:{dossierId?:string;project?:Project}){
  const [d,setD]=useState<Dossier|null>(null);const [health,setHealth]=useState<Health|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [tab,setTab]=useState('intake');
  const [filters,setFilters]=useFilterState('appraisal-filters-'+(dossierId||project?.id||'new'),{search:'',category:'all',status:'all'});
  const [modal,setModal]=useState<Modal|null>(null);const [form,setForm]=useState({value:'',note:'',decision:'',response:''});
  const [initial,setInitial]=useState('');const [refs,setRefs]=useState<SourceRef[]|null>(null);
  const [preview,setPreview]=useState<string|null>(null);const [uploadReq,setUploadReq]=useState('TTR');const [role,setRole]=useState('submission');
  const [mode,setMode]=useState('intake');const [useModel,setUseModel]=useState(false);
  const [starting,setStarting]=useState(false);const [pollError,setPollError]=useState('');
  const pendingAnalysis=useRef<string|null>(null);const resultsAnchor=useRef<HTMLDivElement>(null);
  const showResults=()=>{setTab('findings');setFilters({search:'',category:'all',status:'all'});requestAnimationFrame(()=>resultsAnchor.current?.scrollIntoView({behavior:'smooth',block:'start'}));};
  const action=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Không thực hiện được thao tác.');}finally{setBusy(false);}};
  const refresh=async()=>{setHealth(await api.health());if(d?.id)setD(await api.get(d.id));};
  useEffect(()=>{let live=true;(async()=>{try{const h=await api.health();if(live)setHealth(h);
    const id=dossierId||(project?(await api.list(0,{procedure:'bcnckt',projectId:project.id}))[0]?.id:null);
    if(id){const item=await api.get(id);if(live)setD(item);}
  }catch(e){if(live)setError((e as Error).message);}})();return()=>{live=false;};},[dossierId,project?.id]);
  useEffect(()=>{pendingAnalysis.current=null;setPollError('');},[dossierId,project?.id]);
  useCaseProgress(d,next=>setD(current=>current?.id===next.id&&current.revision<=next.revision?next:current),setPollError);
  useEffect(()=>{
    if(!d?.job||d.job.mode==='ocr')return;
    if(d.job.status==='running'){pendingAnalysis.current=d.job.id;return;}
    if(pendingAnalysis.current!==d.job.id)return;
    pendingAnalysis.current=null;
    if(d.job.status==='completed')showResults();
  },[d?.job?.id,d?.job?.status]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const mutate=async(path:string,body:unknown,method='POST')=>{if(!d)return;const next=await api.mutate(d.id,path,{revision:d.revision,...body as object},method);setD(next);};
  const startAnalysis=()=>action(async()=>{if(!d)return;setStarting(true);setPollError('');try{const next=await api.mutate(d.id,'/analysis',{revision:d.revision,mode,useModel});pendingAnalysis.current=next.job?.id||null;setD(next);}finally{setStarting(false);}});
  const openModal=(m:Modal,value='',decision='')=>{if(d?.readOnly){setError('Mở lần nộp mới nhất để xử lý hồ sơ.');return;}const next={value,note:'',decision,response:''};setForm(next);setInitial(JSON.stringify(next));setModal(m);};
  const showDoc=async(id:string)=>{if(!d)return;const doc=d.documents.find(x=>x.id===id);if(!doc)return;
    if(doc.name.toLowerCase().endsWith('.pdf'))setPreview(URL.createObjectURL(await api.blob(`/cases/${d.id}/documents/${id}`)));
    else await api.download(`/cases/${d.id}/documents/${id}`,doc.name);};

  if(!d)return <div className="p-6 space-y-4 text-ink dark:text-ink">
    <h3 className="text-lg font-semibold">Hồ sơ thẩm định BCNCKT</h3><p className="text-sm text-ink-secondary dark:text-ink-secondary">Tạo lần trình để tiếp nhận tài liệu, đối chiếu và lưu đánh giá của chuyên viên.</p>
    {error&&<p role="alert" className="text-red-700 dark:text-red-400">{error}</p>}
    {project&&<button className={primary} disabled={busy||!health} onClick={()=>action(async()=>setD(await api.create({name:project.name,province:project.location,projectId:project.id,legalDate:project.submissionDate||new Date().toISOString().slice(0,10)})))}><Plus size={15}/>Tạo hồ sơ từ dự án</button>}
  </div>;
  const run=d.runs.slice(-1)[0];const activeDocs=Object.values(Object.fromEntries(d.documents.filter(x=>x.role!=='reference').map(x=>[x.requirementId,x])));const activeIds=new Set(activeDocs.map(x=>x.id));
  const factRows=d.facts.filter(x=>activeIds.has(x.documentId)&&matchesSmartSearch(x.label+' '+x.value,filters.search)&&(filters.status==='all'||x.reviewStatus===filters.status));
  const findingRows=(run?.findings||[]).filter(x=>matchesSmartSearch(x.title+' '+x.explanation,filters.search)&&(filters.category==='all'||x.category===filters.category)&&(filters.status==='all'||x.result===filters.status));
  const reqRows=d.requirements.filter(x=>matchesSmartSearch(x.name,filters.search)&&(filters.category==='all'||x.category===filters.category)&&(filters.status==='all'||x.status===filters.status));
  const categories=[...new Set((tab==='findings'?run?.findings||[]:d.requirements).map(x=>x.category))];
  const statuses=tab==='facts'?['pending','confirmed','rejected']:tab==='findings'?['consistent','inconsistent','insufficient_evidence','requires_specialist']:['missing','submitted','verified','needs_supplement'];
  const sourceButton=(sources:SourceRef[])=><button type="button" className="text-primary-700 dark:text-primary-400 font-medium" onClick={()=>setRefs(sources)}>{sources.length} nguồn chứng cứ</button>;
  const submitModal=()=>action(async()=>{
    if(!modal)return;
    if(modal.type==='fact')await mutate('/facts/'+modal.item.id,{decision:form.decision,value:form.value,note:form.note},'PATCH');
    if(modal.type==='finding')await mutate('/findings/'+modal.item.id,{decision:form.decision,note:form.note},'PATCH');
    if(modal.type==='requirement')await mutate('/requirements/'+modal.item.id,{status:form.decision,note:form.note},'PATCH');
    if(modal.type==='add')await mutate('/requirements',{name:form.value,category:form.note});
    if(modal.type==='consultation')await mutate('/consultations',{text:form.note,response:form.response});
    if(modal.type==='reopen')await mutate('/reopen',{note:form.note});
    if(modal.type==='final')await mutate('/final-review',{decision:form.decision,note:form.note});
    setModal(null);
  });
  return <div className="space-y-5 text-ink dark:text-ink select-text">
    <header className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-5 pr-16">
      <div className="flex flex-wrap gap-2 text-xs mb-3"><Badge value={d.province}/><Badge value={'Lần cập nhật '+d.revision}/></div>
      <h2 className="text-xl font-semibold"><EntityLink type="dossier" id={d.id} name={d.name} onClick={()=>setTab('intake')}/></h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted">{d.assignee} · {d.department} · Đánh giá tại {formatDateTime(d.legalDate).split(' ')[0]}</p>
    </header>
    <SubmissionHistory dossier={d}/>
    <WorkflowPanel dossier={d} onChange={setD}/>
    <OcrPanel dossier={d} onChange={setD} poll={false}/>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[
      ['Thành phần đã nộp',`${d.requirements.filter(r=>r.status!=='missing').length}/${d.requirements.length}`],
      ['Phiên bản tài liệu',d.documents.length],['Dữ liệu chờ xác nhận',d.facts.filter(f=>activeIds.has(f.documentId)&&f.reviewStatus==='pending').length],
      ['Nội dung cần làm rõ',run?.findings.filter(f=>f.result!=='consistent').length??'Chưa chạy'],
    ].map(([label,value])=><div key={label} className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-4"><p className="text-xs text-ink-muted dark:text-ink-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    {error&&<div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">{error}</div>}
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-60"><SearchableSelect value={mode} onChange={setMode} options={[{value:'intake',label:'Kiểm tra đầu vào hiện tại'},{value:'comparison',label:'Đối chiếu cả tài liệu tham khảo'}]}/></div>
      <label className="flex gap-2 items-center text-xs"><input type="checkbox" className="accent-primary-500 dark:accent-primary-400" checked={useModel} disabled={!health?.modelConfigured} onChange={e=>setUseModel(e.target.checked)}/>Phân tích thêm bằng mô hình AI</label>
      {!health?.modelConfigured&&<span className="text-xs text-ink-muted dark:text-ink-muted">AI chưa sẵn sàng. Vẫn có thể chạy kiểm tra theo quy tắc.</span>}
      <button className={primary} disabled={busy||starting||d.readOnly||d.job?.status==='running'} onClick={startAnalysis}><Play size={14}/>{starting?'Đang gửi yêu cầu…':d.job?.status==='running'?'Đang kiểm tra…':'Chạy kiểm tra hồ sơ'}</button>
      {d.job?.status==='running'&&<button className={button} onClick={()=>action(()=>mutate('/cancel',{}))}>Hủy lượt chạy</button>}
      <Tooltip content="Tải lại dữ liệu" placement="bottom"><button className={button} disabled={busy} onClick={()=>action(refresh)}><RefreshCw size={14}/></button></Tooltip>
    </div>
    <div ref={resultsAnchor} className="scroll-mt-4"><AnalysisFeedback dossier={d} starting={starting} onResults={showResults}/>{pollError&&<p role="alert" className="mt-2 text-sm text-amber-800 dark:text-amber-300">{pollError}</p>}</div>
    {run?.stale&&<p className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">Tài liệu hoặc dữ liệu đã thay đổi. Chạy lại kiểm tra trước khi đánh giá và xuất kết quả.</p>}
    <nav className="flex gap-2 overflow-x-auto border-b border-border dark:border-border">{tabs.map(([key,label])=><button type="button" key={key} onClick={()=>{setTab(key);setFilters({search:'',category:'all',status:'all'});}} className={'whitespace-nowrap px-3 py-3 text-xs font-semibold border-b-2 '+(tab===key?'border-primary-600 text-primary-700 dark:text-primary-400':'border-transparent text-ink-muted dark:text-ink-muted')}>{label}</button>)}</nav>
    {tab==='legal'&&<fieldset disabled={!!d.readOnly}><LegalReview dossier={d} onChange={setD}/></fieldset>}
    {['intake','facts','findings'].includes(tab)&&<div className="flex flex-wrap gap-3 items-center">
      <div className="relative min-w-60 flex-1"><Search size={15} className="absolute top-3 left-3 text-ink-muted dark:text-ink-muted"/><input aria-label="Tìm trong hồ sơ" className={input+' pl-9 pr-8'} placeholder="Tìm nội dung, tài liệu hoặc số liệu…" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/>{filters.search&&<button aria-label="Xóa tìm kiếm" className="absolute top-2 right-3" onClick={()=>setFilters({...filters,search:''})}>×</button>}</div>
      {tab!=='facts'&&<div className="w-48"><SearchableSelect value={filters.category} onChange={category=>setFilters({...filters,category})} options={[{value:'all',label:'Tất cả nhóm'},...categories.map(x=>({value:x,label:x}))]}/></div>}
      <div className="w-56"><SearchableSelect value={filters.status} onChange={status=>setFilters({...filters,status})} options={[{value:'all',label:'Tất cả trạng thái'},...statuses.map(x=>({value:x,label:labels[x]}))]}/></div>
      <button className={button} onClick={()=>setFilters({search:'',category:'all',status:'all'})}>Đặt lại bộ lọc</button>
    </div>}
    {tab==='intake'&&<div className="space-y-4">
      {!!d.checklistCandidates?.length&&<section className="rounded-xl border border-primary-200 dark:border-slate-700 p-4 space-y-3"><h3 className="font-semibold">Danh mục nhận diện từ tờ trình</h3><p className="text-xs text-ink-muted dark:text-ink-muted">Đọc trích dẫn trước khi đưa vào checklist. Dẫn tên văn bản không chứng minh đã nộp bản gốc.</p>{d.checklistCandidates.map(c=><div key={c.id} className="flex flex-wrap gap-3 items-center text-sm"><span className="flex-1">{c.name}</span>{sourceButton([c])}<button className={button} disabled={busy||d.readOnly||c.accepted} onClick={()=>action(()=>mutate('/checklist/accept',{candidateId:c.id}))}>{c.accepted?'Đã xác nhận':'Xác nhận thành phần'}</button></div>)}</section>}

      <div className="rounded-xl bg-subtle dark:bg-subtle p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-64"><SearchableSelect value={uploadReq} onChange={setUploadReq} options={d.requirements.map(r=>({value:r.id,label:r.name}))}/></div>
        <div className="w-56"><SearchableSelect value={role} onChange={setRole} options={[{value:'submission',label:'Tài liệu đầu vào'},{value:'reference',label:'Kết quả cũ / tham khảo'}]}/></div>
        <label className={primary+' cursor-pointer'}><Upload size={15}/>Nộp tài liệu<input type="file" className="hidden" disabled={busy||d.readOnly} accept=".pdf,.docx,.txt" onChange={e=>{const file=e.target.files?.[0];if(file)action(async()=>setD(await api.upload(d,uploadReq,file,role)));e.target.value='';}}/></label>
        <button className={button} disabled={busy||d.readOnly} onClick={()=>openModal({type:'add'})}><Plus size={14}/>Thêm thành phần</button>
      </div>
      <p className="text-xs text-ink-muted dark:text-ink-muted">PDF có lớp chữ, DOCX hoặc TXT · tối đa 18 MB/tệp · {health?.ocrAvailable?'OCR cục bộ tối đa 2 trang scan/tệp; cần xác nhận số liệu.':'Tệp scan chưa đọc được cần bản có lớp chữ hoặc cấu hình OCR.'} Kết quả cũ được tách khỏi chế độ kiểm tra đầu vào.</p>
      <DossierGrid storageKey="appraisal-intake" rows={reqRows} columns={[
        {label:'Thành phần hồ sơ',value:r=>r.name,width:280}, {label:'Nhóm',value:r=>r.category,width:120},
        {label:'Trạng thái',value:r=>labels[r.status],render:r=><Badge value={r.status}/>,width:150},
        {label:'Tài liệu và phiên bản',value:r=>d.documents.filter(x=>x.requirementId===r.id).length,width:300,render:r=><div className="space-y-2">{d.documents.filter(x=>x.requirementId===r.id).map(doc=><div key={doc.id}><button className="text-primary-700 dark:text-primary-400 text-left" onClick={()=>setRefs(doc.segments.map(s=>({documentId:doc.id,segmentId:s.id,locator:s.locator,quote:s.text})))}>{doc.name} · v{doc.version}</button><p className="text-ink-muted dark:text-ink-muted">{doc.role==='reference'?'Tham khảo · ':''}{doc.signature==='present_unverified'?'Có chữ ký, chưa xác thực':'Chưa xác thực chữ ký'}</p>{doc.warnings.map(w=><p key={w} className="text-amber-800 dark:text-amber-300">{w}</p>)}</div>)}</div>},
        {label:'Chuyên viên',value:r=>r.verifiedBy||'',width:170,render:r=><div className="space-y-2"><p>{r.note}</p><button className={button} disabled={busy||d.readOnly} onClick={()=>openModal({type:'requirement',item:r},'',r.status==='missing'?'needs_supplement':r.status)}>Kiểm tra thành phần</button></div>},
      ]}/>
    </div>}
    {tab==='facts'&&<DossierGrid storageKey="appraisal-facts" rows={factRows} columns={[
      {label:'Trường dữ liệu',value:f=>f.label,width:210},{label:'Giá trị',value:f=>f.unit?Number(f.value):f.value,width:210,render:f=><><strong>{f.unit==='VNĐ'?formatCurrency(f.value):f.value+' '+f.unit}</strong><p className="mt-1 text-ink-muted dark:text-ink-muted">Bản gốc: {f.rawValue}</p></>},
      {label:'Nguồn',value:f=>f.locator,width:220,render:f=><>{sourceButton([f])}<p className="mt-2">{d.documents.find(x=>x.id===f.documentId)?.name} · {f.locator}</p></>},
      {label:'Xác nhận',value:f=>f.reviewStatus,width:200,render:f=><div className="space-y-2"><Badge value={f.reviewStatus}/><p>{f.reviewedBy}</p><button className={button} onClick={()=>openModal({type:'fact',item:f},f.value,'confirmed')}>Xem và xác nhận</button></div>},
    ]}/>}
    {tab==='findings'&&<div className="space-y-4">{!run?<p>{starting||d.job?.status==='running'?'Đang kiểm tra. Kết quả sẽ xuất hiện tại đây khi hoàn tất.':'Chạy kiểm tra để xem nhận xét có dẫn chứng.'}</p>:<>
      {d.job?.status==='running'&&<p className="text-sm text-amber-800 dark:text-amber-300">Đang chạy lượt mới. Nội dung dưới đây thuộc lượt trước lúc {formatDateTime(run.createdAt)}.</p>}
      <section className="space-y-3"><h3 className="font-semibold">Đề xuất từ AI ({run.aiNotes.length})</h3><p className="text-sm text-ink-secondary dark:text-ink-secondary">{run.aiStatus}</p>
        {run.aiNotes.map((n,i)=><article key={i} className="rounded-xl border border-primary-200 dark:border-slate-700 bg-surface dark:bg-surface p-4"><p className="text-xs mb-2 text-primary-700 dark:text-primary-300">Đề xuất {i+1} · Chờ chuyên viên xác minh</p><p className="text-sm mb-3 whitespace-pre-wrap leading-relaxed">{n.text}</p>{sourceButton(n.sources.map(s=>({documentId:s.documentId,segmentId:s.id,locator:s.locator,quote:s.text})))}</article>)}
      </section>
      <h3 className="font-semibold">Đối chiếu theo quy tắc ({run.findings.length})</h3>
      <DossierGrid storageKey="appraisal-findings" rows={findingRows} columns={[
        {label:'Nội dung kiểm tra',value:f=>f.title,width:280,render:f=><><p className="font-semibold">{f.title}</p><p className="mt-1 text-ink-muted dark:text-ink-muted">{f.category}</p></>},
        {label:'Kết quả và điều kiện',value:f=>f.result,width:370,render:f=><div className="space-y-2"><Badge value={f.result}/><p>{f.explanation}</p>{f.calculation&&<p className="font-mono">{f.calculation}</p>}{f.missingEvidence.map(x=><p key={x}>Cần: {x}</p>)}</div>},
        {label:'Bằng chứng',value:f=>f.sources.length,width:190,render:f=><div className="space-y-2">{f.sources.length?sourceButton(f.sources):<p>Chưa có bằng chứng đầy đủ.</p>}{f.legalRefs.map(x=><a key={x.url} href={x.url} target="_blank" rel="noreferrer" className="block text-primary-700 dark:text-primary-400">{x.label}</a>)}</div>},
        {label:'Đánh giá chuyên viên',value:f=>f.review?.decision||'',width:240,render:f=><div className="space-y-2">{f.review&&<><Badge value={f.review.decision}/><p>{f.review.note}</p><p>{f.review.actor}</p></>}<button className={button} disabled={busy||d.readOnly||run.stale} onClick={()=>openModal({type:'finding',item:f},'','defer')}>Ghi đánh giá</button></div>},
      ]}/>
    </>}</div>}
    {tab==='cost'&&<div className="space-y-4">{!run?.costVersions.length?<p>Chưa đủ 7 khoản mục chi phí để đối chiếu.</p>:<>
      <div className="rounded-xl bg-primary-50 dark:bg-slate-800 p-5"><p className="text-sm">{run.costComparison?'Thay đổi ròng giữa lần đầu và lần mới':'Tổng mức đầu tư được kê'}</p><p className="text-2xl font-semibold mt-2">{formatCurrency(run.costComparison?.netSavings??run.costVersions.slice(-1)[0]?.total)}</p><p className="mt-2 text-xs text-ink-secondary dark:text-ink-secondary">Không mặc định coi giảm từng khoản mục là tiết kiệm ròng. Chưa xác nhận khối lượng, đơn giá hoặc lý do điều chỉnh.</p></div>
      <DossierGrid storageKey="appraisal-cost" rows={(run.costComparison?.items||run.costVersions.slice(-1)[0]!.items.map(x=>({name:x.name,before:x.value,after:x.value,difference:'0'}))).map((x,i)=>({...x,id:String(i)}))} columns={[
        {label:'Khoản mục',value:r=>r.name,width:250},{label:'Lần đầu',value:r=>Number(r.before),render:r=>formatCurrency(r.before),width:200},
        {label:'Lần hiện tại',value:r=>Number(r.after),render:r=>formatCurrency(r.after),width:200},{label:'Chênh lệch',value:r=>Number(r.difference),render:r=>formatCurrency(r.difference),width:180},
      ]}/>{run.costVersions.map(v=><p key={v.documentId} className="text-xs">{v.name}: tổng kê {formatCurrency(v.total)} · cộng lại {formatCurrency(v.sum)}</p>)}
    </>}</div>}
    {tab==='responses'&&<div className="space-y-4"><button className={primary} onClick={()=>openModal({type:'consultation'})}><Plus size={14}/>Ghi ý kiến hoặc giải trình</button>
      {d.consultations.map(c=><article key={c.id} className="rounded-xl border border-border dark:border-border p-4 space-y-2"><p className="font-medium">{c.text}</p><p className="text-sm">{c.response||'Chưa có giải trình.'}</p><p className="text-xs text-ink-muted dark:text-ink-muted">{c.actor} · {formatDateTime(c.at)}</p></article>)}{!d.consultations.length&&<p className="text-sm">Chưa ghi nhận ý kiến. Tài liệu sửa được nộp thành phiên bản mới tại Hồ sơ đầu vào.</p>}</div>}
    {tab==='drafts'&&<div className="space-y-4"><p className="text-sm">Tài liệu được phân trang A4, có nguồn và nội dung chưa đủ dữ liệu. Các bản xuất đều là dự thảo chưa ký.</p>
      {([['report','Báo cáo hỗ trợ kiểm tra'],['supplement','Dự thảo bổ sung — Mẫu 15'],['suspension','Dự thảo tạm dừng — Mẫu 16'],['notice','Dự thảo kết quả — Mẫu 03'],['decision','Khung quyết định — Mẫu 09']] as const).map(([kind,label])=><div key={kind} className="flex flex-wrap gap-3 items-center justify-between rounded-xl border border-border dark:border-border p-4"><p className="font-medium text-sm">{label}</p><div className="flex gap-2"><button className={button} disabled={busy||!run||run.stale} onClick={()=>action(async()=>setPreview(URL.createObjectURL(await api.blob(`/cases/${d.id}/export/${kind}/pdf`))))}><FileText size={14}/>Xem A4</button>{['pdf','docx'].map(format=><button key={format} className={button} disabled={busy||!run||run.stale} onClick={()=>action(()=>api.download(`/cases/${d.id}/export/${kind}/${format}`,`${kind}.${format}`))}><Download size={14}/>{format.toUpperCase()}</button>)}</div></div>)}
      <div className="flex gap-3"><button className={primary} disabled={busy||d.readOnly||!run||run.stale||!!d.finalReview||(health?.mode!=='demo'&&!['head_of_department','director'].includes(health?.actor.role||''))} onClick={()=>openModal({type:'final'},'','request_supplement')}><ShieldCheck size={15}/>Rà soát nội bộ</button><button className={button} onClick={()=>action(()=>api.download(`/cases/${d.id}/export/report/json`,'ho-so-va-ket-qua.json'))}>Tải dữ liệu và nguồn JSON</button></div>
      {!d.readOnly&&d.finalReview&&(health?.mode==='demo'||['head_of_department','director'].includes(health?.actor.role||''))&&<button className={button} onClick={()=>openModal({type:'reopen'})}>Mở lại để rà soát</button>}
      {d.finalReview&&<p className="text-sm">{d.finalReview.note} · {d.finalReview.actor} · {formatDateTime(d.finalReview.at)}</p>}
    </div>}
    {tab==='audit'&&<DossierGrid storageKey="appraisal-audit" rows={d.audit} columns={[
      {label:'Thời gian',value:r=>r.at,render:r=>formatDateTime(r.at),width:170},{label:'Người thực hiện',value:r=>r.actor,width:180},
      {label:'Thao tác',value:r=>r.action,width:210},{label:'Chi tiết',value:r=>r.detail,width:450},
    ]}/>}
    {modal&&<ReviewModal heading={modal.type==='fact'?'Xác nhận '+modal.item.label:modal.type==='finding'?modal.item.title:modal.type==='add'?'Thêm thành phần theo tờ trình':modal.type==='consultation'?'Ý kiến và giải trình':modal.type==='final'?'Rà soát nội bộ':modal.type==='reopen'?'Mở lại hồ sơ đã khóa':'Kiểm tra thành phần hồ sơ'} dirty={JSON.stringify(form)!==initial} onClose={()=>setModal(null)}>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();submitModal();}}>
        {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        {modal.type==='fact'&&<><blockquote className="rounded-lg bg-subtle dark:bg-subtle p-3 text-sm">{modal.item.quote}</blockquote><label className="block text-sm">Giá trị xác nhận{modal.item.unit==='VNĐ'?<NumberInput value={form.value} onChange={v=>setForm({...form,value:String(v)})} suffix="VNĐ"/>:<input className={input} value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/>}</label><SearchableSelect value={form.decision} onChange={decision=>setForm({...form,decision})} options={[{value:'confirmed',label:'Xác nhận giá trị'},{value:'rejected',label:'Không sử dụng giá trị'}]}/></>}
        {modal.type==='add'&&<label className="block text-sm">Tên tài liệu<input required className={input} value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/></label>}
        {modal.type==='finding'&&<SearchableSelect value={form.decision} onChange={decision=>setForm({...form,decision})} options={['accept','reject','defer'].map(v=>({value:v,label:labels[v]}))}/>}
        {modal.type==='requirement'&&<SearchableSelect value={form.decision} onChange={decision=>setForm({...form,decision})} options={['submitted','verified','needs_supplement'].map(v=>({value:v,label:labels[v]}))}/>}
        {modal.type==='final'&&<SearchableSelect value={form.decision} onChange={decision=>setForm({...form,decision})} options={[{value:'request_supplement',label:'Yêu cầu bổ sung'},{value:'reviewed',label:'Hoàn tất rà soát nhận xét'}]}/>}
        <label className="block text-sm">{modal.type==='add'?'Nhóm tài liệu':modal.type==='consultation'?'Ý kiến cần xử lý':'Lý do và căn cứ xác nhận'}<textarea required minLength={modal.type==='reopen'?10:3} rows={3} className={input} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
        {modal.type==='consultation'&&<label className="block text-sm">Nội dung giải trình (nếu đã có)<textarea rows={3} className={input} value={form.response} onChange={e=>setForm({...form,response:e.target.value})}/></label>}
        <button type="submit" className={primary} disabled={busy}><Check size={15}/>{busy?'Đang lưu…':'Lưu đánh giá'}</button>
      </form>
    </ReviewModal>}
    {refs&&<ReviewModal heading="Bằng chứng từ tài liệu gốc" onClose={()=>setRefs(null)}><div className="space-y-4">{refs.slice(0,100).map((s,i)=><article key={i} className="rounded-lg border border-border dark:border-border p-4"><div className="flex gap-3 justify-between"><p className="text-xs text-ink-muted dark:text-ink-muted">{d.documents.find(x=>x.id===s.documentId)?.name} · {s.locator}</p><button className={button} onClick={()=>action(()=>showDoc(s.documentId))}>Bản gốc</button></div><p className="mt-3 text-sm whitespace-pre-wrap">{s.quote}</p></article>)}{refs.length>100&&<p>Hiển thị 100 đoạn đầu. Tải bản gốc để đọc toàn bộ tài liệu.</p>}</div></ReviewModal>}
    {preview&&<ReviewModal heading="Xem tài liệu A4" onClose={()=>setPreview(null)}><Suspense fallback={<p>Đang mở trình xem PDF…</p>}><PdfPreview url={preview}/></Suspense></ReviewModal>}
  </div>;
}
