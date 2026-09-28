import { useState } from 'react';
import type { Health } from '../../types/appraisal';
import { appraisalService as api } from '../../services/appraisalService';
import { formatDateTime } from '../../lib/utils';

export function ModelConnection({health,onRefresh}:{health:Health|null;onRefresh:()=>Promise<unknown>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const provider=health?.modelProvider;
  if(!provider)return null;
  const connection=provider.connection;
  return <section className="rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-3 text-sm text-ink dark:text-ink space-y-2">
    <div className="flex flex-wrap gap-3 items-center"><strong>{provider.label}{provider.model?' · '+provider.model:''}</strong>
      <span>{!provider.configured?'Chưa đủ cấu hình':connection.status==='connected'?'Đã nhận phản hồi từ mô hình':connection.status==='error'?'Kết nối gần nhất thất bại':'Đã cấu hình · chưa kiểm tra kết nối'}</span>
      {provider.id==='vertex'&&<button disabled={busy||!provider.configured} className="rounded-lg border border-primary-200 dark:border-primary-700 px-3 py-2 text-primary-700 dark:text-primary-300 disabled:opacity-50" onClick={async()=>{setBusy(true);setError('');try{const result=await api.checkModel();if(result.connection.status==='error')setError(result.connection.message);await onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Đang kết nối…':'Kiểm tra kết nối AI'}</button>}
    </div>
    {connection.checkedAt&&<p className="text-xs text-ink-muted dark:text-ink-muted">Lần phản hồi gần nhất: {formatDateTime(connection.checkedAt)} · {connection.message}</p>}
    <p className="text-xs text-ink-muted dark:text-ink-muted">Kiểm tra kết nối chỉ gửi lời nhắn thử. Khi bật phân tích AI trong hồ sơ, các trích đoạn được gửi đến nhà cung cấp mô hình để xử lý.</p>
    {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
  </section>;
}
