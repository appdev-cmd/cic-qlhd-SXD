import { useEffect } from 'react';
import { Building2, ShieldCheck, Briefcase, Users, Phone, MapPin } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { EntityLink } from '../ui/EntityLink';
import { formatCurrency, formatDate } from '../../lib/utils';
import { useOrganization, usePersonnelList, useProjects } from '../../hooks/useData';
import { useCurrentPanel } from '../../hooks/useEntityPanel';
import { PanelError, PanelLoading } from './PanelState';
import { AuditHistoryTab } from '../audit/AuditHistoryTab';

export const ORGANIZATION_TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  investor: { label: 'Chủ đầu tư / Ban QLDA', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  consultant_design: { label: 'Tư vấn Thiết kế', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  consultant_audit: { label: 'Tư vấn Thẩm tra', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  contractor: { label: 'Nhà thầu Thi công', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  supervisor: { label: 'Tư vấn Giám sát', cls: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300' },
};

export function OrganizationDetailPanel({ id }: { id: string }) {
  const { data: org, isLoading, error } = useOrganization(id);
  const { data: projectPage } = useProjects({ organizationId: id, pageSize: 100 });
  const { data: orgPersonnel = [] } = usePersonnelList({ orgId: id });
  const { setMeta } = useCurrentPanel();

  useEffect(() => {
    if (org) setMeta({ title: org.name, subtitle: `Mã: ${org.code} • MST: ${org.taxCode}`, tabTitle: org.code });
  }, [org, setMeta]);

  if (isLoading) return <PanelLoading />;
  if (error || !org) return <PanelError error={error} notFoundLabel="Không tìm thấy tổ chức" />;

  const orgProjects = projectPage?.rows ?? [];

  return (
    <div className="space-y-4 text-xs">
      <div className="p-4 rounded-xl border border-border bg-subtle space-y-3 dark:border-slate-800 dark:bg-slate-800">
        <h4 className="font-bold uppercase tracking-wider text-2xs text-ink-muted flex items-center gap-1.5">
          <Building2 size={14} className="text-primary-600 dark:text-primary-400" />
          <span>Hồ sơ Pháp nhân & Đại diện</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-ink">
          <div>
            <span className="text-ink-muted">Loại hình:</span>
            <p className="font-semibold">{ORGANIZATION_TYPE_LABELS[org.type]?.label ?? 'Khác'}</p>
          </div>
          <div>
            <span className="text-ink-muted">Người đại diện pháp luật:</span>
            <p className="font-semibold">{org.representative || '—'}</p>
          </div>
          <div>
            <span className="text-ink-muted">Mã số thuế / Mã ĐV:</span>
            <p className="font-mono font-semibold text-primary-600 dark:text-primary-400">{org.taxCode || '—'}</p>
          </div>
          <div>
            <span className="text-ink-muted">Số điện thoại liên hệ:</span>
            <p className="font-semibold flex items-center gap-1">
              <Phone size={12} className="text-ink-muted" />
              <span>{org.phone || '—'}</span>
            </p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-ink-muted">Địa chỉ trụ sở:</span>
            <p className="font-semibold flex items-center gap-1">
              <MapPin size={12} className="text-ink-muted shrink-0" />
              <span>{org.address}</span>
            </p>
          </div>
        </div>
      </div>

      {org.certificateNumber ? (
        <div className="p-4 rounded-xl border border-primary-500/30 bg-primary-50 space-y-2.5 dark:bg-slate-800 dark:border-primary-800">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-primary-700 dark:text-primary-300 flex items-center gap-1.5">
              <ShieldCheck size={16} />
              <span>Chứng chỉ Năng lực Hoạt động Xây dựng</span>
            </h4>
            <StatusBadge status={org.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-ink pt-1">
            <div>
              <span className="text-ink-muted">Số chứng chỉ:</span>
              <p className="font-mono font-bold">{org.certificateNumber}</p>
            </div>
            <div>
              <span className="text-ink-muted">Hạng năng lực:</span>
              <p className="font-bold text-primary-600 dark:text-primary-400">Hạng {org.certificateGrade ?? '—'}</p>
            </div>
            <div>
              <span className="text-ink-muted">Ngày hết hạn:</span>
              <p className="font-bold">{formatDate(org.certificateExpiry)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl border border-border bg-subtle text-ink-muted italic dark:border-slate-800 dark:bg-slate-800">
          Cơ quan hành chính nhà nước / Chủ đầu tư đặc thù (Không thuộc diện cấp chứng chỉ năng lực)
        </div>
      )}

      <div className="p-4 rounded-xl border border-border bg-surface space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-border pb-2 dark:border-slate-800">
          <h4 className="font-bold text-ink flex items-center gap-1.5">
            <Briefcase size={15} className="text-primary-600 dark:text-primary-400" />
            <span>Dự án tham gia trên địa bàn tỉnh ({projectPage?.total ?? orgProjects.length})</span>
          </h4>
        </div>
        {orgProjects.length > 0 ? (
          <div className="space-y-2">
            {orgProjects.map((p) => {
              const roleInProj =
                p.investorId === org.id
                  ? 'Chủ đầu tư'
                  : p.contractors.find((c) => c.orgId === org.id)?.role || 'Đơn vị tham gia';
              return (
                <div
                  key={p.id}
                  className="p-2.5 rounded-lg border border-border bg-subtle flex items-center justify-between gap-3 dark:border-slate-800 dark:bg-slate-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-3xs font-bold text-primary-600 dark:text-primary-400">{p.code}</span>
                      <span className="text-3xs px-1.5 rounded bg-primary-50 text-primary-700 font-semibold truncate dark:bg-primary-900 dark:text-primary-200">
                        {roleInProj}
                      </span>
                    </div>
                    <EntityLink type="project" id={p.id} name={p.name} className="font-semibold mt-0.5 block" />
                    <p className="text-3xs text-ink-muted mt-0.5">
                      {p.location} • TMĐT: <strong className="text-ink">{formatCurrency(p.totalInvestment)}</strong>
                    </p>
                  </div>
                  <StatusBadge status={p.slaStatus} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-ink-muted text-2xs italic py-1">Chưa có dự án nào gắn với đơn vị trong CSDL.</p>
        )}
      </div>

      {orgPersonnel.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-3 dark:border-slate-800 dark:bg-slate-900">
          <h4 className="font-bold text-ink flex items-center gap-1.5 border-b border-border pb-2 dark:border-slate-800">
            <Users size={15} className="text-primary-600 dark:text-primary-400" />
            <span>Đội ngũ Chuyên gia & Kỹ sư Chủ chốt ({orgPersonnel.length})</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {orgPersonnel.map((person) => (
              <div
                key={person.id}
                className="p-2.5 rounded-lg border border-border bg-subtle space-y-1 dark:border-slate-800 dark:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <EntityLink type="personnel" id={person.id} name={person.fullName} className="font-bold" />
                  <span className="text-3xs font-mono font-bold px-1.5 rounded bg-primary-50 text-primary-600 dark:bg-primary-900 dark:text-primary-200">
                    Hạng {person.certGrade}
                  </span>
                </div>
                <p className="text-3xs font-mono text-ink-muted">{person.certNumber}</p>
                <p className="text-3xs text-ink-secondary truncate">{person.specialties.join(' • ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <AuditHistoryTab table="organizations" recordId={org.id} compact />
    </div>
  );
}
