import { AppraisalPage } from '../AppraisalPage';
import type { ProjectProcedure } from '../../lib/projectProcedures';
import React, { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  Building,
  FileCheck,
  Users,
  History,
  ExternalLink,
  Eye,
  Camera,
  ShieldQuestion,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tooltip } from '../../components/ui/Tooltip';
import { Badge, Card, EmptyState, EntityLink, IconButton, Tabs } from '../../components/ui';
import { ProjectTT39InfoTab } from './ProjectTT39InfoTab';
import { ProjectGalleryTab } from './ProjectGalleryTab';
import type { Project } from '../../types/project';
import { AuditHistoryTab } from '../../components/appraisal/AuditHistoryTab';

type PanelTab = 'info' | 'gallery' | 'bcnckt' | 'gpxd' | 'nghiem_thu' | 'entities' | 'audit';

const CERT_PENDING_HELP =
  'Chưa kết nối cơ sở dữ liệu chứng chỉ hành nghề/năng lực của Bộ Xây dựng, nên hệ thống chưa tự xác minh được. Cán bộ cần đối chiếu chứng chỉ gốc.';

/** Shows an entity name as a link only when the record carries a real id; never fakes one. */
function EntityName({ type, id, name }: { type: 'organization' | 'personnel'; id?: string; name: string }) {
  return id ? <EntityLink type={type} id={id} name={name} /> : <>{name}</>;
}

export function ProjectDetailSlidePanel({
  project,
  initialTab = 'bcnckt',
}: {
  project: Project;
  initialTab?: ProjectProcedure;
}) {
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab);
  const appraisalTab = (['bcnckt', 'gpxd', 'nghiem_thu'] as string[]).includes(activeTab);

  return (
    <div className={cn('space-y-5', appraisalTab && 'h-full flex flex-col [&>div]:shrink-0')}>
      {/* Project summary banner */}
      <div className="p-4 rounded-2xl border border-border dark:border-slate-800 bg-subtle dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          {project.coverImage && (
            <Tooltip content="Xem thư viện ảnh" placement="bottom">
              <button
                type="button"
                onClick={() => setActiveTab('gallery')}
                className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-border dark:border-slate-700 bg-slate-950 dark:bg-slate-950 group shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label="Xem thư viện ảnh"
              >
                <img
                  src={project.coverImage}
                  alt={project.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <span className="absolute inset-0 bg-black/40 dark:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <Eye size={16} aria-hidden="true" />
                </span>
                {project.images && project.images.length > 0 && (
                  <span className="absolute bottom-1 right-1 bg-slate-900 dark:bg-slate-900 text-white text-2xs px-1 rounded font-mono flex items-center gap-0.5">
                    <Camera size={10} aria-hidden="true" />
                    {project.images.length}
                  </span>
                )}
              </button>
            </Tooltip>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{project.code}</span>
              <Badge variant="outline" size="xs">
                Nhóm {project.projectGroup} • Cấp {project.buildingGrade}
              </Badge>
              <StatusBadge status={project.slaStatus} />
            </div>
            <h2 className="text-sm font-bold text-ink dark:text-slate-100 mt-1">{project.name}</h2>
            <p className="text-xs text-ink-muted dark:text-slate-400 mt-0.5">
              Chủ đầu tư:{' '}
              <strong className="font-semibold text-ink-secondary dark:text-slate-200">
                <EntityName type="organization" id={project.investorId} name={project.investorName} />
              </strong>{' '}
              • Địa điểm: {project.location}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xs uppercase tracking-wider text-ink-muted dark:text-slate-400">Tổng mức đầu tư</p>
            <p className="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(project.totalInvestment)}
            </p>
          </div>
          <div className="text-right pl-3 border-l border-border dark:border-slate-700">
            <p className="text-2xs uppercase tracking-wider text-ink-muted dark:text-slate-400">Hạn trả kết quả</p>
            <p className="text-xs font-bold text-ink dark:text-slate-100">{formatDate(project.deadlineDate)}</p>
          </div>
        </div>
      </div>

      {/* Tabs per appraisal stage and supporting content */}
      <Tabs<PanelTab>
        size="sm"
        ariaLabel="Nội dung dự án"
        value={activeTab}
        onChange={setActiveTab}
        className="scrollbar-none"
        items={[
          { id: 'info', label: '1. Thông tin chung', icon: <Building size={14} /> },
          { id: 'bcnckt', label: '2. Thẩm định BCNCKT', icon: <ShieldCheck size={14} /> },
          { id: 'gpxd', label: '3. Cấp Giấy phép XD', icon: <FileText size={14} /> },
          { id: 'nghiem_thu', label: '4. Hậu kiểm & Nghiệm thu', icon: <FileCheck size={14} /> },
          {
            id: 'entities',
            label: '5. Chủ thể & Kỹ sư',
            icon: <Users size={14} />,
            count: project.contractors.length + 1,
          },
          { id: 'audit', label: '6. Nhật ký AI Audit', icon: <History size={14} /> },
          {
            id: 'gallery',
            label: '7. Ảnh & Phối cảnh',
            icon: <Camera size={14} />,
            count: project.images?.length || 0,
          },
        ]}
      />

      {/* Tab 1: general information (Circular 39/2026/TT-BXD) */}
      {activeTab === 'info' && <ProjectTT39InfoTab project={project} />}

      {/* Tabs 2–4: appraisal workspace per procedure */}
      {appraisalTab && (
        <AppraisalPage key={project.id + activeTab} project={project} procedure={activeTab as ProjectProcedure} />
      )}

      {activeTab === 'entities' && (
        <Card padding="none" className="overflow-hidden text-xs">
          <div className="px-4 py-3 border-b border-border dark:border-slate-800 bg-subtle dark:bg-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-ink dark:text-slate-100">
              Danh sách Đơn vị Tư vấn & Kỹ sư Chủ nhiệm, Chủ trì Dự án
            </span>
            <Tooltip content={CERT_PENDING_HELP} placement="left">
              <span className="inline-flex cursor-help">
                <Badge variant="neutral" size="xs" className="gap-1">
                  <ShieldQuestion size={12} aria-hidden="true" />
                  Chưa kết nối cơ sở dữ liệu chứng chỉ
                </Badge>
              </span>
            </Tooltip>
          </div>
          {project.contractors.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="Chưa có đơn vị tư vấn"
              description="Dự án chưa kê khai đơn vị tư vấn, chủ nhiệm hoặc chủ trì."
              className="py-10"
            />
          ) : (
            <ul className="p-3 space-y-3">
              {project.contractors.map((c, i) => (
                <li
                  key={c.orgId || i}
                  className="p-3 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <Badge variant="primary" size="xs">
                      {c.role}
                    </Badge>
                    <p className="font-bold text-ink dark:text-slate-100 text-xs">
                      <EntityName type="organization" id={c.orgId} name={c.orgName} />
                    </p>
                    <p className="text-xs text-ink-secondary dark:text-slate-300 flex flex-wrap items-center gap-1.5">
                      <span>Chủ nhiệm / Chủ trì:</span>
                      <strong className="font-semibold text-ink dark:text-slate-100">
                        <EntityName type="personnel" id={c.leadPersonnelId} name={c.leadPersonnelName} />
                      </strong>
                      <Tooltip content={CERT_PENDING_HELP} placement="top">
                        <span className="inline-flex cursor-help">
                          <Badge variant="warning" size="xs">
                            Chưa xác minh chứng chỉ
                          </Badge>
                        </span>
                      </Tooltip>
                    </p>
                  </div>

                  <IconButton
                    icon={<ExternalLink size={14} />}
                    aria-label="Tra cứu chứng chỉ (chưa cấu hình)"
                    tooltip="Chưa cấu hình kết nối tra cứu chứng chỉ"
                    tooltipPlacement="left"
                    variant="secondary"
                    size="sm"
                    disabled
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Tab 6: AI audit trail */}
      {activeTab === 'audit' && <AuditHistoryTab projectId={project.id} />}

      {/* Tab 7: project gallery */}
      {activeTab === 'gallery' && <ProjectGalleryTab project={project} />}
    </div>
  );
}
