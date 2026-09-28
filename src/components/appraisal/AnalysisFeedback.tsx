import {useEffect,useState} from 'react';
import {CheckCircle2,LoaderCircle,AlertTriangle} from 'lucide-react';
import type {Dossier} from '../../types/appraisal';
import {formatDateTime} from '../../lib/utils';

export function AnalysisFeedback({dossier,starting,onResults}:{dossier:Dossier;starting:boolean;onResults:()=>void}){
  const job=dossier.job?.mode==='ocr'?undefined:dossier.job;
  const run=dossier.runs.slice(-1)[0];
  const coverage=run?.aiCoverage;
  const running=job?.status==='running';
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{
    if(!running||!job?.startedAt){setElapsed(0);return;}
    const update=()=>setElapsed(Math.max(0,Math.floor((Date.now()-Date.parse(job.startedAt!))/1000)));
    update();const timer=setInterval(update,1000);return()=>clearInterval(timer);
  },[running,job?.startedAt]);
  const stopped=job&&['failed','cancelled','interrupted'].includes(job.status);
  if(!starting&&!running&&!stopped&&!run)return null;
  return <section role="status" aria-live="polite" className="rounded-xl border border-primary-200 dark:border-slate-700 bg-primary-50 dark:bg-slate-800 p-4 text-sm text-ink dark:text-ink">
    {starting||running?<div className="flex items-start gap-3"><LoaderCircle size={20} aria-hidden="true" className="shrink-0 animate-spin text-primary-600 dark:text-primary-300"/><div><p className="font-semibold">{starting?'Đang gửi yêu cầu kiểm tra…':'Đang kiểm tra hồ sơ'+(job?.useModel?' và phân tích bằng AI…':'…')}</p><p className="mt-1 text-ink-secondary dark:text-ink-secondary">Kết quả sẽ tự mở khi hoàn tất. {running&&<span aria-live="off">Đã chờ {elapsed} giây.</span>}</p></div></div>:<>
      {stopped?<div className="flex items-start gap-3"><AlertTriangle size={20} aria-hidden="true" className="shrink-0 text-amber-700 dark:text-amber-300"/><div><p className="font-semibold">{job.status==='cancelled'?'Đã hủy lượt kiểm tra':job.status==='interrupted'?'Lượt kiểm tra bị gián đoạn':'Lượt kiểm tra chưa thành công'}</p><p className="mt-1">Chưa có kết quả mới cho lượt này. {run?'Kết quả bên dưới thuộc lượt trước. ':''}Anh có thể bấm Chạy kiểm tra hồ sơ để thử lại.</p></div></div>:null}
      {run&&<div className={'flex flex-wrap items-start justify-between gap-3 '+(stopped?'mt-3 border-t border-border dark:border-border pt-3':'')}><div className="flex min-w-0 flex-1 items-start gap-3"><CheckCircle2 size={20} aria-hidden="true" className="shrink-0 text-primary-700 dark:text-primary-300"/><div><p className="font-semibold">{run.stale?'Kết quả cần chạy lại':stopped?'Kết quả lượt trước':'Đã có kết quả kiểm tra'} · {run.findings.length} nội dung · {run.aiNotes.length} đề xuất AI</p><p className="mt-1 text-ink-secondary dark:text-ink-secondary">{run.aiStatus}</p><p className="mt-1 text-xs text-ink-muted dark:text-ink-muted">Lượt kiểm tra: {formatDateTime(run.createdAt)}</p></div></div><button type="button" onClick={onResults} className="rounded-lg bg-primary-600 dark:bg-primary-500 px-3 py-2 font-semibold text-white dark:text-white hover:bg-primary-700 dark:hover:bg-primary-600">Xem kết quả</button></div>}
      {coverage&&<details className="mt-3 text-xs"><summary className="cursor-pointer">Phạm vi AI: {coverage.selectedSegments}/{coverage.totalSegments} trích đoạn · {coverage.selectedCharacters}/{coverage.totalCharacters} ký tự</summary><ul className="mt-2 space-y-1">{coverage.documents.map((document,index)=><li key={index}>{document.name}: {document.selectedSegments}/{document.totalSegments} đoạn{document.complete?'':' · chưa đọc toàn bộ'}{document.locators.length?' · '+document.locators.join(', '):''}</li>)}</ul></details>}
    </>}
  </section>;
}
