import { useEffect, useState } from 'react';
import { PdfPreview } from '@/components/appraisal/PdfPreview';
import { supabase } from '../adapters/supabase';
import { BimService } from '../services/BimService';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
export function BimDrawingPane({
  projectId,
  onClose,
  className = '',
}: {
  projectId: string;
  onClose: () => void;
  className?: string;
}) {
  const [docs, setDocs] = useState<{ id: string; name: string; path: string }[]>([]),
    [selected, setSelected] = useState(''),
    [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    supabase
      .from('documents')
      .select('id,name,current_version_id')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .limit(100)
      .then(async ({ data, error }) => {
        if (error) {
          if (alive) setError(error.message);
          return;
        }
        const result = [];
        for (const d of data || []) {
          const r = await supabase
            .from('document_versions')
            .select('storage_path')
            .eq('id', d.current_version_id)
            .maybeSingle();
          if (r.data?.storage_path) result.push({ id: d.id, name: d.name, path: r.data.storage_path });
        }
        if (alive) setDocs(result);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);
  useEffect(() => {
    let alive = true;
    setUrl('');
    const d = docs.find((d) => d.id === selected);
    if (d)
      BimService.getSignedFileUrl(d.path).then((u) => {
        if (alive) setUrl(u || '');
      });
    return () => {
      alive = false;
    };
  }, [selected, docs]);
  return (
    <aside
      className={
        'flex flex-col gap-3 border-l border-border bg-surface p-3 dark:border-slate-800 dark:bg-slate-900 ' + className
      }
    >
      <div className="flex items-center justify-between gap-3">
        <strong>Bản vẽ dự án</strong>
        <button type="button" onClick={onClose}>
          Đóng
        </button>
      </div>
      <SearchableSelect
        value={selected}
        onChange={setSelected}
        options={docs.map((d) => ({ value: d.id, label: d.name }))}
        placeholder="Chọn bản vẽ PDF…"
      />
      {error && <p role="alert">{error}</p>}
      {url ? (
        <PdfPreview url={url} />
      ) : (
        <p className="text-sm text-ink-muted dark:text-slate-400">Chọn bản vẽ trong hồ sơ CDE của dự án.</p>
      )}
    </aside>
  );
}
