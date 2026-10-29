import {BimOverlay} from '@/features/bim-suite/adapters/controls';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Links of an element: documents of the project library (Hồ sơ tài liệu), workspace tasks (Nhiệm vụ) and acceptance
// records. The database checks that each target belongs to the element's project.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ClipboardCheck, Link2, Plus, X, Loader2, Search, Unlink, Check, ListTodo } from 'lucide-react';
import type { BimLibraryDocument, BimLinkType, BimTask } from '@/features/bim-suite/types/bim.types';
type TaskStatus='todo'|'in_progress'|'done';
const taskStatuses={todo:'Chưa thực hiện',in_progress:'Đang thực hiện',done:'Hoàn thành'};
import {
  useBimElementLinks,
  useAddBimLinks,
  useRemoveBimLink,
  useProjectDocumentSearch,
  useProjectTasks,
} from '../hooks/useBim';
import { formatDate } from '@/features/bim-suite/adapters/utils';

interface BimElementLinksProps {
  projectId: string;
  modelId?: string;
  guid: string;
  canEdit: boolean;
  currentUserName?: string;
  onOpenAcceptance: () => void;
}

const KET_LUAN_LABEL: Record<string, { label: string; cls: string }> = {
  dat: { label: 'Đạt', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  dat_co_dieu_kien: { label: 'Đạt có ĐK', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  khong_dat: { label: 'Không đạt', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300' },
};

const taskStatusLabel = (status: string | null | undefined) =>
  status && status in taskStatuses ? taskStatuses[status as TaskStatus] : null;

type PickerItem = { id: string; title: string; meta: string };

/** Multi-select picker shared by documents and tasks. */
function LinkPicker({
  title,
  subtitle,
  placeholder,
  emptyText,
  unit,
  items,
  isLoading,
  error,
  linkedIds,
  isSaving,
  onSearch,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle: string;
  placeholder: string;
  emptyText: string;
  unit: string;
  items: PickerItem[];
  isLoading: boolean;
  error?: Error | null;
  linkedIds: Set<string>;
  isSaving: boolean;
  onSearch: (text: string) => void;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  React.useEffect(() => {
    const t = setTimeout(() => onSearch(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input, onSearch]);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return createPortal(
    <BimOverlay onClose={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-xl max-h-[80vh] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-tooltip="Đóng"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 border-b border-slate-100 dark:border-slate-700">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <BimInput
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          {error ? (
            <p role="alert" className="p-3 text-rose-600">
              {error.message}
            </p>
          ) : isLoading ? (
            <div className="p-6 flex justify-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-slate-400">{emptyText}</p>
          ) : (
            items.map((item) => {
              const already = linkedIds.has(item.id);
              const checked = picked.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={already}
                  onClick={() => toggle(item.id)}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                    checked
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950'
                      : 'border-slate-100 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${checked || already ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300'}`}
                  >
                    {(checked || already) && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">
                      {item.title}
                    </span>
                    <span className="block text-2xs text-slate-400 mt-0.5">
                      {[item.meta, already ? 'đã liên kết' : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Đã chọn {picked.size} {unit}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={picked.size === 0 || isSaving}
              onClick={() => onConfirm([...picked])}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white flex items-center gap-1.5"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Gắn vào cấu kiện
            </button>
          </div>
        </div>
      </div>
    </BimOverlay>,
    document.body,
  );
}

function DocumentPicker(props: {
  projectId: string;
  linkedIds: Set<string>;
  isSaving: boolean;
  onConfirm: (docs: BimLibraryDocument[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const { data: docs = [], isLoading, error } = useProjectDocumentSearch(props.projectId, search);
  return (
    <LinkPicker
      title="Gắn tài liệu từ Hồ sơ tài liệu"
      subtitle="Chọn một hoặc nhiều tài liệu của dự án"
      placeholder="Tìm theo tên hoặc nhóm tài liệu..."
      emptyText="Không tìm thấy tài liệu phù hợp trong dự án."
      unit="tài liệu"
      items={docs.map((d) => ({ id: d.id, title: d.name, meta: `${d.category} · ${formatDate(d.updated_at)}` }))}
      isLoading={isLoading}
      error={error}
      linkedIds={props.linkedIds}
      isSaving={props.isSaving}
      onSearch={setSearch}
      onConfirm={(ids) => props.onConfirm(docs.filter((d) => ids.includes(d.id)))}
      onClose={props.onClose}
    />
  );
}

function TaskPicker(props: {
  projectId: string;
  linkedIds: Set<string>;
  isSaving: boolean;
  onConfirm: (tasks: BimTask[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const { data: tasks = [], isLoading, error } = useProjectTasks(props.projectId);
  const term = search.toLocaleLowerCase('vi');
  const shown = tasks.filter((t) => !term || t.tieu_de.toLocaleLowerCase('vi').includes(term));
  return (
    <LinkPicker
      title="Gắn cấu kiện vào nhiệm vụ"
      subtitle="Nhiệm vụ của dự án trong workspace"
      placeholder="Tìm nhiệm vụ theo tên..."
      emptyText="Dự án chưa có nhiệm vụ phù hợp."
      unit="nhiệm vụ"
      items={shown.map((t) => ({
        id: t.ma_nhiem_vu,
        title: t.tieu_de,
        meta: [taskStatusLabel(t.trang_thai), t.ngay_han ? `Hạn ${formatDate(t.ngay_han)}` : null]
          .filter(Boolean)
          .join(' · '),
      }))}
      isLoading={isLoading}
      error={error}
      linkedIds={props.linkedIds}
      isSaving={props.isSaving}
      onSearch={setSearch}
      onConfirm={(ids) => props.onConfirm(tasks.filter((t) => ids.includes(t.ma_nhiem_vu)))}
      onClose={props.onClose}
    />
  );
}

export const BimElementLinks: React.FC<BimElementLinksProps> = ({
  projectId,
  modelId,
  guid,
  canEdit,
  currentUserName,
  onOpenAcceptance,
}) => {
  const { data: rows = [], isLoading, error } = useBimElementLinks(projectId, guid);
  const addLinks = useAddBimLinks(projectId);
  const removeLink = useRemoveBimLink(projectId);
  const [picker, setPicker] = useState<'doc' | 'task' | null>(null);
  const linkedIds = (type: BimLinkType) =>
    new Set(rows.filter((r) => r.link.loai_doi_tuong === type).map((r) => String(r.link.doi_tuong_id)));

  const link = async (type: BimLinkType, records: { id: string; name: string }[]) => {
    await addLinks.mutateAsync(
      records.map((r) => ({
        project_id: projectId,
        model_id: modelId || null,
        global_id: guid,
        loai_doi_tuong: type,
        doi_tuong_id: r.id,
        ten_hien_thi: r.name,
        created_by: currentUserName || null,
      })),
    );
    setPicker(null);
  };

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-xs text-rose-600">
          {(error as Error).message}
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Đang tải liên kết...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Chưa có tài liệu, nhiệm vụ hay biên bản gắn với cấu kiện này.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ link: l, record }) => {
            const kind = l.loai_doi_tuong;
            const title =
              kind === 'tai_lieu'
                ? record?.name || l.ten_hien_thi || 'Tài liệu đã bị xóa'
                : kind === 'cong_viec'
                  ? record?.tieu_de || l.ten_hien_thi || 'Nhiệm vụ đã bị xóa'
                  : kind === 'boq'
                    ? l.ten_hien_thi || 'Công tác BOQ'
                    : record?.ten_nghiem_thu || l.ten_hien_thi || 'Biên bản nghiệm thu';
            const meta =
              kind === 'tai_lieu'
                ? record?.category || 'Tài liệu'
                : kind === 'cong_viec'
                  ? [
                      taskStatusLabel(record?.trang_thai),
                      record?.ngay_han ? `hạn ${formatDate(record.ngay_han)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Nhiệm vụ'
                  : kind === 'boq'
                    ? 'BOQ'
                    : 'Biên bản nghiệm thu';
            const verdict = kind === 'nghiem_thu' && record?.ket_luan ? KET_LUAN_LABEL[record.ket_luan] : null;
            const Icon = kind === 'tai_lieu' ? FileText : kind === 'cong_viec' ? ListTodo : ClipboardCheck;
            const open =
              kind === 'tai_lieu' && record
                ? () => window.open(`/documents/${encodeURIComponent(record.id)}`, '_blank', 'noopener')
                : kind === 'nghiem_thu'
                  ? onOpenAcceptance
                  : undefined;
            return (
              <li
                key={l.id}
                className="group flex items-start gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700"
              >
                <Icon
                  className={`w-4 h-4 shrink-0 mt-0.5 ${kind === 'tai_lieu' ? 'text-primary-500' : kind === 'cong_viec' ? 'text-violet-500' : 'text-emerald-500'}`}
                />
                <button type="button" className="flex-1 min-w-0 text-left" disabled={!open} onClick={open}>
                  <span className="block text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2 hover:text-primary-600">
                    {title}
                  </span>
                  <span className="flex items-center gap-1.5 text-2xs text-slate-400 mt-0.5">
                    {meta}
                    {verdict && <span className={`px-1.5 rounded ${verdict.cls}`}>{verdict.label}</span>}
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeLink.mutate(l.id)}
                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-rose-600"
                    data-tooltip="Gỡ liên kết"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setPicker('doc')}
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:border-primary-500 hover:text-primary-600"
          >
            <Link2 className="w-3.5 h-3.5" /> <Plus className="w-3 h-3 -ml-1" /> Gắn tài liệu
          </button>
          <button
            type="button"
            onClick={() => setPicker('task')}
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:border-violet-500 hover:text-violet-600"
          >
            <ListTodo className="w-3.5 h-3.5" /> <Plus className="w-3 h-3 -ml-1" /> Gắn nhiệm vụ
          </button>
        </div>
      )}

      {picker === 'doc' && (
        <DocumentPicker
          projectId={projectId}
          linkedIds={linkedIds('tai_lieu')}
          isSaving={addLinks.isPending}
          onClose={() => setPicker(null)}
          onConfirm={(docs) =>
            void link(
              'tai_lieu',
              docs.map((d) => ({ id: d.id, name: d.name })),
            )
          }
        />
      )}
      {picker === 'task' && (
        <TaskPicker
          projectId={projectId}
          linkedIds={linkedIds('cong_viec')}
          isSaving={addLinks.isPending}
          onClose={() => setPicker(null)}
          onConfirm={(tasks) =>
            void link(
              'cong_viec',
              tasks.map((t) => ({ id: t.ma_nhiem_vu, name: t.tieu_de })),
            )
          }
        />
      )}
    </div>
  );
};

export { KET_LUAN_LABEL };
