import { AppraisalPage } from '../AppraisalPage';
import type { ProjectProcedure } from '../../lib/projectProcedures';
import React, { useState } from 'react';
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
  FileSpreadsheet,
  Download,
  Printer,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Split,
  Eye,
  Camera,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tooltip } from '../../components/ui/Tooltip';
import { ProjectTT39InfoTab } from './ProjectTT39InfoTab';
import { ProjectGalleryTab } from './ProjectGalleryTab';
import type { Project } from '../../data/mockData';
import { AuditHistoryTab } from '../../components/appraisal/AuditHistoryTab';

export function ProjectDetailSlidePanel({ project, initialTab='bcnckt' }: { project: Project; initialTab?:ProjectProcedure }) {
  const [activeTab, setActiveTab] = useState<'info' | 'gallery' | 'bcnckt' | 'gpxd' | 'nghiem_thu' | 'entities' | 'audit'>(initialTab);



  return (
    <div className={cn('space-y-5',(['bcnckt','gpxd','nghiem_thu'] as string[]).includes(activeTab)&&'h-full flex flex-col [&>div]:shrink-0')}>
      {/* ─── BANNER TÓM TẮT DỰ ÁN ─── */}
      <div className="p-4 rounded-xl border border-border bg-subtle/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          {project.coverImage && (
            <div
              onClick={() => setActiveTab('gallery')}
              className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-border/80 bg-slate-950 cursor-pointer group shadow-xs"
              role="button" aria-label="Xem thư viện ảnh"
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
            </div>
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
              Chủ đầu tư: <strong>{project.investorName}</strong> • Địa điểm: {project.location}
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
          <span>6. Nhật ký AI Audit</span>
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
      {activeTab === 'info' && <ProjectTT39InfoTab project={project} />}

      {/* TAB 2: THẨM ĐỊNH BCNCKT (TRỌNG TÂM CỦA SỞ XÂY DỰNG) */}
      {(['bcnckt','gpxd','nghiem_thu'] as string[]).includes(activeTab) &&
        <AppraisalPage key={project.id+activeTab} project={project} procedure={activeTab as ProjectProcedure}/>}

      {activeTab === 'entities' && (
        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs">
            <div className="p-3 border-b border-border bg-subtle/50 font-bold text-ink flex items-center justify-between">
              <span>Danh sách Đơn vị Tư vấn & Kỹ sư Chủ nhiệm, Chủ trì Dự án</span>
              <span className="text-3xs text-ink-muted">Chưa kết nối cơ sở dữ liệu chứng chỉ</span>
            </div>
            <div className="p-3 space-y-3">
              {project.contractors.map((c, i) => (
                <div key={i} className="p-3 rounded-lg border border-border bg-subtle/40 flex items-center justify-between">
                  <div>
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-primary-500/10 text-primary-600">
                      {c.role}
                    </span>
                    <p className="font-bold text-ink text-xs mt-1">{c.orgName}</p>
                    <p className="text-2xs text-ink-secondary mt-0.5 flex items-center gap-1.5">
                      <span>Chủ nhiệm / Chủ trì:</span>
                      <strong className="text-ink">{c.leadPersonnelName}</strong>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-emerald-600 font-medium">Chưa xác minh chứng chỉ</span>
                    </p>
                  </div>

                  <Tooltip content="Chưa cấu hình kết nối tra cứu chứng chỉ" placement="left">
                    <button
                      type="button" disabled
                      className="p-1.5 rounded-lg border border-border bg-surface hover:bg-subtle text-ink-muted hover:text-ink transition-colors"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: NHẬT KÝ AI AUDIT TRAIL */}
      {activeTab === 'audit' && <AuditHistoryTab projectId={project.id}/>}

      {/* TAB 7: THƯ VIỆN ẢNH & PHỐI CẢNH 3D DỰ ÁN */}
      {activeTab === 'gallery' && <ProjectGalleryTab project={project} />}
    </div>
  );
}
