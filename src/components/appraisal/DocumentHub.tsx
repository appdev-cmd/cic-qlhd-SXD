import React,{useEffect,useState,lazy,Suspense} from 'react';
import {appraisalService as api} from '../../services/appraisalService';
import type {DossierSummary} from '../../types/appraisal';
import {ProjectSelect} from './ProjectSelect';
import {SearchableSelect} from '../ui/SearchableSelect';
import {EntityLink} from '../ui/EntityLink';
import {ReviewModal} from './ReviewModal';
const PdfPreview=lazy(()=>import('./PdfPreview').then(m=>({default:m.PdfPreview})));
const button='rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-3 text-sm text-ink dark:text-ink disabled:opacity-50';
export function DocumentHub(){
  const [project,setProject]=useState('');const [search,setSearch]=useState('');const [items,setItems]=useState<DossierSummary[]>([]);const [selected,setSelected]=useState<DossierSummary|null>(null);
  const [kind,setKind]=useState('internal');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [preview,setPreview]=useState<string|null>(null);
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{api.page({projectId:project,search,limit:50}).then(p=>{if(active){setItems(p.items);setError('');}}).catch(e=>{if(active)setError(e.message);});},180);return()=>{active=false;clearTimeout(timer);};},[project,search]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const path=(format:string)=>`/cases/${selected?.id}/`+(kind==='internal'?`internal-record/${format}`:kind.startsWith('procedure-')?`procedure-review/${kind.slice(10)}/${format}`:`export/${kind}/${format}`);
  const act=async(format:string,view=false)=>{if(!selected)return;setBusy(true);setError('');try{if(view)setPreview(URL.createObjectURL(await api.blob(path(format))));else await api.download(path(format),`${kind}.${format}`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <div className="space-y-5 text-ink dark:text-ink"><h1 className="text-2xl font-bold">Văn bản & In ấn A4</h1><p className="text-sm text-ink-muted dark:text-ink-muted">Chọn hồ sơ để xuất văn bản từ dữ liệu đang lưu. Các bản xuất là dự thảo chưa ký, chưa ban hành.</p>
    <div className="grid md:grid-cols-3 gap-4"><label className="text-sm">Dự án<ProjectSelect allowAll value={project} onChange={id=>{setProject(id==='all'?'':id);setSelected(null);}}/></label><label className="text-sm">Lần nộp hồ sơ<SearchableSelect value={selected?.id||''} onChange={id=>{setSelected(items.find(r=>r.id===id)||null);setKind('internal');}} onSearchChange={setSearch} options={items.map(r=>({value:r.id,label:r.name}))}/></label><label className="text-sm">Loại văn bản<SearchableSelect value={kind} onChange={setKind} options={[{value:'internal',label:'Phiếu theo dõi xử lý nội bộ'},...(selected?.procedure==='bcnckt'?[{value:'report',label:'Báo cáo hỗ trợ kiểm tra'},{value:'notice',label:'Dự thảo kết quả thẩm định'},{value:'supplement',label:'Dự thảo yêu cầu bổ sung'},{value:'suspension',label:'Dự thảo tạm dừng'}]:selected?[{value:'procedure-review',label:'Phiếu rà soát chuyên môn'},{value:'procedure-application',label:selected.procedure==='gpxd'?'Đơn đề nghị cấp phép':'Báo cáo hoàn thành thi công'},{value:'procedure-draft',label:selected.procedure==='gpxd'?'Khung dự thảo GPXD':'Khung thông báo nghiệm thu'},...(selected.procedure==='nghiem_thu'?[{value:'procedure-minutes',label:'Biên bản hiện trường'}]:[])]:[])]}/></label></div>
    {selected&&<div className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-5 space-y-4"><EntityLink type="dossier" id={selected.id} name={selected.name}/><p className="text-sm text-ink-muted dark:text-ink-muted">Khổ A4 · Lề 30/20/22/20 mm · Times New Roman</p><div className="flex gap-3"><button className={button} disabled={busy} onClick={()=>act('pdf',true)}>Xem trước A4</button><button className={button} disabled={busy} onClick={()=>act('pdf')}>Tải PDF</button><button className={button} disabled={busy} onClick={()=>act('docx')}>Tải DOCX</button></div></div>}
    {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    {preview&&<ReviewModal heading="Xem trước văn bản A4" onClose={()=>setPreview(null)}><Suspense fallback={<p>Đang tải bản xem trước…</p>}><PdfPreview url={preview}/></Suspense></ReviewModal>}
  </div>;
}
