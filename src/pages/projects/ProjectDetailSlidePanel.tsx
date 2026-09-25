import { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  Building,
  Coins,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Users,
  History,
  Printer,
  Sparkles,
  Split,
  Eye,
  Camera,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tooltip } from '../../components/ui/Tooltip';
import { ProjectDocumentPreview } from '../../components/documents/ProjectDocumentPreview';
import { ProjectTT39InfoTab } from './ProjectTT39InfoTab';
import { ProjectGalleryTab } from './ProjectGalleryTab';
import type { Project, ProjectTT39Data } from '../../types/domain';
import type { ProjectAppraisalData } from '../../types/appraisal';
import { useProjectDetail, usePersonnel } from '../../hooks/useData';
import { PanelError, PanelLoading } from '../../components/entity/PanelState';
import { EntityLink } from '../../components/ui/EntityLink';
import { AuditHistoryTab } from '../../components/audit/AuditHistoryTab';
import { AiDemoBadge } from '../../components/ai/AiDemoBadge';
import { DossierWorkflowBar, WorkflowHistory } from './DossierWorkflowBar';

export type ProjectDetailTab = 'info' | 'gallery' | 'bcnckt' | 'gpxd' | 'nghiem_thu' | 'entities' | 'audit';

export function ProjectDetailSlidePanel({
  project,
  initialTab = 'bcnckt',
}: {
  project: Project;
  initialTab?: ProjectDetailTab;
}) {
  const { data, isLoading, error } = useProjectDetail(project);
  if (isLoading) return <PanelLoading label="Đang tải hồ sơ thẩm định..." />;
  if (error) return <PanelError error={error as Error} />;
  return (
    <ProjectDetailContent
      project={project}
      appraisal={data?.appraisal ?? null}
      tt39={data?.tt39 ?? null}
      initialTab={initialTab}
    />
  );
}

function NoAppraisalData() {
  return (
    <div className="p-6 rounded-xl border border-dashed border-border bg-subtle text-center text-xs text-ink-muted dark:border-slate-700 dark:bg-slate-800">
      Hồ sơ chưa có dữ liệu thẩm định chuyên ngành. Nội dung sẽ hiển thị khi chuyên viên cập nhật kết quả rà soát.
    </div>
  );
}

/** Dòng đơn vị tham gia kèm tra cứu chứng chỉ thật của cá nhân chủ trì */
function ContractorRow({ contractor: c }: { contractor: Project['contractors'][number] }) {
  const { data: lead } = usePersonnel(c.leadPersonnelId || undefined);
  const expired = lead ? lead.status === 'het_han' : false;
  return (
    <div className="p-3 rounded-lg border border-border bg-subtle flex items-center justify-between gap-3 dark:border-slate-800 dark:bg-slate-800">
      <div className="min-w-0">
        <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-primary-50 text-primary-600 dark:bg-primary-900 dark:text-primary-200">
          {c.role}
        </span>
        <div className="mt-1">
          <EntityLink type="organization" id={c.orgId} name={c.orgName} className="font-bold text-ink text-xs" />
        </div>
        <p className="text-2xs text-ink-secondary mt-0.5 flex flex-wrap items-center gap-1.5">
          <span>Chủ nhiệm / Chủ trì:</span>
          {c.leadPersonnelId ? (
            <EntityLink type="personnel" id={c.leadPersonnelId} name={c.leadPersonnelName} className="font-semibold text-ink" />
          ) : (
            <strong className="text-ink">{c.leadPersonnelName}</strong>
          )}
          {lead && (
            <>
              <span className={cn('w-1.5 h-1.5 rounded-full', expired ? 'bg-rose-500' : 'bg-emerald-500')} />
              <span className={cn('font-medium', expired ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                CCHN Hạng {lead.certGrade} ({expired ? 'đã hết hạn ngày' : 'còn hạn đến'} {formatDate(lead.certExpiry)})
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function ProjectDetailContent({
  project,
  appraisal,
  tt39,
  initialTab,
}: {
  project: Project;
  appraisal: ProjectAppraisalData | null;
  tt39: ProjectTT39Data | null;
  initialTab: ProjectDetailTab;
}) {
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>(initialTab);
  const [bcncktSubTab, setBcncktSubTab] = useState<'planning' | 'compliance' | 'fire' | 'cost' | 'preview_a4'>('compliance');
  const [isDualSplit, setIsDualSplit] = useState(false);

  return (
    <div className="space-y-5">
      {/* ─── BANNER TÓM TẮT DỰ ÁN ─── */}
      <div className="p-4 rounded-xl border border-border bg-subtle/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          {project.coverImage && (
            <Tooltip content="Bấm để xem thư viện ảnh phối cảnh & thực địa" placement="bottom">
            <button
              type="button"
              onClick={() => setActiveTab('gallery')}
              className="relative block w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-border bg-slate-950 cursor-pointer group shadow-xs"
            >
              <img
                src={project.coverImage}
                alt={project.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Eye size={16} />
              </div>
              {project.images && project.images.length > 0 && (
                <span className="absolute bottom-1 right-1 bg-black/75 backdrop-blur-xs text-white text-[9px] px-1 py-0.2 rounded font-mono flex items-center gap-0.5">
                  <Camera size={8} />
                  {project.images.length}
                </span>
              )}
            </button>
            </Tooltip>
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">
                {project.code}
              </span>
              <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-surface border border-border text-ink-secondary">
                Nhóm {project.projectGroup} • Cấp {project.buildingGrade}
              </span>
              <StatusBadge status={project.slaStatus} />
            </div>
            <h2 className="text-sm font-bold text-ink mt-1">{project.name}</h2>
            <p className="text-2xs text-ink-muted mt-0.5">
              Chủ đầu tư:{' '}
              {project.investorId ? (
                <EntityLink type="organization" id={project.investorId} name={project.investorName} className="font-bold" />
              ) : (
                <strong>{project.investorName}</strong>
              )}{' '}
              • Địa điểm: {project.location} • Chuyên viên thụ lý: <strong>{project.assignee || '—'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-3xs uppercase tracking-wider text-ink-muted">Tổng mức đầu tư</p>
            <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(project.totalInvestment)}
            </p>
          </div>
          <div className="text-right pl-3 border-l border-border">
            <p className="text-3xs uppercase tracking-wider text-ink-muted">Hạn trả kết quả</p>
            <p className="text-xs font-bold text-ink">{formatDate(project.deadlineDate)}</p>
          </div>
        </div>
      </div>

      {/* ─── QUY TRÌNH GIẢI QUYẾT HỒ SƠ & SLA NGÀY LÀM VIỆC ─── */}
      <DossierWorkflowBar project={project} onChanged={() => undefined} />

      {/* ─── HỆ THỐNG TABS THEO CÁC GIAI ĐOẠN & NỘI DUNG THẨM ĐỊNH ─── */}
      <div className="border-b border-border flex items-center gap-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
            activeTab === 'info'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-ink-secondary hover:text-ink'
          )}
        >
          <Building size={14} />
          <span>1. Thông tin chung</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bcnckt')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
            activeTab === 'bcnckt'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-ink-secondary hover:text-ink'
          )}
        >
          <ShieldCheck size={14} />
          <span>2. Thẩm định BCNCKT</span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gpxd')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
            activeTab === 'gpxd'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-ink-secondary hover:text-ink'
          )}
        >
          <FileText size={14} />
          <span>3. Cấp Giấy phép XD</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('nghiem_thu')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
            activeTab === 'nghiem_thu'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-ink-secondary hover:text-ink'
          )}
        >
          <FileCheck size={14} />
          <span>4. Hậu kiểm & Nghiệm thu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('entities')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
            activeTab === 'entities'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-ink-secondary hover:text-ink'
          )}
        >
          <Users size={14} />
          <span>5. Chủ thể & Kỹ sư ({project.contractors.length + 1})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
            activeTab === 'audit'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-ink-secondary hover:text-ink'
          )}
        >
          <History size={14} />
          <span>6. Lịch sử & Nhật ký AI</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gallery')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all shrink-0',
            activeTab === 'gallery'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-ink-secondary hover:text-ink'
          )}
        >
          <Camera size={14} />
          <span>7. Ảnh & Phối cảnh ({project.images?.length || 0})</span>
        </button>
      </div>

      {/* ─── NỘI DUNG TỪNG TAB ─── */}

      {/* TAB 1: THÔNG TIN CHUNG THEO THÔNG TƯ 39/2026/TT-BXD */}
      {activeTab === 'info' && (tt39 ? <ProjectTT39InfoTab project={project} tt39={tt39} /> : <NoAppraisalData />)}

      {/* TAB 2: THẨM ĐỊNH BCNCKT (TRỌNG TÂM CỦA SỞ XÂY DỰNG) */}
      {activeTab === 'bcnckt' && !appraisal && <NoAppraisalData />}
      {activeTab === 'bcnckt' && appraisal && (
        <div className="space-y-4">
          {/* Sub-tabs của BCNCKT */}
          <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-subtle border border-border overflow-x-auto">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setBcncktSubTab('compliance')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                  bcncktSubTab === 'compliance' ? 'bg-surface text-primary-600 shadow-xs' : 'text-ink-muted hover:text-ink'
                )}
              >
                <Sparkles size={13} className="text-primary-500" />
                <span>Quy chuẩn & Kết cấu AI</span>
              </button>

              <button
                type="button"
                onClick={() => setBcncktSubTab('planning')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  bcncktSubTab === 'planning' ? 'bg-surface text-primary-600 shadow-xs' : 'text-ink-muted hover:text-ink'
                )}
              >
                Quy hoạch & Hạ tầng
              </button>

              <button
                type="button"
                onClick={() => setBcncktSubTab('fire')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                  bcncktSubTab === 'fire' ? 'bg-surface text-primary-600 shadow-xs' : 'text-ink-muted hover:text-ink'
                )}
              >
                <Flame size={13} className="text-rose-500" />
                <span>PCCC Checklist</span>
              </button>

              <button
                type="button"
                onClick={() => setBcncktSubTab('cost')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                  bcncktSubTab === 'cost' ? 'bg-surface text-primary-600 shadow-xs' : 'text-ink-muted hover:text-ink'
                )}
              >
                <Coins size={13} className="text-amber-500" />
                <span>Thẩm định TMĐT</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setBcncktSubTab('preview_a4')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ml-auto',
                bcncktSubTab === 'preview_a4' ? 'bg-primary-500 text-white shadow-xs' : 'bg-primary-500/10 text-primary-600 hover:bg-primary-500/20'
              )}
            >
              <Printer size={13} />
              <span>Dự thảo Mẫu 03 (Khổ A4)</span>
            </button>
          </div>

          {/* Nội dung Sub-tab 1: Quy chuẩn & Kết cấu AI */}
          {bcncktSubTab === 'compliance' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950 dark:border-emerald-800 flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center gap-2">
                    AI Compliance Checker: Danh mục Quy chuẩn Chuyên ngành Áp dụng Hợp lệ
                    <AiDemoBadge />
                  </h4>
                  <p className="text-emerald-800 dark:text-emerald-300 mt-0.5">
                    Hồ sơ áp dụng đúng quy chuẩn chuyên ngành bắt buộc, tiêu chuẩn kết cấu mới nhất và điều kiện tự nhiên địa chấn cấp VII tại Điện Biên. Không phát hiện tiêu chuẩn hết hiệu lực.
                  </p>
                </div>
              </div>

              {/* Bảng checklist chi tiết */}
              <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="thead-sticky">
                    <tr>
                      <th className="th-cell">Nội dung rà soát</th>
                      <th className="th-cell">Yêu cầu Quy chuẩn</th>
                      <th className="th-cell">Hồ sơ thiết kế</th>
                      <th className="th-cell text-center">Kết luận AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appraisal.complianceChecklist.map((c, i) => (
                      <tr key={i} className="tr-stripe">
                        <td className="td-cell font-semibold">
                          <div>{c.item}</div>
                          <span className="text-3xs text-ink-muted">{c.category}</span>
                        </td>
                        <td className="td-cell text-ink-secondary">{c.standardRequired}</td>
                        <td className="td-cell">
                          <span className="text-ink">{c.designApplied}</span>
                          {c.aiNotes && <p className="text-3xs text-emerald-600 mt-0.5 italic">Ghi chú AI: {c.aiNotes}</p>}
                        </td>
                        <td className="td-cell text-center">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full font-bold text-2xs',
                            c.aiVerdict === 'dat' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-700'
                          )}>
                            {c.aiVerdict === 'dat' ? 'ĐẠT' : 'LƯU Ý'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Nội dung Sub-tab 2: Quy hoạch & Hạ tầng */}
          {bcncktSubTab === 'planning' && (
            <div className="p-4 rounded-xl border border-border bg-surface text-xs space-y-3">
              <h4 className="font-bold text-ink">Chỉ tiêu Quy hoạch Xây dựng & Hạ tầng Đối chiếu</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {appraisal.planningMetrics.map((m, i) => (
                  <div key={i} className="p-3 rounded-lg bg-subtle border border-border/50">
                    <span className="text-3xs text-ink-muted">{m.name}:</span>
                    <p className="font-bold text-sm text-ink mt-0.5">{m.designValue}</p>
                    <p className="text-2xs text-emerald-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      <span>{m.standardLimit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nội dung Sub-tab 3: PCCC Checklist */}
          {bcncktSubTab === 'fire' && (
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl border border-blue-300 bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-200">
                <strong>Văn bản Thỏa thuận PCCC:</strong> Đã có Văn bản số {appraisal.fireSafety.agreementNumber} ngày {appraisal.fireSafety.agreementDate} của {appraisal.fireSafety.agency} về việc thỏa thuận địa điểm và giải pháp PCCC thiết kế cơ sở.
              </div>
              <div className="p-4 rounded-xl border border-border bg-surface space-y-2.5">
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-ink-secondary">1. Bậc chịu lửa công trình:</span>
                  <span className="font-bold text-emerald-600">{appraisal.fireSafety.fireResistanceGrade}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-ink-secondary">2. Khoảng cách thoát nạn:</span>
                  <span className="font-bold text-emerald-600">{appraisal.fireSafety.evacuationDistance}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-ink-secondary">3. Số lượng lối thoát nạn & buồng thang:</span>
                  <span className="font-bold text-emerald-600">{appraisal.fireSafety.evacuationStaircases}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-ink-secondary">4. Đường tiếp cận và bãi đỗ xe chữa cháy:</span>
                  <span className="font-bold text-emerald-600">{appraisal.fireSafety.fireAccessRoad}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-ink-secondary">5. Nguồn nước & Trạm bơm PCCC:</span>
                  <span className="font-bold text-emerald-600">{appraisal.fireSafety.waterReserve}</span>
                </div>
              </div>
            </div>
          )}

          {/* Nội dung Sub-tab 4: Thẩm định Tổng mức đầu tư */}
          {bcncktSubTab === 'cost' && (
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-ink">Thẩm tra 6 Khoản mục Chi phí Tổng mức đầu tư (NĐ 206/2026/NĐ-CP)</h4>
                    <p className="text-3xs text-ink-muted">So sánh giá trị Chủ đầu tư trình duyệt và giá trị sau khi Sở Xây dựng thẩm định</p>
                  </div>
                  <span className="text-2xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Tiết giảm sau thẩm định: {formatCurrency(appraisal.costEvaluation.savingsTotal)}
                  </span>
                </div>

                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="thead-sticky">
                      <tr>
                        <th className="th-cell">Khoản mục chi phí</th>
                        <th className="th-cell text-right">CĐT Trình duyệt</th>
                        <th className="th-cell text-right">SXD Thẩm định</th>
                        <th className="th-cell text-right">Cắt giảm</th>
                        <th className="th-cell">Căn cứ điều chỉnh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appraisal.costEvaluation.items.map((it, idx) => (
                        <tr key={idx} className="tr-stripe">
                          <td className="td-cell font-semibold">{it.name}</td>
                          <td className="td-cell text-right font-mono text-ink-muted">{formatCurrency(it.originalValue)}</td>
                          <td className="td-cell text-right font-mono font-bold text-primary-600 dark:text-primary-400">{formatCurrency(it.appraisedValue)}</td>
                          <td className="td-cell text-right font-mono font-bold text-emerald-600">
                            {it.difference > 0 ? `-${formatCurrency(it.difference)}` : '0 VNĐ'}
                          </td>
                          <td className="td-cell text-2xs text-ink-secondary">{it.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-subtle/80 font-bold border-t border-border">
                        <td className="td-cell">TỔNG CỘNG TMĐT</td>
                        <td className="td-cell text-right font-mono text-ink-muted">{formatCurrency(appraisal.costEvaluation.originalTotal)}</td>
                        <td className="td-cell text-right font-mono text-primary-600 text-sm">{formatCurrency(appraisal.costEvaluation.appraisedTotal)}</td>
                        <td className="td-cell text-right font-mono text-emerald-600 text-sm">-{formatCurrency(appraisal.costEvaluation.savingsTotal)}</td>
                        <td className="td-cell text-2xs text-emerald-700">Tiết kiệm ngân sách Nhà nước</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Nội dung Sub-tab 5: Dự thảo Mẫu số 03 Khổ A4 */}
          {bcncktSubTab === 'preview_a4' && (
            <ProjectDocumentPreview project={project} appraisal={appraisal} template="mau_03" />
          )}
        </div>
      )}

      {/* TAB 3: CẤP GIẤY PHÉP XÂY DỰNG (ĐỐI CHIẾU DUAL SPLIT & THẨM ĐỊNH ĐIỀU KIỆN) */}
      {activeTab === 'gpxd' && !appraisal && <NoAppraisalData />}
      {activeTab === 'gpxd' && appraisal && (
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-ink">Thẩm định Hồ sơ Cấp Giấy phép Xây dựng</h4>
                  <span className="px-2 py-0.5 rounded-full text-3xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    Số GPXD: {appraisal.permit.permitNumber}
                  </span>
                  <span className="text-3xs text-ink-muted">Cấp ngày: {appraisal.permit.permitDate}</span>
                </div>
                <p className="text-2xs text-ink-muted mt-0.5">
                  Thực hiện theo Điều 50, 53, 54 & 55 Nghị định 217/2026/NĐ-CP (Quy chuẩn công trình cấp {project.buildingGrade || 'II'})
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsDualSplit(!isDualSplit)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-subtle hover:bg-surface text-primary-600 font-semibold transition-colors"
              >
                <Split size={14} />
                <span>{isDualSplit ? 'Đóng Dual Split' : 'Dual-Panel Đối chiếu Bản vẽ'}</span>
              </button>
            </div>

            {/* Chế độ Dual-Panel Split View */}
            {isDualSplit && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl border border-primary-500/30 bg-subtle/40">
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <div className="flex items-center justify-between pb-2 border-b border-border mb-2 font-bold text-primary-600">
                    <span>1. Bản vẽ Xin cấp phép (Nộp mới 2026)</span>
                    <span className="text-3xs px-2 py-0.5 rounded bg-primary-500/10 text-primary-600">PDF Điện tử</span>
                  </div>
                  <div className="h-44 rounded bg-slate-900 flex flex-col items-center justify-center text-slate-400 font-mono text-xs gap-1">
                    <span>[Viewer Bản vẽ Xin cấp phép: {project.name}]</span>
                    <span className="text-3xs text-slate-500">Mặt bằng tổng thể, Cốt ±0.00 & Chỉ giới xây dựng</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface border border-border">
                  <div className="flex items-center justify-between pb-2 border-b border-border mb-2 font-bold text-emerald-600">
                    <span>2. Bản vẽ BCNCKT gốc đã Thẩm định</span>
                    <span className="text-3xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">Đã phê duyệt</span>
                  </div>
                  <div className="h-44 rounded bg-slate-900 flex flex-col items-center justify-center text-slate-400 font-mono text-xs gap-1">
                    <span>[Viewer Bản vẽ BCNCKT Đã Thẩm Định]</span>
                    <span className="text-3xs text-slate-500">Đối chiếu 100% khớp tầng cao, diện tích sàn, định vị mốc</span>
                  </div>
                </div>
              </div>
            )}

            {/* Chỉ tiêu kỹ thuật cho phép cấp GPXD */}
            <div className="p-3 rounded-lg border border-border bg-subtle/40">
              <h5 className="font-bold text-ink mb-2">Chỉ tiêu quy chuẩn cấp phép (Khớp BCNCKT & Quy hoạch 1/500):</h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-ink">
                <div className="p-2 rounded bg-surface border border-border">
                  <span className="text-3xs text-ink-muted block">Diện tích xây dựng:</span>
                  <span className="font-bold text-primary-600">{appraisal.permit.technicalConditions.allowedGroundArea}</span>
                </div>
                <div className="p-2 rounded bg-surface border border-border">
                  <span className="text-3xs text-ink-muted block">Tổng diện tích sàn:</span>
                  <span className="font-bold text-primary-600">{appraisal.permit.technicalConditions.allowedTotalFloorArea}</span>
                </div>
                <div className="p-2 rounded bg-surface border border-border">
                  <span className="text-3xs text-ink-muted block">Số tầng công trình:</span>
                  <span className="font-bold text-emerald-600">{appraisal.permit.technicalConditions.allowedStories}</span>
                </div>
                <div className="p-2 rounded bg-surface border border-border">
                  <span className="text-3xs text-ink-muted block">Chiều cao tối đa:</span>
                  <span className="font-bold text-emerald-600">{appraisal.permit.technicalConditions.allowedHeight}</span>
                </div>
              </div>
            </div>

            {/* Danh mục tài liệu hồ sơ theo Điều 55 NĐ 217 */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <h5 className="font-bold text-ink mb-2">Đối soát Thành phần Hồ sơ xin cấp phép (Nghị định 217/2026/NĐ-CP):</h5>
              <div className="divide-y divide-border rounded-lg border border-border bg-surface overflow-hidden">
                {appraisal.permit.checklistDocs.map((doc, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between gap-2 hover:bg-subtle/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-subtle text-ink-muted border border-border">
                        {doc.code}
                      </span>
                      <span className="font-medium text-ink">{doc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-2xs text-ink-secondary">{doc.note}</span>
                      <span className="px-2 py-0.5 rounded text-3xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Hợp lệ
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Yêu cầu đặc biệt */}
            {appraisal.permit.technicalConditions.specialRequirements.length > 0 && (
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-900 dark:text-amber-200">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-500" />
                  <span>Điều kiện & Nghĩa vụ bắt buộc khi thi công xây dựng:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-2xs">
                  {appraisal.permit.technicalConditions.specialRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: HẬU KIỂM & NGHIỆM THU (NĐ 207/2026/NĐ-CP) */}
      {activeTab === 'nghiem_thu' && !appraisal && <NoAppraisalData />}
      {activeTab === 'nghiem_thu' && appraisal && (
        <div className="space-y-4 text-xs">
          {/* A. Điều kiện khởi công */}
          <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h4 className="font-bold text-ink">1. Kiểm tra Điều kiện Khởi công Công trình</h4>
                <p className="text-2xs text-ink-muted">Quy định tại Điều 107 Luật Xây dựng & NĐ 207/2026/NĐ-CP</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-3xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 size={12} />
                Đủ điều kiện khởi công
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {appraisal.inspection.groundBreakingConditions.map((cond, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-border bg-subtle/40 flex items-center justify-between gap-2">
                  <span className="text-ink font-medium">{cond.item}</span>
                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 rounded text-3xs font-semibold bg-emerald-500/10 text-emerald-600">Đạt</span>
                    <span className="text-3xs text-ink-muted block mt-0.5">{cond.verifyDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* B. Các đợt kiểm tra nghiệm thu giai đoạn */}
          <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <h4 className="font-bold text-ink">2. Lịch sử Kiểm tra Nghiệm thu Giai đoạn & Hậu kiểm Hiện trường</h4>
            <div className="space-y-2.5">
              {appraisal.inspection.phaseInspections.map((phase, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-border bg-subtle/30 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-ink text-xs">{phase.phaseName}</strong>
                    <div className="flex items-center gap-2">
                      <span className="text-3xs text-ink-muted">Ngày: {phase.inspectDate}</span>
                      <span className="px-2 py-0.5 rounded text-3xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        Chấp thuận
                      </span>
                    </div>
                  </div>
                  <p className="text-2xs text-ink-secondary">
                    <strong className="text-ink">Đoàn kiểm tra:</strong> {phase.inspectTeam}
                  </p>
                  <p className="text-2xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 p-2 rounded border border-emerald-500/15">
                    {phase.findings}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* C. Thông báo kết quả kiểm tra công tác nghiệm thu đưa vào sử dụng */}
          <div className="p-4 rounded-xl border border-primary-500/30 bg-primary-500/5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCheck className="text-primary-600" size={18} />
                <h4 className="font-bold text-ink">3. Thông báo Kết quả Nghiệm thu Hoàn thành Công trình</h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary-600">{appraisal.inspection.finalNotice.noticeNumber}</span>
                <span className="text-2xs text-ink-muted">Ngày ban hành: {appraisal.inspection.finalNotice.issueDate}</span>
              </div>
            </div>
            <p className="text-2xs font-semibold text-emerald-700 dark:text-emerald-300">
              {appraisal.inspection.finalNotice.result}
            </p>
            <div className="pt-2 border-t border-primary-500/20">
              <span className="font-bold text-ink block mb-1">Kiến nghị & Yêu cầu của Cơ quan chuyên môn về xây dựng:</span>
              <ul className="list-disc list-inside space-y-0.5 text-2xs text-ink-secondary">
                {appraisal.inspection.finalNotice.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CHỦ THỂ & ĐỘI NGŨ KỸ SƯ */}
      {activeTab === 'entities' && (
        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="p-3 border-b border-border bg-subtle font-bold text-ink flex items-center justify-between dark:border-slate-800 dark:bg-slate-800">
              <span>Đơn vị tư vấn, nhà thầu & cá nhân chủ nhiệm, chủ trì</span>
              <span className="text-3xs text-ink-muted font-normal">Đối soát CSDL chứng chỉ hành nghề của Sở</span>
            </div>
            <div className="p-3 space-y-3">
              {project.contractors.map((c, i) => (
                <ContractorRow key={`${c.orgId}-${i}`} contractor={c} />
              ))}
              {project.contractors.length === 0 && (
                <p className="text-2xs text-ink-muted italic">Chưa khai báo đơn vị tư vấn, nhà thầu tham gia.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: LỊCH SỬ THAY ĐỔI DỮ LIỆU + NHẬT KÝ AI */}
      {activeTab === 'audit' && <WorkflowHistory projectId={project.id} />}
      {activeTab === 'audit' && <AuditHistoryTab table="projects" recordId={project.id} />}
      {activeTab === 'audit' && appraisal && (
        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h4 className="font-bold text-ink flex items-center gap-2">
                <Sparkles size={14} className="text-primary-500" />
                <span>Nhật ký Tác nghiệp & Trách nhiệm Giải trình AI (Luật AI 2025 & NĐ 217/2026)</span>
              </h4>
              <AiDemoBadge />
            </div>

            <div className="space-y-3 border-l-2 border-primary-500/40 pl-4 py-1">
              {appraisal.auditLogs.map((log, idx) => {
                const badgeColor =
                  log.badge === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : log.badge === 'warning'
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    : log.badge === 'audit'
                    ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                    : 'bg-blue-500/10 text-blue-600 border-blue-500/20';

                return (
                  <div key={idx} className="relative group">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary-500 ring-4 ring-surface" />
                    <div className="p-3 rounded-lg border border-border bg-subtle/30 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-3xs text-ink-muted">{log.timestamp}</span>
                          <strong className="text-ink font-semibold">{log.actor}</strong>
                        </div>
                        <span className={cn('px-2 py-0.5 rounded text-3xs font-semibold border', badgeColor)}>
                          {log.action}
                        </span>
                      </div>
                      <p className="text-2xs text-ink-secondary leading-relaxed">{log.details}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: THƯ VIỆN ẢNH & PHỐI CẢNH 3D DỰ ÁN */}
      {activeTab === 'gallery' && <ProjectGalleryTab project={project} />}
    </div>
  );
}
