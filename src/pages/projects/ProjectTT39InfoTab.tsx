import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Layers,
  FileCheck2,
  Users,
  Search,
  Copy,
  Check,
  Compass,
  FileText,
  Building,
  Filter,
  Coins,
  Camera,
  X,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatNumber } from '../../lib/utils';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { Badge, Button, Card, ErrorMessage, IconButton, Skeleton, SkeletonText } from '../../components/ui';
import type { Project, ProjectTT39Data } from '../../types/project';
import { projectService } from '../../services/projectService';
import { DossierGrid } from '../../components/appraisal/DossierGrid';
import { EntityLink } from '../../components/ui/EntityLink';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFilterState } from '../../hooks/useFilterState';
import { matchesSmartSearch } from '../../lib/smartSearch';

interface ProjectTT39InfoTabProps {
  project: Project;
}

function InfoSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải thông tin dự án">
      <Skeleton variant="rounded" height={64} />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} padding="md">
          <Skeleton width="40%" className="mb-4" />
          <SkeletonText lines={3} />
        </Card>
      ))}
    </div>
  );
}

export function ProjectTT39InfoTab({ project }: ProjectTT39InfoTabProps) {
  const [data, setData] = useState<ProjectTT39Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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
  }, [project.id, attempt]);
  if (loading) return <InfoSkeleton />;
  if (error) return <ErrorMessage error={error} variant="card" onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data || !Array.isArray(data.members))
    return (
      <Card padding="none">
        <EmptyState
          variant="folder"
          title="Chưa có thông tin chi tiết"
          description="Chưa có thông tin chi tiết được lưu cho dự án này."
        />
      </Card>
    );
  return <LoadedProjectInfo project={project} tt39={data} />;
}

/** One numbered TT39 block: icon + uppercase title on the left, optional aside on the right. */
function InfoSection({
  icon,
  title,
  aside,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card padding="md" className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border dark:border-slate-800 pb-2.5">
        <h3 className="flex items-center gap-2 font-bold text-ink dark:text-slate-100">
          <span className="shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true">
            {icon}
          </span>
          <span className="uppercase tracking-wider text-2xs">{title}</span>
        </h3>
        {aside && <div className="shrink-0 text-2xs text-ink-muted dark:text-slate-400">{aside}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Label/value pair used across the TT39 grids. */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="block text-2xs text-ink-muted dark:text-slate-400">{label}</span>
      <div className="mt-0.5 font-semibold text-ink dark:text-slate-100 leading-snug">{children}</div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl border border-border dark:border-slate-800 bg-subtle dark:bg-slate-800">
      <span className="block text-2xs uppercase tracking-wider text-ink-muted dark:text-slate-400">{label}</span>
      <p className="text-sm font-bold font-mono tabular-nums text-ink dark:text-slate-100 mt-0.5">{value}</p>
      <span className="text-2xs text-ink-muted dark:text-slate-400">{note}</span>
    </div>
  );
}

function LoadedProjectInfo({ project, tt39 }: { project: Project; tt39: ProjectTT39Data }) {
  // Member list search and organization filter
  const [memberSearch, setMemberSearch] = useFilterState('tt39-members-search:' + project.id, '');
  const [selectedOrgFilter, setSelectedOrgFilter] = useFilterState('tt39-members-org:' + project.id, 'all');
  const [copiedCoord, setCopiedCoord] = useState(false);

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

  const orgId = (name: string) => project.contractors.find((c) => c.orgName === name)?.orgId;
  const share = (value: number) => ((value / tt39.totalInvestment) * 100).toFixed(1);
  const costs: { label: string; value: number; tone?: string }[] = [
    { label: '1. Chi phí Xây dựng', value: tt39.costBreakdown.construction },
    { label: '2. Chi phí Thiết bị', value: tt39.costBreakdown.equipment },
    { label: '3. Quản lý dự án', value: tt39.costBreakdown.management },
    { label: '4. Tư vấn ĐTXD', value: tt39.costBreakdown.consulting },
    { label: '5. Bồi thường GPMB & Khác', value: tt39.costBreakdown.others },
    {
      label: '6. Chi phí Dự phòng',
      value: tt39.costBreakdown.contingency,
      tone: 'text-warning-700 dark:text-warning-300',
    },
  ];

  return (
    <div className="space-y-4 text-xs pb-10">
      {/* Circular 39/2026/TT-BXD banner */}
      <div className="p-3.5 rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-primary-600 dark:bg-primary-600 text-white flex items-center justify-center shadow-xs">
            <Layers size={17} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-ink dark:text-slate-100 text-xs">
                Dữ liệu Hồ sơ Dự án theo Thông tư 39/2026/TT-BXD
              </span>
              <Badge variant="success" size="xs">
                Chuẩn hóa CSDL Quốc gia
              </Badge>
            </div>
            <p className="text-2xs text-ink-muted dark:text-slate-400 mt-0.5">
              Quy định chi tiết các trường dữ liệu thu thập, tạo lập CSDL quốc gia và CSDL chuyên ngành theo Nghị định
              212/2026/NĐ-CP & Nghị định 217/2026/NĐ-CP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-2xs">
          <span className="text-ink-muted dark:text-slate-400">Mã CSDL QG:</span>
          <span className="font-mono font-bold px-2 py-1 rounded-lg bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 text-primary-700 dark:text-primary-300">
            {tt39.nationalProjectId}
          </span>
        </div>
      </div>

      {/* Perspective & site survey photos (TT39) */}
      {project.images && project.images.length > 0 && (
        <InfoSection
          icon={<Camera size={15} />}
          title={<>Tư liệu Ảnh Phối cảnh 3D & Khảo sát Hiện trạng ({project.images.length} tư liệu)</>}
          aside="Căn cứ khảo sát thực địa & đồ án thiết kế"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {project.images.slice(0, 4).map((img, idx) => (
              <div
                key={img.id || idx}
                className="group relative rounded-xl overflow-hidden border border-border dark:border-slate-800 bg-slate-900 dark:bg-slate-900 aspect-video shadow-xs"
              >
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 group-hover:opacity-60 transition-opacity" />
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-lg text-2xs font-semibold bg-black/60 text-white border border-white/20">
                  {img.categoryLabel}
                </span>
                <p className="absolute bottom-1.5 left-1.5 right-1.5 text-white font-medium text-2xs truncate">
                  {img.title}
                </p>
              </div>
            ))}
          </div>
        </InfoSection>
      )}

      {/* Block 1: project identity & competent authority (TT39 I.1 – I.6, I.9) */}
      <InfoSection
        icon={<Building2 size={15} />}
        title="1. Định danh Dự án & Cơ quan Thẩm quyền (Mục I.1 – I.6, I.9 TT39)"
        aside="Bảng 01 Phụ lục II TT39/2026/TT-BXD"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <Field label="Tên dự án đầu tư xây dựng:">
            <span className="font-bold">{project.name}</span>
          </Field>
          <Field label="Mã số dự án đầu tư (Luật Đầu tư):">
            <span className="font-mono font-bold flex items-center gap-1.5">
              {tt39.investmentCode}
              <Badge variant="neutral" size="xs">
                Đầu tư
              </Badge>
            </span>
          </Field>
          <Field label="Mã đơn vị quan hệ ngân sách (Đầu tư công):">
            <span className="font-mono font-bold flex items-center gap-1.5">
              {tt39.budgetRelationCode}
              <Badge variant="neutral" size="xs">
                NSNN
              </Badge>
            </span>
          </Field>
          <Field label="Người quyết định đầu tư:">{tt39.decisionMaker}</Field>
          <Field label="Cơ quan chuẩn bị dự án / Chủ đầu tư:">
            {project.investorId && tt39.preparedBy === project.investorName ? (
              <EntityLink type="organization" id={project.investorId} name={tt39.preparedBy} />
            ) : (
              tt39.preparedBy
            )}
          </Field>
          <Field label="Phân nhóm dự án & Loại dự án:">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge variant="primary" size="xs">
                Nhóm {tt39.projectGroup}
              </Badge>
              <span className="font-normal text-ink-secondary dark:text-slate-300">{tt39.projectType}</span>
            </span>
          </Field>
        </div>
      </InfoSection>

      {/* Block 2: location & coordinates (TT39 I.2) */}
      <InfoSection
        icon={<MapPin size={15} />}
        title="2. Địa điểm Xây dựng & Tọa độ Định vị (Mục I.2 TT39)"
        aside={
          <Button
            variant="secondary"
            size="xs"
            leftIcon={
              copiedCoord ? <Check size={12} className="text-success-600 dark:text-success-400" /> : <Copy size={12} />
            }
            onClick={handleCopyCoordinates}
          >
            {copiedCoord ? 'Đã sao chép' : 'Sao chép tọa độ'}
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Field label="Tỉnh / Thành phố:">{tt39.province}</Field>
          <Field label="Huyện / Thị xã:">{tt39.district}</Field>
          <Field label="Xã / Phường:">{tt39.commune}</Field>
          <Field label="Lô / Ô quy hoạch đất:">{tt39.landLot}</Field>
          <Field label="Địa chỉ chi tiết:" className="md:col-span-2">
            {tt39.detailedAddress}
          </Field>
          <Field label="Tọa độ GPS định vị (Hệ VN-2000):" className="md:col-span-2">
            <span className="font-mono text-primary-700 dark:text-primary-300">{tt39.coordinates}</span>
          </Field>
          <div className="md:col-span-2 lg:col-span-4 p-2.5 rounded-xl bg-subtle dark:bg-slate-800 border border-border dark:border-slate-700">
            <span className="text-2xs text-ink-muted dark:text-slate-400 block font-medium">
              Mục tiêu đầu tư của dự án (Mục I.7):
            </span>
            <p className="text-ink dark:text-slate-100 mt-0.5 leading-relaxed">{tt39.objective}</p>
          </div>
        </div>
      </InfoSection>

      {/* Block 3: technical scale (TT39 Appendix III, I.8, I.12, I.13) */}
      <InfoSection
        icon={<Compass size={15} />}
        title="3. Quy mô Kỹ thuật & Chỉ tiêu Xây dựng (Phụ lục III TT39)"
        aside={
          <Badge variant="primary" size="xs">
            {tt39.facilityGrade}
          </Badge>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric
            label="Diện tích đất"
            value={
              <>
                {formatNumber(tt39.landArea)} <span className="text-2xs font-normal">m²</span>
              </>
            }
            note={<>~ {(tt39.landArea / 10000).toFixed(2)} hecta</>}
          />
          <Metric
            label="Diện tích xây dựng"
            value={
              <>
                {formatNumber(tt39.constructionArea)} <span className="text-2xs font-normal">m²</span>
              </>
            }
            note={<>Mật độ: {tt39.buildingDensity}%</>}
          />
          <Metric
            label="Tổng diện tích sàn"
            value={
              <>
                {formatNumber(tt39.grossFloorArea)} <span className="text-2xs font-normal">m²</span>
              </>
            }
            note={<>Hệ số SD đất: {tt39.plotRatio} lần</>}
          />
          <Metric
            label="Số tầng & Chiều cao"
            value={<span className="font-sans">{tt39.floorCount}</span>}
            note={<>Cao: {tt39.buildingHeight} m</>}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          <Field label="Loại & Cấp công trình (NĐ 207/2026/NĐ-CP):">{tt39.facilityType}</Field>
          <Field label="Công suất thiết kế phục vụ:">{tt39.capacity}</Field>
        </div>
      </InfoSection>

      {/* Block 4: total investment & funding (TT39 I.14 – I.17, Decree 206/2026) */}
      <InfoSection
        icon={<Coins size={15} />}
        title="4. Tổng mức Đầu tư & Cơ cấu Nguồn vốn (Mục I.15 – I.17 TT39)"
        aside={
          <span className="flex items-center gap-2">
            <span>Tổng mức đầu tư:</span>
            <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 text-sm">
              {formatCurrency(tt39.totalInvestment)}
            </span>
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <Field label="Nguồn vốn đầu tư:">{tt39.fundingSource}</Field>
          <Field label="Thời gian thực hiện & Tiến độ (Mục I.18):">
            {tt39.executionPeriod} ({formatDate(tt39.startDate)} – {formatDate(tt39.completionDate)})
          </Field>
        </div>

        {/* Cost structure per Decree 206/2026/NĐ-CP */}
        <div className="rounded-xl border border-border dark:border-slate-800 overflow-hidden">
          <div className="bg-subtle dark:bg-slate-800 px-3 py-2 border-b border-border dark:border-slate-700 font-bold text-ink dark:text-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span>Cơ cấu 6 Thành phần Chi phí Tổng mức đầu tư (NĐ 206/2026/NĐ-CP)</span>
            <span className="text-2xs font-normal text-ink-muted dark:text-slate-400">Đơn vị: VNĐ</span>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-surface dark:bg-slate-900">
            {costs.map((cost) => (
              <div key={cost.label}>
                <span className="text-2xs text-ink-muted dark:text-slate-400 block">{cost.label}</span>
                <p
                  className={cn('font-mono tabular-nums font-bold mt-0.5', cost.tone || 'text-ink dark:text-slate-100')}
                >
                  {formatCurrency(cost.value)}
                </p>
                <span className="text-2xs text-ink-muted dark:text-slate-400">({share(cost.value)}%)</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-2xs text-ink-secondary dark:text-slate-300">
          <strong>Phân kỳ đầu tư:</strong> {tt39.phases}
        </p>
      </InfoSection>

      {/* Block 5: applicable codes & standards (TT39 I.19) */}
      <InfoSection
        icon={<FileText size={15} />}
        title="5. Quy chuẩn Kỹ thuật & Tiêu chuẩn Áp dụng (Mục I.19 TT39)"
        aside={<>{tt39.standards.length} Quy chuẩn / Tiêu chuẩn</>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {tt39.standards.map((st, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl border border-border dark:border-slate-800 bg-subtle dark:bg-slate-800 flex items-start gap-2.5"
            >
              <div className="w-5 h-5 rounded-lg bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200 flex items-center justify-center font-bold text-2xs shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="min-w-0">
                <span className="font-mono font-bold text-primary-600 dark:text-primary-400 block text-2xs">
                  {st.code}
                </span>
                <p className="text-ink dark:text-slate-100 text-2xs mt-0.5 line-clamp-1">{st.name}</p>
              </div>
            </div>
          ))}
        </div>
      </InfoSection>

      {/* Block 6: input legal documents (TT39 I.21) */}
      <InfoSection
        icon={<FileCheck2 size={15} />}
        title="6. Danh mục Hồ sơ Pháp lý Đầu vào (Mục I.21 TT39)"
        aside={
          <Badge variant="success" size="xs">
            {tt39.legalDocs.length} Văn bản kê khai
          </Badge>
        }
      >
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
                r.status === 'da_xac_thuc' ? (
                  <Badge variant="success" size="xs">
                    Đã kê khai xác thực
                  </Badge>
                ) : r.status === 'can_bo_sung' ? (
                  <Badge variant="warning" size="xs">
                    Cần bổ sung
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="xs">
                    Chờ đối soát
                  </Badge>
                ),
              width: 170,
            },
          ]}
        />
        <p className="text-2xs text-ink-muted dark:text-slate-400">
          Trạng thái kê khai cần đối chiếu văn bản gốc; hệ thống chưa xác minh chữ ký số.
        </p>
      </InfoSection>

      {/* Block 7: participating organizations (TT39 I.20) */}
      <InfoSection
        icon={<Building size={15} />}
        title="7. Danh sách Đơn vị Tham gia Dự án (Mục I.20 TT39)"
        aside={
          <Badge variant="primary" size="xs">
            {tt39.participants.length} Tổ chức / Nhà thầu
          </Badge>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {tt39.participants.map((org) => {
            const id = orgId(org.name);
            return (
              <div
                key={org.id}
                className="p-3.5 rounded-xl border border-border dark:border-slate-800 bg-subtle dark:bg-slate-800 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge variant="primary" size="xs">
                      {org.role}
                    </Badge>
                    <h5 className="font-bold text-ink dark:text-slate-100 text-xs mt-1.5 leading-snug">
                      {id ? <EntityLink type="organization" id={id} name={org.name} /> : org.name}
                    </h5>
                  </div>
                  {org.certGrade && (
                    <Badge variant="success" size="xs" className="shrink-0 font-mono">
                      Hạng {org.certGrade}
                    </Badge>
                  )}
                </div>

                <dl className="space-y-1 text-2xs pt-2 border-t border-border dark:border-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted dark:text-slate-400">Mã số thuế / Mã ĐV:</dt>
                    <dd className="font-mono font-semibold text-ink dark:text-slate-100">{org.taxCode}</dd>
                  </div>
                  {org.certNumber && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-muted dark:text-slate-400">Chứng chỉ năng lực:</dt>
                      <dd className="font-mono font-semibold text-primary-600 dark:text-primary-400">
                        {org.certNumber}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted dark:text-slate-400">Đại diện pháp luật:</dt>
                    <dd className="font-medium text-ink dark:text-slate-100">{org.representative}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted dark:text-slate-400 shrink-0">Địa chỉ trụ sở:</dt>
                    <dd
                      className="text-ink-secondary dark:text-slate-300 truncate max-w-[200px]"
                      data-tooltip={org.address}
                    >
                      {org.address}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <dt className="text-ink-muted dark:text-slate-400">Số nhân sự tham gia dự án:</dt>
                    <dd>
                      <Badge variant="primary" size="xs">
                        {org.memberCount} thành viên có CCHN
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </InfoSection>

      {/* Block 8: members with practising certificates (TT39 I.20) */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-border dark:border-slate-800 bg-subtle dark:bg-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 font-bold text-ink dark:text-slate-100">
                <Users size={16} className="text-primary-600 dark:text-primary-300" aria-hidden="true" />
                <span className="uppercase tracking-wider text-xs">
                  8. Bảng Danh sách Thành viên & Cá nhân có CCHN Tham gia Dự án
                </span>
              </h3>
              <p className="text-2xs text-ink-muted dark:text-slate-400 mt-0.5">
                Kê khai Chủ nhiệm, Chủ trì theo quy định tại Điểm 20.2, 20.4, 20.5, 20.7, 20.8 Mục 20 Bảng 01 Phụ lục II
                TT39
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-2xs text-ink-muted dark:text-slate-400">Tổng số nhân sự:</span>
              <Badge variant="primary" size="sm" className="font-mono">
                {filteredMembers.length} / {tt39.members.length}
              </Badge>
            </div>
          </div>

          {/* Search first, then the organization filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted dark:text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Tìm theo tên thành viên, vai trò, số CCHN..."
                aria-label="Tìm thành viên"
                className="w-full pl-9 pr-9 py-1.5 text-xs rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-900 text-ink dark:text-slate-100 placeholder:text-ink-muted dark:placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
              {memberSearch && (
                <IconButton
                  icon={<X size={12} />}
                  aria-label="Xóa từ khóa"
                  tooltip="Xóa từ khóa"
                  size="xs"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  onClick={() => setMemberSearch('')}
                />
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-ink-muted dark:text-slate-400" aria-hidden="true" />
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
                  <p className="text-ink-muted dark:text-slate-400">{r.orgRole}</p>
                </div>
              ),
            },
            { label: 'Chức vụ tại đơn vị', value: (r) => r.position, width: 170 },
            {
              label: 'Đơn vị',
              value: (r) => r.orgName,
              width: 250,
              render: (r) => {
                const id = orgId(r.orgName);
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
                  <p className="text-ink-muted dark:text-slate-400">{r.certIssuer}</p>
                </div>
              ),
            },
            { label: 'Lĩnh vực hành nghề', value: (r) => r.specialties.join(', '), width: 230 },
            { label: 'Hạn CCHN', value: (r) => r.certExpiry, render: (r) => formatDate(r.certExpiry), width: 120 },
            {
              label: 'Tình trạng kê khai',
              value: (r) => r.status,
              render: (r) =>
                r.status === 'hieu_luc' ? (
                  <Badge variant="success" size="xs">
                    Còn hạn
                  </Badge>
                ) : r.status === 'sap_het_han' ? (
                  <Badge variant="warning" size="xs">
                    Sắp hết hạn
                  </Badge>
                ) : (
                  <Badge variant="danger" size="xs">
                    Hết hạn
                  </Badge>
                ),
              width: 160,
            },
          ]}
        />

        <div className="p-3 border-t border-border dark:border-slate-800 bg-subtle dark:bg-slate-800 flex flex-wrap items-center justify-between text-2xs text-ink-muted dark:text-slate-400 gap-2">
          <span>
            Dữ liệu được lưu trong hồ sơ dự án. Cần đối chiếu chứng chỉ và nguồn chính thức; chưa có kết nối đồng bộ
            CSDL quốc gia.
          </span>
          <span className="font-mono">TT39/2026/TT-BXD • Điều 5 & Điều 21</span>
        </div>
      </Card>
    </div>
  );
}
