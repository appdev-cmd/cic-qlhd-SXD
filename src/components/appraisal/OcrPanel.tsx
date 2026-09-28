import React,{useEffect,useState} from 'react';
import {appraisalService as api} from '../../services/appraisalService';
import type {Dossier} from '../../types/appraisal';
import {SearchableSelect} from '../ui/SearchableSelect';
const button='rounded-lg border border-border dark:border-border px-3 py-2 text-sm text-ink dark:text-ink bg-surface dark:bg-surface disabled:opacity-50';
export function OcrPanel({dossier:d,onChange,poll=true}:{dossier:Dossier;onChange:(d:Dossier)=>void;poll?:boolean}){
 const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pdfs=d.documents.filter(x=>x.name.toLowerCase().endsWith('.pdf'));const running=d.job?.status==='running';
 const ocrStatus=d.job?.mode==='ocr'?d.job.status:undefined;
 const outcome:Record<string,string>={completed:'OCR đã hoàn tất. Mở tài liệu để đối chiếu và xác nhận dữ liệu trích xuất.',failed:'OCR chưa hoàn tất. Bản gốc được giữ nguyên; có thể chọn tài liệu và chạy lại.',cancelled:'Đã hủy OCR. Bản gốc được giữ nguyên.',interrupted:'Công việc OCR bị gián đoạn. Tải lại hồ sơ và chạy lại nếu cần.'};
 useEffect(()=>{if(!running||!poll)return;let live=true;const timer=setInterval(()=>api.get(d.id).then(x=>{if(live)onChange(x);}).catch(e=>{if(live)setError(e.message);}),4000);return()=>{live=false;clearInterval(timer);};},[d.id,running,onChange,poll]);
 const run=async(path:string)=>{setBusy(true);setError('');try{onChange(await api.mutate(d.id,path,{revision:d.revision}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(!pdfs.length)return null;
 return <section className="rounded-xl border border-border dark:border-border p-4 space-y-3 text-ink dark:text-ink"><h3 className="font-semibold">Đọc tài liệu scan bằng OCR</h3><p className="text-sm text-ink-muted dark:text-ink-muted">Đọc các trang chưa có lớp chữ (tối đa 300 trang), giữ nguyên bản gốc. Sau OCR cần xác nhận lại dữ liệu và phiếu chuyên môn.</p><div className="flex flex-wrap gap-3"><div className="min-w-64 flex-1"><SearchableSelect value={selected} disabled={busy||running} placeholder="Chọn PDF cần đọc" onChange={setSelected} options={pdfs.map(doc=>({value:doc.id,label:doc.name}))}/></div><button className={button} disabled={!pdfs.some(x=>x.id===selected)||busy||running||d.readOnly||!!d.finalReview} onClick={()=>run(`/documents/${selected}/ocr`)}>Đọc OCR</button>{running&&<button className={button} disabled={busy||d.readOnly} onClick={()=>run('/cancel')}>Hủy công việc</button>}</div>{running&&<p role="status" className="text-sm">Đang xử lý nền. Có thể tiếp tục xem các phân hệ khác.</p>}{ocrStatus&&outcome[ocrStatus]&&<p role="status" className="text-sm text-ink dark:text-ink">{outcome[ocrStatus]}</p>}{error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}</section>;
}
