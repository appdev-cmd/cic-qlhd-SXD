import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Calendar,
  Layers,
  FileCheck2,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Award,
  Briefcase,
  Hash,
  Compass,
  FileText,
  BadgeCheck,
  TrendingDown,
  Building,
  CheckCircle,
  Filter,
  Coins,
  Camera,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../../lib/utils';
import { Tooltip } from '../../components/ui/Tooltip';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import type { Project, ProjectTT39Data, ProjectMemberTT39, ProjectParticipantOrgTT39 } from '../../types/project';
import { projectService } from '../../services/projectService';
import { DossierGrid } from '../../components/appraisal/DossierGrid';
import { EntityLink } from '../../components/ui/EntityLink';
import { useFilterState } from '../../hooks/useFilterState';
import { matchesSmartSearch } from '../../lib/smartSearch';

interface ProjectTT39InfoTabProps {
  project: Project;
}

export function ProjectTT39InfoTab({ project }: ProjectTT39InfoTabProps) {
  const [data, setData] = useState<ProjectTT39Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    projectService
      .getTT39Data(project)
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [project.id]);
  if (loading) return <p className="p-4 text-ink dark:text-ink">Đang tải thông tin dự án…</p>;
  if (error)
    return (
      <p role="alert" className="p-4 text-red-700 dark:text-red-300">
        {error}
      </p>
    );
  if (!data || !Array.isArray(data.members))
    return <p className="p-4 text-ink-muted dark:text-ink-muted">Chưa có thông tin chi tiết được lưu cho dự án này.</p>;
  return <LoadedProjectInfo project={project} tt39={data} />;
}

function LoadedProjectInfo({ project, tt39 }: { project: Project; tt39: ProjectTT39Data }) {
  // Bộ lọc và tìm kiếm danh sách thành viên tham gia
  const [memberSearch, setMemberSearch] = useFilterState('tt39-members-search:' + project.id, '');
  const [selectedOrgFilter, setSelectedOrgFilter] = useFilterState('tt39-members-org:' + project.id, 'all');
  const [copiedCoord, setCopiedCoord] = useState(false);

  // Lọc thành viên
  const filteredMembers = useMemo(() => {
    return tt39.members.filter((m) => {
      const matchSearch = matchesSmartSearch(
        [m.fullName, m.role, m.position, m.certNumber, m.orgName].join(' '),
        memberSearch,
      );

      const matchOrg = selectedOrgFilter === 'all' || m.orgName === selectedOrgFilter;
      return matchSearch && matchOrg;
    });
  }, [tt39.members, memberSearch, selectedOrgFilter]);

  const handleCopyCoordinates = () => {
    navigator.clipboard.writeText(tt39.coordinates);
    setCopiedCoord(true);
    setTimeout(() => setCopiedCoord(false), 2000);
  };

  return (
    <div className="space-y-6 text-xs pb-10">
      {/* ─── BANNER TIÊU CHUẨN THÔNG TƯ 39/2026/TT-BXD ─── */}
      <div className="p-3.5 rounded-xl border border-primary-500/20 bg-primary-500/5 dark:bg-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Layers size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink text-xs">Dữ liệu Hồ sơ Dự án theo Thông tư 39/2026/TT-BXD</span>
              <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Chuẩn hóa CSDL Quốc gia
              </span>
            </div>
            <p className="text-2xs text-ink-muted mt-0.5">
              Quy định chi tiết các trường dữ liệu thu thập, tạo lập CSDL quốc gia và CSDL chuyên ngành theo Nghị định
              212/2026/NĐ-CP & Nghị định 217/2026/NĐ-CP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-2xs">
          <span className="text-ink-muted">Mã CSDL QG:</span>
          <span className="font-mono font-bold px-2 py-1 rounded bg-surface border border-border text-primary-700 dark:text-primary-300">
            {tt39.nationalProjectId}
          </span>
        </div>
      </div>

      {/* ─── KHỐI TƯ LIỆU: ẢNH PHỐI CẢNH 3D & HIỆN TRẠNG KHU ĐẤT (TT39) ─── */}
      {project.images && project.images.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2 font-bold text-ink">
              <Camera size={15} className="text-primary-600" />
              <span className="uppercase tracking-wider text-2xs">
                Tư liệu Ảnh Phối cảnh 3D & Khảo sát Hiện trạng ({project.images.length} tư liệu)
              </span>
            </div>
            <span className="text-3xs text-ink-muted">Căn cứ khảo sát thực địa & đồ án thiết kế</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {project.images.slice(0, 4).map((img, idx) => (
              <div
                key={img.id || idx}
                className="group relative rounded-lg overflow-hidden border border-border bg-slate-900 aspect-video shadow-xs cursor-pointer"
              >
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 group-hover:opacity-60 transition-opacity" />
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-black/60 text-white backdrop-blur-xs border border-white/20">
                  {img.categoryLabel}
                </span>
                <p className="absolute bottom-1.5 left-1.5 right-1.5 text-white font-medium text-3xs truncate">
                  {img.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── KHỐI 1: ĐỊNH DANH DỰ ÁN & CƠ QUAN CÓ THẨM QUYỀN (TT39 MỤC I.1 - I.6, I.9) ─── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink">
            <Building2 size={15} className="text-primary-600" />
            <span className="uppercase tracking-wider text-2xs">
              1. Định danh Dự án & Cơ quan Thẩm quyền (Mục I.1 – I.6, I.9 TT39)
            </span>
          </div>
          <span className="text-3xs text-ink-muted">Bảng 01 Phụ lục II TT39/2026/TT-BXD</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
          <div>
            <span className="text-2xs text-ink-muted block">Tên dự án đầu tư xây dựng:</span>
            <p className="font-bold text-ink text-xs mt-0.5 leading-snug">{project.name}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Mã số dự án đầu tư (Luật Đầu tư):</span>
            <p className="font-mono font-bold text-ink mt-0.5 flex items-center gap-1.5">
              <span>{tt39.investmentCode}</span>
              <span className="text-3xs px-1.5 py-0.5 rounded bg-subtle text-ink-secondary">Đầu tư</span>
            </p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Mã đơn vị quan hệ ngân sách (Đầu tư công):</span>
            <p className="font-mono font-bold text-ink mt-0.5 flex items-center gap-1.5">
              <span>{tt39.budgetRelationCode}</span>
              <span className="text-3xs px-1.5 py-0.5 rounded bg-subtle text-ink-secondary">NSNN</span>
            </p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Người quyết định đầu tư:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.decisionMaker}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Cơ quan chuẩn bị dự án / Chủ đầu tư:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.preparedBy}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Phân nhóm dự án & Loại dự án:</span>
            <p className="font-semibold text-ink mt-0.5 flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-primary-500/10 text-primary-700 font-bold">
                Nhóm {tt39.projectGroup}
              </span>
              <span>•</span>
              <span className="text-ink-secondary">{tt39.projectType}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ─── KHỐI 2: ĐỊA ĐIỂM XÂY DỰNG & TỌA ĐỘ ĐỊNH VỊ (TT39 MỤC I.2) ─── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink">
            <MapPin size={15} className="text-primary-600" />
            <span className="uppercase tracking-wider text-2xs">
              2. Địa điểm Xây dựng & Tọa độ Định vị (Mục I.2 TT39)
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyCoordinates}
            className="flex items-center gap-1 text-3xs px-2 py-1 rounded-lg border border-border bg-subtle hover:bg-surface text-ink transition-colors"
          >
            {copiedCoord ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            <span>{copiedCoord ? 'Đã sao chép' : 'Sao chép tọa độ'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          <div>
            <span className="text-2xs text-ink-muted block">Tỉnh / Thành phố:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.province}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Huyện / Thị xã:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.district}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Xã / Phường:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.commune}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Lô / Ô quy hoạch đất:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.landLot}</p>
          </div>

          <div className="md:col-span-2">
            <span className="text-2xs text-ink-muted block">Địa chỉ chi tiết:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.detailedAddress}</p>
          </div>

          <div className="md:col-span-2">
            <span className="text-2xs text-ink-muted block">Tọa độ GPS định vị (Hệ VN-2000):</span>
            <p className="font-mono font-semibold text-primary-700 dark:text-primary-300 mt-0.5">{tt39.coordinates}</p>
          </div>

          <div className="md:col-span-4 p-2.5 rounded-lg bg-subtle/60 border border-border">
            <span className="text-2xs text-ink-muted block font-medium">Mục tiêu đầu tư của dự án (Mục I.7):</span>
            <p className="text-ink mt-0.5 leading-relaxed">{tt39.objective}</p>
          </div>
        </div>
      </div>

      {/* ─── KHỐI 3: QUY MÔ ĐẦU TƯ XÂY DỰNG & CÔNG TRÌNH (PHỤ LỤC III & MỤC I.8, I.12, I.13 TT39) ─── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink">
            <Compass size={15} className="text-primary-600" />
            <span className="uppercase tracking-wider text-2xs">
              3. Quy mô Kỹ thuật & Chỉ tiêu Xây dựng (Phụ lục III TT39)
            </span>
          </div>
          <span className="text-3xs font-semibold px-2 py-0.5 rounded bg-primary-500/10 text-primary-600">
            {tt39.facilityGrade}
          </span>
        </div>

        {/* 8 Chỉ tiêu KPI quy mô chính */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="text-3xs uppercase tracking-wider text-ink-muted block">Diện tích đất</span>
            <p className="text-sm font-bold font-mono text-ink mt-0.5">
              {tt39.landArea.toLocaleString('vi-VN')} <span className="text-2xs font-normal">m²</span>
            </p>
            <span className="text-3xs text-ink-muted">~ {(tt39.landArea / 10000).toFixed(2)} hecta</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="text-3xs uppercase tracking-wider text-ink-muted block">Diện tích xây dựng</span>
            <p className="text-sm font-bold font-mono text-ink mt-0.5">
              {tt39.constructionArea.toLocaleString('vi-VN')} <span className="text-2xs font-normal">m²</span>
            </p>
            <span className="text-3xs text-ink-muted">Mật độ: {tt39.buildingDensity}%</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="text-3xs uppercase tracking-wider text-ink-muted block">Tổng diện tích sàn</span>
            <p className="text-sm font-bold font-mono text-ink mt-0.5">
              {tt39.grossFloorArea.toLocaleString('vi-VN')} <span className="text-2xs font-normal">m²</span>
            </p>
            <span className="text-3xs text-ink-muted">Hệ số SD đất: {tt39.plotRatio} lần</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-subtle/50">
            <span className="text-3xs uppercase tracking-wider text-ink-muted block">Số tầng & Chiều cao</span>
            <p className="text-sm font-bold text-ink mt-0.5">{tt39.floorCount}</p>
            <span className="text-3xs text-ink-muted">Cao: {tt39.buildingHeight} m</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
          <div>
            <span className="text-2xs text-ink-muted block">Loại & Cấp công trình (NĐ 207/2026/NĐ-CP):</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.facilityType}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Công suất thiết kế phục vụ:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.capacity}</p>
          </div>
        </div>
      </div>

      {/* ─── KHỐI 4: TỔNG MỨC ĐẦU TƯ & NGUỒN VỐN (TT39 MỤC I.14 - I.17 & NĐ 206/2026) ─── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink">
            <Coins size={15} className="text-primary-600" />
            <span className="uppercase tracking-wider text-2xs">
              4. Tổng mức Đầu tư & Cơ cấu Nguồn vốn (Mục I.15 – I.17 TT39)
            </span>
          </div>
          <div className="text-right">
            <span className="text-3xs text-ink-muted mr-2">Tổng mức đầu tư:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
              {formatCurrency(tt39.totalInvestment)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <span className="text-2xs text-ink-muted block">Nguồn vốn đầu tư:</span>
            <p className="font-semibold text-ink mt-0.5">{tt39.fundingSource}</p>
          </div>

          <div>
            <span className="text-2xs text-ink-muted block">Thời gian thực hiện & Tiến độ (Mục I.18):</span>
            <p className="font-semibold text-ink mt-0.5">
              {tt39.executionPeriod} ({tt39.startDate} – {tt39.completionDate})
            </p>
          </div>
        </div>

        {/* Bảng cơ cấu chi phí theo Nghị định 206/2026/NĐ-CP */}
        <div className="mt-2 rounded-lg border border-border overflow-hidden">
          <div className="bg-subtle/70 px-3 py-2 border-b border-border font-bold text-ink flex items-center justify-between">
            <span>Cơ cấu 6 Thành phần Chi phí Tổng mức đầu tư (NĐ 206/2026/NĐ-CP)</span>
            <span className="text-3xs text-ink-muted">Đơn vị: VNĐ</span>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-surface">
            <div>
              <span className="text-3xs text-ink-muted block">1. Chi phí Xây dựng</span>
              <p className="font-mono font-bold text-ink mt-0.5">{formatCurrency(tt39.costBreakdown.construction)}</p>
              <span className="text-3xs text-ink-muted">
                ({((tt39.costBreakdown.construction / tt39.totalInvestment) * 100).toFixed(1)}%)
              </span>
            </div>

            <div>
              <span className="text-3xs text-ink-muted block">2. Chi phí Thiết bị</span>
              <p className="font-mono font-bold text-ink mt-0.5">{formatCurrency(tt39.costBreakdown.equipment)}</p>
              <span className="text-3xs text-ink-muted">
                ({((tt39.costBreakdown.equipment / tt39.totalInvestment) * 100).toFixed(1)}%)
              </span>
            </div>

            <div>
              <span className="text-3xs text-ink-muted block">3. Quản lý dự án</span>
              <p className="font-mono font-bold text-ink mt-0.5">{formatCurrency(tt39.costBreakdown.management)}</p>
              <span className="text-3xs text-ink-muted">
                ({((tt39.costBreakdown.management / tt39.totalInvestment) * 100).toFixed(1)}%)
              </span>
            </div>

            <div>
              <span className="text-3xs text-ink-muted block">4. Tư vấn ĐTXD</span>
              <p className="font-mono font-bold text-ink mt-0.5">{formatCurrency(tt39.costBreakdown.consulting)}</p>
              <span className="text-3xs text-ink-muted">
                ({((tt39.costBreakdown.consulting / tt39.totalInvestment) * 100).toFixed(1)}%)
              </span>
            </div>

            <div>
              <span className="text-3xs text-ink-muted block">5. Bồi thường GPMB & Khác</span>
              <p className="font-mono font-bold text-ink mt-0.5">{formatCurrency(tt39.costBreakdown.others)}</p>
              <span className="text-3xs text-ink-muted">
                ({((tt39.costBreakdown.others / tt39.totalInvestment) * 100).toFixed(1)}%)
              </span>
            </div>

            <div>
              <span className="text-3xs text-ink-muted block">6. Chi phí Dự phòng</span>
              <p className="font-mono font-bold text-amber-600 mt-0.5">
                {formatCurrency(tt39.costBreakdown.contingency)}
              </p>
              <span className="text-3xs text-ink-muted">
                ({((tt39.costBreakdown.contingency / tt39.totalInvestment) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="text-2xs text-ink-secondary pt-1">
          <strong>Phân kỳ đầu tư:</strong> {tt39.phases}
        </div>
      </div>

      {/* ─── KHỐI 5: QUY CHUẨN & TIÊU CHUẨN KỸ THUẬT ÁP DỤNG (TT39 MỤC I.19) ─── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink">
            <FileText size={15} className="text-primary-600" />
            <span className="uppercase tracking-wider text-2xs">
              5. Quy chuẩn Kỹ thuật & Tiêu chuẩn Áp dụng (Mục I.19 TT39)
            </span>
          </div>
          <span className="text-3xs text-ink-muted">{tt39.standards.length} Quy chuẩn / Tiêu chuẩn</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {tt39.standards.map((st, idx) => (
            <div key={idx} className="p-2.5 rounded-lg border border-border bg-subtle/50 flex items-start gap-2.5">
              <div className="w-5 h-5 rounded bg-primary-500/10 text-primary-600 flex items-center justify-center font-bold text-3xs shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="min-w-0">
                <span className="font-mono font-bold text-primary-600 dark:text-primary-400 block text-2xs">
                  {st.code}
                </span>
                <p className="text-ink text-2xs mt-0.5 line-clamp-1">{st.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── KHỐI 6: HỒ SƠ PHÁP LÝ ĐẦU VÀO THEO TT39 (MỤC I.21) ─── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink">
            <FileCheck2 size={15} className="text-primary-600" />
            <span className="uppercase tracking-wider text-2xs">6. Danh mục Hồ sơ Pháp lý Đầu vào (Mục I.21 TT39)</span>
          </div>
          <span className="text-3xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
            {tt39.legalDocs.length} Văn bản kê khai
          </span>
        </div>

        <DossierGrid
          storageKey={'tt39-documents:' + project.id}
          rows={tt39.legalDocs.map((doc, index) => ({ ...doc, id: String(index) }))}
          columns={[
            { label: 'Loại văn bản', value: (r) => r.category, width: 170 },
            { label: 'Số hiệu', value: (r) => r.docNumber, width: 160 },
            { label: 'Ngày văn bản', value: (r) => r.docDate, render: (r) => formatDate(r.docDate), width: 120 },
            { label: 'Cơ quan ban hành', value: (r) => r.issuer, width: 220 },
            { label: 'Trích yếu', value: (r) => r.description, width: 320 },
            {
              label: 'Trạng thái kê khai',
              value: (r) => r.status,
              render: (r) =>
                r.status === 'da_xac_thuc'
                  ? 'Đã kê khai xác thực'
                  : r.status === 'can_bo_sung'
                    ? 'Cần bổ sung'
                    : 'Chờ đối soát',
              width: 170,
            },
          ]}
        />
        <p className="text-2xs text-ink-muted dark:text-ink-muted">
          Trạng thái kê khai cần đối chiếu văn bản gốc; hệ thống chưa xác minh chữ ký số.
        </p>
      </div>

      {/* ─── KHỐI 7: DANH SÁCH CÁC ĐƠN VỊ THAM GIA DỰ ÁN (TT39 MỤC I.20) ─── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-ink">
            <Building size={15} className="text-primary-600" />
            <span className="uppercase tracking-wider text-2xs">
              7. Danh sách Đơn vị Tham gia Dự án (Mục I.20 TT39)
            </span>
          </div>
          <span className="text-3xs font-semibold px-2 py-0.5 rounded bg-primary-500/10 text-primary-600">
            {tt39.participants.length} Tổ chức / Nhà thầu
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {tt39.participants.map((org) => (
            <div
              key={org.id}
              className="p-3.5 rounded-xl border border-border bg-subtle/40 hover:bg-surface hover:shadow-xs transition-all space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-3xs font-semibold px-2 py-0.5 rounded bg-primary-500/10 text-primary-700 dark:text-primary-300">
                    {org.role}
                  </span>
                  <h5 className="font-bold text-ink dark:text-ink text-xs mt-1.5 leading-snug">
                    {project.contractors.find((c) => c.orgName === org.name)?.orgId ? (
                      <EntityLink
                        type="organization"
                        id={project.contractors.find((c) => c.orgName === org.name)!.orgId}
                        name={org.name}
                      />
                    ) : (
                      org.name
                    )}
                  </h5>
                </div>
                {org.certGrade && (
                  <span className="text-3xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 shrink-0">
                    Hạng {org.certGrade}
                  </span>
                )}
              </div>

              <div className="space-y-1 text-2xs pt-1 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Mã số thuế / Mã ĐV:</span>
                  <span className="font-mono font-semibold text-ink">{org.taxCode}</span>
                </div>
                {org.certNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Chứng chỉ năng lực:</span>
                    <span className="font-mono font-semibold text-primary-600">{org.certNumber}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Đại diện pháp luật:</span>
                  <span className="font-medium text-ink">{org.representative}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Địa chỉ trụ sở:</span>
                  <span className="text-ink-secondary truncate max-w-[200px]" data-tooltip={org.address}>
                    {org.address}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-ink-muted">Số nhân sự tham gia dự án:</span>
                  <span className="font-bold text-primary-700 bg-primary-500/10 px-2 py-0.2 rounded">
                    {org.memberCount} thành viên có CCHN
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── KHỐI 8: BẢNG DANH SÁCH THÀNH VIÊN / NHÂN SỰ CÓ CCHN (TT39 MỤC I.20) ─── */}
      <div className="rounded-xl border border-border bg-surface shadow-xs overflow-hidden space-y-0">
        {/* Header bảng kèm Toolbar lọc & tìm kiếm */}
        <div className="p-4 border-b border-border bg-subtle/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-ink">
                <Users size={16} className="text-primary-600" />
                <span className="uppercase tracking-wider text-xs">
                  8. Bảng Danh sách Thành viên & Cá nhân có CCHN Tham gia Dự án
                </span>
              </div>
              <p className="text-2xs text-ink-muted mt-0.5">
                Kê khai Chủ nhiệm, Chủ trì theo quy định tại Điểm 20.2, 20.4, 20.5, 20.7, 20.8 Mục 20 Bảng 01 Phụ lục II
                TT39
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-3xs text-ink-muted">Tổng số nhân sự:</span>
              <span className="font-bold text-xs px-2 py-0.5 rounded bg-primary-600 text-white font-mono">
                {filteredMembers.length} / {tt39.members.length}
              </span>
            </div>
          </div>

          {/* Hàng bộ lọc và tìm kiếm */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
              />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Tìm theo tên thành viên, vai trò, số CCHN..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {memberSearch && (
                <button
                  type="button"
                  onClick={() => setMemberSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs font-bold"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-ink-muted" />
              <SearchableSelect
                value={selectedOrgFilter}
                onChange={setSelectedOrgFilter}
                options={[
                  { value: 'all', label: `Tất cả đơn vị tham gia (${tt39.members.length})` },
                  ...tt39.participants.map((org) => ({ value: org.name, label: org.name })),
                ]}
              />
            </div>
          </div>
        </div>

        <DossierGrid
          storageKey={'tt39-members:' + project.id}
          rows={filteredMembers}
          columns={[
            {
              label: 'Thành viên / Họ tên',
              value: (r) => r.fullName,
              width: 220,
              render: (r) => {
                const id = project.contractors.find((c) => c.leadPersonnelName === r.fullName)?.leadPersonnelId;
                return id ? <EntityLink type="personnel" id={id} name={r.fullName} /> : <span>{r.fullName}</span>;
              },
            },
            {
              label: 'Vai trò trong dự án',
              value: (r) => r.role,
              width: 220,
              render: (r) => (
                <div>
                  {r.role}
                  <p className="text-ink-muted dark:text-ink-muted">{r.orgRole}</p>
                </div>
              ),
            },
            { label: 'Chức vụ tại đơn vị', value: (r) => r.position, width: 170 },
            {
              label: 'Đơn vị',
              value: (r) => r.orgName,
              width: 250,
              render: (r) => {
                const id = project.contractors.find((c) => c.orgName === r.orgName)?.orgId;
                return id ? <EntityLink type="organization" id={id} name={r.orgName} /> : <span>{r.orgName}</span>;
              },
            },
            {
              label: 'Số CCHN / Hạng',
              value: (r) => r.certNumber,
              width: 180,
              render: (r) => (
                <div>
                  {r.certNumber} · Hạng {r.certGrade}
                  <p className="text-ink-muted dark:text-ink-muted">{r.certIssuer}</p>
                </div>
              ),
            },
            { label: 'Lĩnh vực hành nghề', value: (r) => r.specialties.join(', '), width: 230 },
            { label: 'Hạn CCHN', value: (r) => r.certExpiry, render: (r) => formatDate(r.certExpiry), width: 120 },
            {
              label: 'Tình trạng kê khai',
              value: (r) => r.status,
              render: (r) =>
                r.status === 'hieu_luc' ? 'Còn hạn' : r.status === 'sap_het_han' ? 'Sắp hết hạn' : 'Hết hạn',
              width: 160,
            },
          ]}
        />

        {/* Footer bảng ghi chú */}
        <div className="p-3 border-t border-border bg-subtle/30 flex flex-wrap items-center justify-between text-3xs text-ink-muted gap-2">
          <span>
            Dữ liệu được lưu trong hồ sơ dự án. Cần đối chiếu chứng chỉ và nguồn chính thức; chưa có kết nối đồng bộ
            CSDL quốc gia.
          </span>
          <span className="font-mono">TT39/2026/TT-BXD • Điều 5 & Điều 21</span>
        </div>
      </div>
    </div>
  );
}
