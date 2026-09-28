import {useEffect,useState} from 'react';
import {appraisalService as api} from '../../services/appraisalService';
import type {Dossier} from '../../types/appraisal';
import {DossierGrid} from './DossierGrid';
import {ReviewModal} from './ReviewModal';
import {SearchableSelect} from '../ui/SearchableSelect';
import {DateInput} from '../ui/DateInput';

interface LegalItem {id:string;name:string;condition:string;conditional:boolean;applicability:string;state:string;requirementIds:string[];documentIds:string[];note:string;reviewedBy:string|null;legalRef:{label:string;url:string}}
interface LegalOverview {profile:{code:string;label:string;reason:string;scopeLabel:string;confirmed:boolean;context:Record<string,string>;templates:Record<string,string|null>};checklist:LegalItem[];warnings:string[];scopeNotes:string[]}
const button='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-xs font-semibold text-primary-700 dark:text-primary-300 disabled:opacity-50';
const input='focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 w-full rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-sm text-ink dark:text-ink';
const states:Record<string,string>={required:'Thành phần cơ bản',applicable:'Áp dụng',not_applicable:'Không áp dụng',unknown:'Chưa xác định',attached:'Đã liên kết tệp; cần kiểm tra',missing:'Chưa liên kết tệp'};
export function LegalReview({dossier,onChange}:{dossier:Dossier;onChange:(d:Dossier)=>void}){
  const [data,setData]=useState<LegalOverview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [modal,setModal]=useState<'context'|LegalItem|null>(null);
  const [form,setForm]=useState({submissionDate:'',scope:'construction',stage:'original',priorStatus:'unknown',note:'',applicability:'unknown',requirementIds:[] as string[]});
  const [initial,setInitial]=useState('');
  useEffect(()=>{let live=true;api.legal(dossier.id).then(x=>{if(live)setData(x);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[dossier.id,dossier.revision]);
  function open(item:'context'|LegalItem){
    const context=data?.profile.context||{};
    const next={submissionDate:context.submissionDate||dossier.legalDate,scope:context.scope||'construction',stage:context.stage||'original',priorStatus:context.priorStatus||'unknown',
      note:item==='context'?(context.note||''):item.note,applicability:item==='context'?'unknown':item.conditional?item.applicability:'applicable',requirementIds:item==='context'?[]:item.requirementIds};
    setForm(next);setInitial(JSON.stringify(next));setModal(item);setError('');
  }
  async function save(){
    if(!modal)return;setBusy(true);setError('');
    try{
      const body=modal==='context'?{submissionDate:form.submissionDate,scope:form.scope,stage:form.stage,priorStatus:form.priorStatus,note:form.note}:{applicability:form.applicability,requirementIds:form.requirementIds,note:form.note};
      onChange(await api.mutate(dossier.id,modal==='context'?'/legal/context':'/legal/requirements/'+modal.id,{revision:dossier.revision,...body}));setModal(null);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="space-y-4 text-ink dark:text-ink">
    {error&&!modal&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    {data&&<>
      <div className="rounded-xl border border-primary-200 dark:border-slate-700 bg-primary-50 dark:bg-slate-800 p-4 space-y-2">
        <h3 className="font-semibold">{data.profile.label}</h3>
        <p className="text-sm">{data.profile.reason}</p><p className="text-sm">{data.profile.scopeLabel} · {data.profile.confirmed?'Đã xác nhận lựa chọn':'Chờ chuyên viên xác nhận'}</p>
        <button className={button} onClick={()=>open('context')}>Xác nhận phạm vi và ngày trình</button>
      </div>
      <p className="text-sm text-ink-secondary dark:text-ink-secondary">Đối chiếu danh mục theo pháp luật với tài liệu đã nộp. Thành phần có điều kiện cần ghi rõ có áp dụng hay không và căn cứ. Liên kết tệp chưa xác nhận đủ nội dung hoặc chữ ký.</p>
      <DossierGrid rows={data.checklist} storageKey={'legal-checklist-'+data.profile.code} columns={[
        {label:'Thành phần',value:r=>r.name,width:240},
        {label:'Điều kiện áp dụng',value:r=>r.condition,width:280},
        {label:'Trạng thái',value:r=>states[r.state],width:180,render:r=><div>{states[r.state]}<p className="mt-2 text-ink-muted dark:text-ink-muted">{r.documentIds.length} tệp liên kết</p></div>},
        {label:'Căn cứ',value:r=>r.legalRef.label,width:220,render:r=><a href={r.legalRef.url} target="_blank" rel="noreferrer" className="text-primary-700 dark:text-primary-300">{r.legalRef.label}</a>},
        {label:'Ý kiến',value:r=>r.note,width:230,render:r=><div className="space-y-2"><p>{r.note||'Chưa có ý kiến'}</p><button className={button} onClick={()=>open(r)}>Đối chiếu</button></div>},
      ]}/>
      {!data.checklist.length&&<p className="text-sm">Checklist này dành cho phạm vi cơ quan chuyên môn về xây dựng. Phạm vi khác cần đối chiếu nhiệm vụ được giao trước khi lập danh mục.</p>}
      <details className="rounded-xl border border-border dark:border-border p-4"><summary className="cursor-pointer font-semibold">Phạm vi nghiệp vụ và chất lượng nguồn</summary><ul className="list-disc pl-5 text-sm space-y-2 mt-3">{[...data.scopeNotes,...data.warnings].map(t=><li key={t}>{t}</li>)}</ul></details>
    </>}
    {modal&&<ReviewModal heading={modal==='context'?'Xác nhận phạm vi pháp lý':modal.name} dirty={JSON.stringify(form)!==initial} onClose={()=>setModal(null)}>
      <div className="space-y-4">
        {modal==='context'?<>
          <label className="block text-sm">Ngày trình hồ sơ<DateInput value={form.submissionDate} onChange={submissionDate=>setForm({...form,submissionDate})}/></label>
          <label className="block text-sm">Phạm vi<SearchableSelect value={form.scope} onChange={scope=>setForm({...form,scope})} options={[{value:'construction',label:'Cơ quan chuyên môn về xây dựng'},{value:'decision_maker',label:'Đơn vị của người quyết định đầu tư'},{value:'concurrent',label:'Đồng thời hai phạm vi'},{value:'unknown',label:'Chưa xác định'}]}/></label>
          <label className="block text-sm">Lần trình<SearchableSelect value={form.stage} onChange={stage=>setForm({...form,stage})} options={[{value:'original',label:'Trình mới / hồ sơ gốc'},{value:'amendment',label:'Điều chỉnh'},{value:'remaining_phase',label:'Giai đoạn còn lại'}]}/></label>
          <label className="block text-sm">Tình trạng trước 01/07/2026 (nếu có)<SearchableSelect value={form.priorStatus} onChange={priorStatus=>setForm({...form,priorStatus})} options={[{value:'unknown',label:'Không có hồ sơ trước mốc / chưa xác định'},{value:'eligible_pending',label:'Đã trình, đủ điều kiện, chưa có kết quả'},{value:'ineligible',label:'Đã trình nhưng không đủ điều kiện thẩm định'},{value:'result_ineligible',label:'Kết quả chưa đủ điều kiện tổng hợp phê duyệt'},{value:'result_eligible',label:'Đã có kết quả đủ điều kiện'}]}/></label>
        </>:<>
          <p className="text-sm">{modal.condition}</p>
          {modal.conditional&&<SearchableSelect value={form.applicability} onChange={applicability=>setForm({...form,applicability})} options={['unknown','applicable','not_applicable'].map(value=>({value,label:states[value]}))}/>}
          <fieldset className="rounded-lg border border-border dark:border-border p-3"><legend className="px-1 text-sm">Nhóm tài liệu chứa chứng cứ</legend><div className="max-h-52 overflow-auto space-y-2">{dossier.requirements.map(r=><label key={r.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="accent-primary-500 dark:accent-primary-400" checked={form.requirementIds.includes(r.id)} onChange={e=>setForm({...form,requirementIds:e.target.checked?[...form.requirementIds,r.id]:form.requirementIds.filter(id=>id!==r.id)})}/>{r.name}</label>)}</div></fieldset>
        </>}
        <label className="block text-sm">Căn cứ và ý kiến (tối thiểu 10 ký tự)<textarea className={input} rows={4} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
        {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
        <button className={button} disabled={busy||form.note.trim().length<10} onClick={save}>Lưu đối chiếu</button>
      </div>
    </ReviewModal>}
  </section>;
}
