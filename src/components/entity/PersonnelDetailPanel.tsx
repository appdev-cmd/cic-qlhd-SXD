import { useEffect, useState } from 'react';
import { ShieldAlert, Award, ExternalLink, Briefcase, CheckCircle2, XCircle, Info } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { EntityLink } from '../ui/EntityLink';
import { Tooltip } from '../ui/Tooltip';
import { Modal } from '../ui/Modal';
import { formatDate } from '../../lib/utils';
import { usePersonnel, useProjects } from '../../hooks/useData';
import { useCurrentPanel } from '../../hooks/useEntityPanel';
import { PanelError, PanelLoading } from './PanelState';
import { AuditHistoryTab } from '../audit/AuditHistoryTab';

export function PersonnelDetailPanel({ id }: { id: string }) {
  const { data: person, isLoading, error } = usePersonnel(id);
  const { data: projectPage } = useProjects({ personnelId: id, pageSize: 100 });
  const { setMeta } = useCurrentPanel();
  const [verifyOpen, setVerifyOpen] = useState(false);

  useEffect(() => {
    if (person) {
      setMeta({
        title: `${person.fullName} — CCHN ${person.certNumber}`,
        subtitle: `${person.orgName} • Hạng ${person.certGrade}`,
        tabTitle: person.fullName.split(' ').slice(-2).join(' '),
      });
    }
  }, [person, setMeta]);

  if (isLoading) return <PanelLoading />;
  if (error || !person) return <PanelError error={error} notFoundLabel="Không tìm thấy cá nhân hành nghề" />;

  const projects = projectPage?.rows ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = person.certExpiry < today;

  return (
    <div className="space-y-4 text-xs">
      {(person.hasConflictWarning || person.status !== 'hieu_luc') && (
        <div className="p-3.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 flex items-start gap-2.5 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-200">
          <ShieldAlert size={18} className="text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Cảnh báo giám sát điều kiện hành nghề</p>
            <p className="text-2xs mt-0.5">
              {person.status === 'het_han'
                ? 'Chứng chỉ hành nghề ĐÃ HẾT HẠN — không được chấp thuận cá nhân này chủ trì hồ sơ.'
                : person.status === 'sap_het_han'
                  ? `Chứng chỉ hành nghề sắp hết hạn (${formatDate(person.certExpiry)}).`
                  : `Cá nhân đang đứng tên chủ trì ${person.activeProjectsCount} dự án đồng thời — cần rà soát năng lực thực tế.`}
            </p>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl border border-border bg-subtle space-y-3 dark:border-slate-800 dark:bg-slate-800">
        <h4 className="font-bold uppercase tracking-wider text-2xs text-ink-muted">Thông tin Nhân thân & Liên hệ</h4>
        <div className="grid grid-cols-2 gap-3 text-ink">
          <div>
            <span className="text-ink-muted">Họ và tên:</span>
            <p className="font-bold text-sm">{person.fullName}</p>
          </div>
          <div>
            <span className="text-ink-muted">Số CCCD / Định danh:</span>
            <p className="font-mono font-semibold">{person.idCard}</p>
          </div>
          <div>
            <span className="text-ink-muted">Số điện thoại:</span>
            <p className="font-semibold">{person.phone || '—'}</p>
          </div>
          <div>
            <span className="text-ink-muted">Email:</span>
            <p className="font-semibold text-primary-600 dark:text-primary-400">{person.email || '—'}</p>
          </div>
          <div className="col-span-2">
            <span className="text-ink-muted">Đơn vị đang công tác:</span>
            <div>
              {person.orgId ? (
                <EntityLink type="organization" id={person.orgId} name={person.orgName} className="font-bold" />
              ) : (
                <span className="font-bold">{person.orgName || '—'}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-primary-500/30 bg-surface space-y-3 shadow-xs dark:bg-slate-900 dark:border-primary-800">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-bold text-ink flex items-center gap-1.5">
            <Award size={16} className="text-primary-500" />
            <span>Chứng chỉ Hành nghề Hoạt động Xây dựng</span>
          </h4>
          <Tooltip content="Đối chiếu điều kiện hành nghề" placement="left">
            <button
              type="button"
              onClick={() => setVerifyOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary-500 text-white text-2xs font-semibold shadow-xs hover:bg-primary-600 transition-colors"
            >
              <ExternalLink size={12} />
              <span>Xác thực chứng chỉ</span>
            </button>
          </Tooltip>
        </div>

        <div className="grid grid-cols-2 gap-2 text-ink">
          <div>
            <span className="text-ink-muted">Số chứng chỉ:</span>
            <p className="font-mono font-bold text-primary-600 dark:text-primary-400 text-sm">{person.certNumber}</p>
          </div>
          <div>
            <span className="text-ink-muted">Hạng chứng chỉ:</span>
            <p className="font-bold">Hạng {person.certGrade}</p>
          </div>
          <div>
            <span className="text-ink-muted">Cơ quan cấp:</span>
            <p className="font-medium">{person.certIssuer}</p>
          </div>
          <div>
            <span className="text-ink-muted">Ngày hết hạn:</span>
            <p className="font-bold">{formatDate(person.certExpiry)}</p>
          </div>
        </div>

        <div className="pt-2 border-t border-border dark:border-slate-800">
          <span className="text-ink-muted">Lĩnh vực chuyên môn được phép hành nghề:</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {person.specialties.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-md bg-subtle border border-border text-2xs font-medium text-ink dark:bg-slate-800 dark:border-slate-700"
              >
                ✓ {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-surface space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="font-bold text-ink flex items-center gap-1.5 border-b border-border pb-2 dark:border-slate-800">
          <Briefcase size={15} className="text-primary-600 dark:text-primary-400" />
          <span>Dự án đang chủ trì trên địa bàn tỉnh ({projectPage?.total ?? projects.length})</span>
        </h4>
        {projects.length > 0 ? (
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="p-2.5 rounded-lg border border-border bg-subtle flex items-center justify-between gap-3 dark:border-slate-800 dark:bg-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-3xs font-bold text-primary-600 dark:text-primary-400">{p.code}</span>
                    <span className="text-3xs px-1.5 rounded bg-primary-50 text-primary-700 font-semibold truncate dark:bg-primary-900 dark:text-primary-200">
                      {p.contractors.find((c) => c.leadPersonnelId === person.id)?.role ?? 'Chủ trì'}
                    </span>
                  </div>
                  <EntityLink type="project" id={p.id} name={p.name} className="font-semibold mt-0.5 block" />
                  <p className="text-3xs text-ink-muted mt-0.5">
                    {p.location} • Hạn thẩm định: {formatDate(p.deadlineDate)}
                  </p>
                </div>
                <StatusBadge status={p.slaStatus} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-2xs text-ink-muted italic py-1">Chưa ghi nhận dự án nào cá nhân đang chủ trì trong CSDL.</p>
        )}
      </div>

      <AuditHistoryTab table="personnel" recordId={person.id} compact />

      <Modal open={verifyOpen} onClose={() => setVerifyOpen(false)} title="Xác thực chứng chỉ hành nghề" size="sm">
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-subtle dark:bg-slate-800">
            <Info size={14} className="text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
            <p className="text-2xs text-ink-secondary">
              Kết nối trực tiếp CSDL quốc gia về hoạt động xây dựng (Bộ Xây dựng) sẽ triển khai ở giai đoạn tích hợp. Hiện tại
              hệ thống đối chiếu theo dữ liệu đã lưu trong CSDL của Sở.
            </p>
          </div>
          <ul className="space-y-2">
            {[
              { ok: Boolean(person.certNumber), label: `Có số chứng chỉ: ${person.certNumber || 'không có'}` },
              { ok: !isExpired, label: `Thời hạn hiệu lực: đến ${formatDate(person.certExpiry)}` },
              { ok: person.status === 'hieu_luc', label: 'Trạng thái chứng chỉ còn hiệu lực' },
              { ok: !person.hasConflictWarning, label: 'Không có cảnh báo xung đột / quá tải dự án' },
            ].map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-xs text-ink">
                {c.ok ? (
                  <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
