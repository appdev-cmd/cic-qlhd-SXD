import { formatDate as sxdFormatDate } from '@/lib/utils';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimIssuesPanel.tsx
// Phối hợp vướng mắc giữa chủ đầu tư – tư vấn – nhà thầu trên mô hình 3D (chuẩn BCF 2.1)

import React, { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Plus,
  Search,
  FileDown,
  FileUp,
  Loader2,
  ArrowLeft,
  Crosshair,
  Send,
  Calendar,
  User,
  Camera,
  CheckCircle2,
  Box,
  PenLine,
} from 'lucide-react';
import { BimMarkupEditor } from './BimMarkupEditor';
import {
  BimIssue,
  BimIssuePriority,
  BimIssueStatus,
  BimIssueType,
  BimRecordType,
  BimResponsibleParty,
  BimViewpoint,
} from '@/features/bim-suite/types/bim.types';
import { RECORD_TYPE_LABELS, needsReply } from '../lib/bimRecords';
import {
  useCreateBimIssue,
  useUpdateBimIssue,
  useBimIssueComments,
  useAddBimIssueComment,
  useBimProjectPeople,
} from '../hooks/useBim';
import { BimService } from '../services/BimService';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { formatDate } from '@/features/bim-suite/adapters/utils';
import { exportIssuesToBcf, importIssuesFromBcf } from '../lib/bcf';

export const ISSUE_STATUS: Record<BimIssueStatus, { label: string; cls: string }> = {
  open: { label: 'Đang mở', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300' },
  in_progress: { label: 'Đang xử lý', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  resolved: {
    label: 'Đã khắc phục',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  },
  closed: { label: 'Đã đóng', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

const PRIORITY: Record<BimIssuePriority, { label: string; dot: string }> = {
  low: { label: 'Thấp', dot: 'bg-slate-400 dark:bg-slate-400' },
  normal: { label: 'Bình thường', dot: 'bg-primary-500' },
  high: { label: 'Cao', dot: 'bg-amber-500 dark:bg-amber-500' },
  critical: { label: 'Khẩn cấp', dot: 'bg-rose-600 dark:bg-rose-600' },
};

const TYPE_LABEL: Record<BimIssueType, string> = {
  thiet_ke: 'Lỗi thiết kế',
  va_cham: 'Va chạm cấu kiện',
  hien_truong: 'Vướng mắc hiện trường',
  giai_phong_mat_bang: 'GPMB & hạ tầng',
};

const PARTY_LABEL: Record<BimResponsibleParty, string> = {
  chu_dau_tu: 'Chủ đầu tư / Ban QLDA',
  tu_van_thiet_ke: 'Tư vấn thiết kế',
  tu_van_giam_sat: 'Tư vấn giám sát',
  nha_thau: 'Nhà thầu thi công',
  khac: 'Đơn vị khác',
};

/** Ảnh trong kho BIM (private): tạo URL có chữ ký khi hiển thị */
const BimStorageImage: React.FC<{ path: string; alt: string; className?: string }> = ({ path, alt, className }) => {
  const { data: url } = useQuery({
    queryKey: ['bim-signed-url', path],
    queryFn: () => BimService.getSignedFileUrl(path),
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
  });
  if (!url) return <div className={`${className || ''} bg-slate-100 dark:bg-slate-800 animate-pulse`} />;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
};

const inputCls =
  'w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';

export interface BimIssueDraft {
  modelId?: string;
  screenshot: string | null;
  viewpoint: BimViewpoint | null;
  guid: string | null;
  expressId: number | null;
  elementName: string | null;
  /** Nội dung điền sẵn (VD khi tạo vướng mắc từ kết quả dò va chạm) */
  title?: string;
  description?: string;
  issueType?: BimIssueType;
  priority?: BimIssuePriority;
  dueDate?: string;
}

interface BimIssuesPanelProps {
  projectId: string;
  projectName?: string;
  modelId?: string;
  canEdit: boolean;
  currentUser?: { id: string; name: string } | null;
  /** Bản nháp từ nút chụp ảnh (mở thẳng form tạo) */
  draft: BimIssueDraft | null;
  onDraftConsumed: () => void;
  onRequestDraft: () => BimIssueDraft;
  onShowIssue: (issue: BimIssue) => void;
  className?: string;
}

const IssueForm: React.FC<{
  projectId: string;
  modelId?: string;
  draft: BimIssueDraft;
  currentUser?: { id: string; name: string } | null;
  onDone: () => void;
}> = ({ projectId, modelId, draft, currentUser, onDone }) => {
  const createMutation = useCreateBimIssue(projectId);
  const { data: people = [] } = useBimProjectPeople(projectId);
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(draft.screenshot);
  const [markupOpen, setMarkupOpen] = useState(false);
  const [form, setForm] = useState({
    title: draft.title || '',
    description: draft.description || '',
    issue_type: (draft.issueType || 'thiet_ke') as BimIssueType,
    priority: (draft.priority || 'normal') as BimIssuePriority,
    don_vi_xu_ly: '' as BimResponsibleParty | '',
    assigned_to: '',
    due_date: draft.dueDate || '',
    loai_ho_so: 'vuong_mac' as BimRecordType,
    ben_nhan: '',
    han_tra_loi: '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      let screenshotUrl: string | null = null;
      if (screenshot) {
        screenshotUrl = await BimService.uploadIssueScreenshot(projectId, screenshot).catch((err) => {
          addToast({ title: 'Không lưu được ảnh chụp', message: err.message, type: 'warning' });
          return null;
        });
      }
      const assignee = people.find((p) => p.id === form.assigned_to);
      await createMutation.mutateAsync({
        project_id: projectId,
        model_id: draft.modelId || modelId || null,
        title: form.title.trim(),
        description: form.description || null,
        issue_type: form.issue_type,
        priority: form.priority,
        status: 'open',
        target_element_guid: draft.guid,
        target_express_id: draft.expressId,
        viewpoint: draft.viewpoint,
        screenshot_url: screenshotUrl,
        assigned_to: form.assigned_to || null,
        assigned_to_name: assignee?.ten || null,
        don_vi_xu_ly: form.don_vi_xu_ly || null,
        due_date: form.due_date || null,
        created_by: currentUser?.id || null,
        created_by_name: currentUser?.name || null,
        ...(needsReply(form.loai_ho_so)
          ? {
              loai_ho_so: form.loai_ho_so,
              ben_nhan: form.ben_nhan.trim() || null,
              han_tra_loi: form.han_tra_loi || null,
            }
          : {}),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-3 space-y-2.5 text-xs">
      {screenshot && (
        <div className="relative group">
          <img
            src={screenshot}
            alt="Ảnh chụp mô hình"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700"
          />
          <button
            type="button"
            onClick={() => setMarkupOpen(true)}
            className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-slate-900/80 hover:bg-primary-600 text-white text-2xs font-semibold flex items-center gap-1 shadow dark:bg-slate-900"
          >
            <PenLine className="w-3 h-3" /> Vẽ ghi chú lên ảnh
          </button>
        </div>
      )}
      {markupOpen && screenshot && (
        <BimMarkupEditor
          image={screenshot}
          title="Ghi chú vướng mắc"
          onCancel={() => setMarkupOpen(false)}
          onSave={(url) => {
            setScreenshot(url);
            setMarkupOpen(false);
          }}
        />
      )}
      {draft.guid && (
        <p className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300">
          <Box className="w-3.5 h-3.5" /> Gắn cấu kiện:{' '}
          <strong className="truncate">{draft.elementName || draft.guid}</strong>
        </p>
      )}
      <label className="block space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Tiêu đề *</span>
        </div>
        <BimInput
          required
          autoFocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="VD: Xung đột dầm D1 với ống thoát nước"
          className={inputCls}
        />
      </label>
      <label className="block space-y-1">
        <span className="font-semibold text-slate-600 dark:text-slate-300">Loại hồ sơ</span>
        <BimSelect
          value={form.loai_ho_so}
          onChange={(e) => setForm({ ...form, loai_ho_so: e.target.value as BimRecordType })}
          className={inputCls}
        >
          {Object.entries(RECORD_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </BimSelect>
      </label>
      {needsReply(form.loai_ho_so) && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Bên nhận</span>
            <BimInput
              value={form.ben_nhan}
              maxLength={200}
              onChange={(e) => setForm({ ...form, ben_nhan: e.target.value })}
              placeholder="VD: Tư vấn thiết kế"
              className={inputCls}
            />
          </label>
          <label className="space-y-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Hạn trả lời</span>
            <BimInput
              type="date"
              value={form.han_tra_loi}
              onChange={(e) => setForm({ ...form, han_tra_loi: e.target.value })}
              className={inputCls}
            />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Loại</span>
          <BimSelect
            value={form.issue_type}
            onChange={(e) => setForm({ ...form, issue_type: e.target.value as BimIssueType })}
            className={inputCls}
          >
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </BimSelect>
        </label>
        <label className="space-y-1">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Mức độ</span>
          <BimSelect
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as BimIssuePriority })}
            className={inputCls}
          >
            {Object.entries(PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </BimSelect>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="font-semibold text-slate-600 dark:text-slate-300">Đơn vị chịu trách nhiệm</span>
        <BimSelect
          value={form.don_vi_xu_ly}
          onChange={(e) => setForm({ ...form, don_vi_xu_ly: e.target.value as BimResponsibleParty })}
          className={inputCls}
        >
          <option value="">— Chưa xác định —</option>
          {Object.entries(PARTY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </BimSelect>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Người xử lý</span>
          <BimSelect
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            className={inputCls}
          >
            <option value="">— Chưa giao —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ten}
              </option>
            ))}
          </BimSelect>
        </label>
        <label className="space-y-1">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Hạn xử lý</span>
          <BimInput
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            className={inputCls}
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="font-semibold text-slate-600 dark:text-slate-300">Mô tả</span>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Vị trí, lý trình, kích thước sai khác, đề xuất xử lý..."
          className={inputCls}
        />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{' '}
          {needsReply(form.loai_ho_so) ? 'Lập hồ sơ' : 'Ghi nhận vướng mắc'}
        </button>
      </div>
    </form>
  );
};

/** Trả lời của bên nhận cho RFI / RFA / RFP / NCR. Thời điểm và người trả lời do máy chủ gán. */
const RecordReply: React.FC<{ issue: BimIssue; projectId: string; canEdit: boolean }> = ({
  issue,
  projectId,
  canEdit,
}) => {
  const updateMutation = useUpdateBimIssue(projectId);
  const [text, setText] = useState(issue.noi_dung_tra_loi ?? '');
  const overdue =
    !issue.noi_dung_tra_loi &&
    issue.han_tra_loi &&
    new Date(issue.han_tra_loi + 'T23:59:59+07:00').getTime() < Date.now();
  return (
    <div className="space-y-1.5 rounded-xl border border-sky-200 p-2.5 dark:border-sky-800">
      <p className="font-semibold text-slate-700 dark:text-slate-200">
        Trả lời {issue.so_hieu ?? ''}
        {overdue && <span className="ml-1.5 text-rose-600">· quá hạn trả lời</span>}
      </p>
      {issue.noi_dung_tra_loi ? (
        <>
          <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{issue.noi_dung_tra_loi}</p>
          {issue.tra_loi_luc && (
            <p className="text-2xs text-slate-400">Trả lời lúc {formatDateTime(new Date(issue.tra_loi_luc))}</p>
          )}
        </>
      ) : (
        <p className="italic text-slate-400">Chưa có trả lời.</p>
      )}
      {canEdit && (
        <>
          <textarea
            rows={3}
            value={text}
            maxLength={8000}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nội dung trả lời của bên nhận..."
            className={inputCls}
          />
          <button
            type="button"
            disabled={updateMutation.isPending || text.trim() === (issue.noi_dung_tra_loi ?? '').trim()}
            onClick={() =>
              void updateMutation.mutateAsync({ id: issue.id, updates: { noi_dung_tra_loi: text.trim() || null } })
            }
            className="rounded-xl bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-600"
          >
            {updateMutation.isPending ? 'Đang lưu…' : issue.noi_dung_tra_loi ? 'Cập nhật trả lời' : 'Ghi trả lời'}
          </button>
        </>
      )}
    </div>
  );
};

const IssueDetail: React.FC<{
  issue: BimIssue;
  projectId: string;
  canEdit: boolean;
  currentUser?: { id: string; name: string } | null;
  onBack: () => void;
  onShow: () => void;
}> = ({ issue, projectId, canEdit, currentUser, onBack, onShow }) => {
  const updateMutation = useUpdateBimIssue(projectId);
  const { data: comments = [] } = useBimIssueComments(issue.id);
  const addComment = useAddBimIssueComment(issue.id);
  const [text, setText] = useState('');
  const overdue =
    issue.due_date &&
    issue.status !== 'resolved' &&
    issue.status !== 'closed' &&
    new Date(issue.due_date + 'T23:59:59+07:00').getTime() < Date.now();

  const changeStatus = async (status: BimIssueStatus) => {
    if (status === issue.status) return;
    await updateMutation.mutateAsync({
      id: issue.id,
      updates: { status },
    });
    await addComment.mutateAsync({
      body: `${currentUser?.name || 'Người dùng'} chuyển trạng thái: ${ISSUE_STATUS[issue.status].label} → ${ISSUE_STATUS[status].label}`,
      author: currentUser?.name,
      authorId: currentUser?.id,
      system: true,
    });
  };

  const send = async () => {
    if (!text.trim()) return;
    await addComment.mutateAsync({
      body: text.trim(),
      author: currentUser?.name || 'Cán bộ',
      authorId: currentUser?.id,
    });
    setText('');
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center gap-2 p-2 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
          data-tooltip="Quay lại"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {issue.so_hieu && (
          <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 font-mono text-2xs font-bold text-sky-800 dark:bg-sky-900 dark:text-sky-200">
            {issue.so_hieu}
          </span>
        )}
        <span className="flex-1 font-semibold text-slate-800 dark:text-slate-100 truncate">{issue.title}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {issue.screenshot_url && (
          <button
            type="button"
            onClick={onShow}
            className="block w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-primary-500"
          >
            <BimStorageImage path={issue.screenshot_url} alt="Ảnh chụp vướng mắc" className="w-full min-h-[120px]" />
          </button>
        )}
        <button
          type="button"
          onClick={onShow}
          disabled={!issue.viewpoint && !issue.target_element_guid}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white font-semibold"
        >
          <Crosshair className="w-3.5 h-3.5" /> Xem vị trí trên mô hình
        </button>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-slate-400 mb-0.5">Trạng thái</span>
            {canEdit ? (
              <BimSelect
                value={issue.status}
                onChange={(e) => changeStatus(e.target.value as BimIssueStatus)}
                className={inputCls}
              >
                {Object.entries(ISSUE_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </BimSelect>
            ) : (
              <span className={`inline-block px-2 py-0.5 rounded-md ${ISSUE_STATUS[issue.status].cls}`}>
                {ISSUE_STATUS[issue.status].label}
              </span>
            )}
          </div>
          <div>
            <span className="block text-slate-400 mb-0.5">Mức độ</span>
            <span className="flex items-center gap-1.5 py-1.5 text-slate-700 dark:text-slate-200">
              <span className={`w-2 h-2 rounded-full ${PRIORITY[issue.priority].dot}`} />{' '}
              {PRIORITY[issue.priority].label}
            </span>
          </div>
        </div>

        <dl className="space-y-1 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900">
          {[
            ['Loại hồ sơ', RECORD_TYPE_LABELS[issue.loai_ho_so ?? 'vuong_mac']],
            ...(needsReply(issue.loai_ho_so)
              ? [
                  ['Bên nhận', issue.ben_nhan || '—'],
                  ['Hạn trả lời', issue.han_tra_loi ? formatDate(issue.han_tra_loi) : '—'],
                ]
              : []),
            ['Loại', TYPE_LABEL[issue.issue_type]],
            ['Đơn vị xử lý', issue.don_vi_xu_ly ? PARTY_LABEL[issue.don_vi_xu_ly] : '—'],
            ['Người xử lý', issue.assigned_to_name || '—'],
            ['Hạn xử lý', issue.due_date ? formatDate(issue.due_date) : '—'],
            ['Người tạo', `${issue.created_by_name || '—'} · ${formatDate(issue.created_at)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-slate-400">{k}</dt>
              <dd
                className={`text-right font-medium ${k === 'Hạn xử lý' && overdue ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}
              >
                {v}
                {k === 'Hạn xử lý' && overdue ? ' (quá hạn)' : ''}
              </dd>
            </div>
          ))}
        </dl>

        {issue.description && (
          <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200 leading-relaxed">{issue.description}</p>
        )}

        {needsReply(issue.loai_ho_so) && <RecordReply issue={issue} projectId={projectId} canEdit={canEdit} />}

        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            Trao đổi phối hợp ({comments.filter((c) => c.loai !== 'he_thong').length})
          </p>
          <div className="space-y-1.5">
            {comments.length === 0 && <p className="text-slate-400 italic">Chưa có trao đổi.</p>}
            {comments.map((c) =>
              c.loai === 'he_thong' ? (
                <p key={c.id} className="text-2xs text-slate-400 text-center">
                  — {c.body} · {formatDate(c.created_at)} —
                </p>
              ) : (
                <div
                  key={c.id}
                  className={`p-2 rounded-xl ${c.author_id && c.author_id === currentUser?.id ? 'bg-primary-50 dark:bg-primary-950 ml-4' : 'bg-slate-100 dark:bg-slate-800 mr-4'}`}
                >
                  <div className="flex justify-between text-2xs text-slate-400 mb-0.5">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">{c.author || 'Cán bộ'}</span>
                    <span>{formatDate(c.created_at)}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{c.body}</p>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 flex gap-1.5">
        <BimInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ý kiến xử lý..."
          className={inputCls}
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || addComment.isPending}
          className="px-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white"
          data-tooltip="Gửi"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const ISSUE_PAGE = 50;

export const BimIssuesPanel: React.FC<BimIssuesPanelProps> = ({
  projectId,
  projectName,
  modelId,
  canEdit,
  currentUser,
  draft,
  onDraftConsumed,
  onRequestDraft,
  onShowIssue,
  className = '',
}) => {
  const { addToast } = useToast();
  const [status, setStatus] = useState<'active' | 'all' | BimIssueStatus>('active');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<BimIssueDraft | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Danh sách phân trang ở máy chủ (50 dòng/trang, mới nhất trước); lọc trạng thái/người/tìm kiếm chạy trên DB.
  const filter = {
    active: status === 'active',
    status: status !== 'active' && status !== 'all' ? status : undefined,
    mineUserId: mine && currentUser ? currentUser.id : undefined,
    search: search.trim() || undefined,
  };
  const pages = useInfiniteQuery({
    queryKey: ['bim-issues', projectId, 'page', filter],
    queryFn: ({ pageParam }) =>
      BimService.getIssuesPage(projectId, { ...filter, offset: pageParam, limit: ISSUE_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.rows.length : undefined),
    enabled: !!projectId,
    staleTime: 30_000,
  });
  const countsQuery = useQuery({
    queryKey: ['bim-issues', projectId, 'counts'],
    queryFn: () => BimService.getIssueCounts(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });
  const issues = useMemo(() => (pages.data?.pages || []).flatMap((p) => p.rows), [pages.data]);
  const totalMatching = pages.data?.pages[0]?.total ?? 0;
  const isLoading = pages.isLoading;
  const refetch = () => Promise.all([pages.refetch(), countsQuery.refetch()]);

  // Bản nháp từ nút chụp ảnh trên thanh công cụ
  React.useEffect(() => {
    if (draft) {
      setFormDraft(draft);
      setSelectedId(null);
      onDraftConsumed();
    }
  }, [draft]);

  const filtered = issues;
  const counts = countsQuery.data ?? { open: 0, in_progress: 0, overdue: 0 };

  const selected = issues.find((i) => i.id === selectedId) || null;

  const handleExport = async () => {
    if (filtered.length === 0) return;
    setBusy('export');
    try {
      // Xuất mọi vướng mắc khớp bộ lọc (tối đa 500), không chỉ trang đang hiển thị.
      const all = await BimService.getIssuesPage(projectId, { ...filter, offset: 0, limit: 500 });
      if (all.hasMore)
        addToast({
          title: 'Xuất BCF có giới hạn',
          message: `Xuất ${all.rows.length}/${all.total} vướng mắc mới nhất; thu hẹp bộ lọc để xuất phần còn lại.`,
          type: 'warning',
        });
      const items = await Promise.all(
        all.rows.map(async (issue) => ({ issue, comments: await BimService.getIssueComments(issue.id) })),
      );
      const blob = await exportIssuesToBcf(items, projectName || projectId, (p) => BimService.getSignedFileUrl(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Vuong_mac_BIM_${projectId}_${new Date().toISOString().slice(0, 10)}.bcf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      addToast({ title: 'Lỗi xuất BCF', message: err.message, type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    setBusy('import');
    try {
      const topics = await importIssuesFromBcf(file);
      for (const t of topics) {
        let screenshotUrl: string | null = null;
        if (t.snapshot) {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(t.snapshot!);
          });
          screenshotUrl = await BimService.uploadIssueScreenshot(projectId, dataUrl).catch(() => null);
        }
        const issue = await BimService.createIssue({
          project_id: projectId,
          model_id: modelId || null,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          issue_type: t.issue_type,
          target_element_guid: t.target_element_guid,
          target_express_id: null,
          viewpoint: t.viewpoint,
          screenshot_url: screenshotUrl,
          assigned_to: null,
          assigned_to_name: t.assigned_to_name,
          due_date: t.due_date,
          created_by: currentUser?.id || null,
          created_by_name: t.created_by_name || currentUser?.name || null,
        });
        for (const c of t.comments) {
          await BimService.addIssueComment(issue.id, c.body, c.author || 'BCF');
        }
      }
      await refetch();
      addToast({ title: 'Đã nhập BCF', message: `Đã nhập ${topics.length} vướng mắc.`, type: 'success' });
    } catch (err: any) {
      addToast({ title: 'Lỗi nhập BCF', message: err.message, type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (formDraft) {
    return (
      <div className={`flex flex-col bg-white dark:bg-slate-800 rounded-2xl overflow-hidden ${className}`}>
        <div className="flex items-center gap-2 p-2 border-b border-slate-200 dark:border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => setFormDraft(null)}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-slate-800 dark:text-slate-100">Lập phiếu vướng mắc</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <IssueForm
            projectId={projectId}
            modelId={modelId}
            draft={formDraft}
            currentUser={currentUser}
            onDone={() => setFormDraft(null)}
          />
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-2xl overflow-hidden ${className}`}>
        <IssueDetail
          issue={selected}
          projectId={projectId}
          canEdit={canEdit}
          currentUser={currentUser}
          onBack={() => setSelectedId(null)}
          onShow={() => onShowIssue(selected)}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-white dark:bg-slate-800 rounded-2xl overflow-hidden text-xs ${className}`}>
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 space-y-2">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            ['Đang mở', counts.open, 'text-rose-600'],
            ['Đang xử lý', counts.in_progress, 'text-amber-600'],
            ['Quá hạn', counts.overdue, 'text-rose-700'],
          ].map(([label, value, cls]) => (
            <div
              key={label as string}
              className="py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700"
            >
              <p className={`text-base font-bold ${cls}`}>{value as number}</p>
              <p className="text-2xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <BimInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm vướng mắc..."
              className={`${inputCls} pl-8`}
            />
          </div>
          <BimSelect
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
          >
            <option value="active">Chưa xong</option>
            <option value="all">Tất cả</option>
            {Object.entries(ISSUE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </BimSelect>
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
            <BimInput
              type="checkbox"
              className="accent-primary-600"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
            />{' '}
            Liên quan tới tôi
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={busy !== null || filtered.length === 0}
              data-tooltip="Xuất BCF 2.1 (Revit, Navisworks, BIMcollab...)"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
            >
              {busy === 'export' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy !== null}
                  data-tooltip="Nhập file BCF"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
                >
                  {busy === 'import' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileUp className="w-3.5 h-3.5" />
                  )}
                </button>
                <BimInput
                  ref={fileRef}
                  type="file"
                  accept=".bcf,.bcfzip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setFormDraft(onRequestDraft())}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Tạo
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading ? (
          <div className="p-6 flex justify-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <CheckCircle2 className="w-9 h-9 mx-auto mb-2 text-emerald-500/50" />
            Không có vướng mắc phù hợp.
          </div>
        ) : (
          filtered.map((i) => {
            const overdue =
              i.due_date &&
              i.status !== 'resolved' &&
              i.status !== 'closed' &&
              new Date(i.due_date + 'T23:59:59+07:00').getTime() < Date.now();
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => setSelectedId(i.id)}
                className="w-full flex gap-2 p-2 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-primary-400 text-left bg-white dark:bg-slate-900"
              >
                <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  {i.screenshot_url ? (
                    <BimStorageImage path={i.screenshot_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY[i.priority].dot}`}
                      data-tooltip={PRIORITY[i.priority].label}
                    />
                    {i.so_hieu && (
                      <span className="shrink-0 font-mono text-2xs font-bold text-sky-700 dark:text-sky-300">
                        {i.so_hieu}
                      </span>
                    )}
                    <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{i.title}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className={`px-1.5 py-0.5 rounded text-2xs ${ISSUE_STATUS[i.status].cls}`}>
                      {ISSUE_STATUS[i.status].label}
                    </span>
                    <span className="text-2xs text-slate-400">{TYPE_LABEL[i.issue_type]}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-2xs text-slate-400">
                    {i.assigned_to_name && (
                      <span className="flex items-center gap-0.5 truncate">
                        <User className="w-2.5 h-2.5" />
                        {i.assigned_to_name}
                      </span>
                    )}
                    {i.due_date && (
                      <span className={`flex items-center gap-0.5 ${overdue ? 'text-rose-600 font-semibold' : ''}`}>
                        <Calendar className="w-2.5 h-2.5" />
                        {formatDate(i.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
        {!isLoading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-1 pt-1 text-2xs text-slate-500">
            <span>
              Đang hiển thị {formatNumber(filtered.length, 2)}/{formatNumber(totalMatching, 2)} vướng mắc
            </span>
            {pages.hasNextPage && (
              <button
                type="button"
                disabled={pages.isFetchingNextPage}
                onClick={() => void pages.fetchNextPage()}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-primary-600 disabled:opacity-50"
              >
                {pages.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
              </button>
            )}
          </div>
        )}
      </div>
      {!canEdit && (
        <p className="p-2 text-2xs text-center text-slate-400 border-t border-slate-100 dark:border-slate-700">
          <AlertTriangle className="inline w-3 h-3 mr-1" />
          Bạn chỉ có quyền xem vướng mắc.
        </p>
      )}
    </div>
  );
};
