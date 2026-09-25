import React, { useState, useMemo } from 'react';
import { MasterTable, type Column } from '../components/MasterTable';
import { TableToolbar } from '../components/TableToolbar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { MOCK_PROJECTS, MOCK_PERSONNEL, type Organization } from '../data/mockData';
import { useOrganizations } from '../hooks/useSupabaseData';
import { formatDate, formatCurrency } from '../lib/utils';
import { useSlidePanel } from '../context/SlidePanelContext';
import { matchesSmartSearch } from '../lib/smartSearch';
import { Building2, ShieldCheck, Briefcase, Users, Phone, MapPin, FileText, CheckCircle2, Database } from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';

export function OrganizationsPage() {
  const { openPanel } = useSlidePanel();
  const { organizations, isLiveDb } = useOrganizations();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const matchSearch =
        matchesSmartSearch(org.name, searchQuery) ||
        matchesSmartSearch(org.code, searchQuery) ||
        matchesSmartSearch(org.representative, searchQuery) ||
        matchesSmartSearch(org.taxCode, searchQuery) ||
        matchesSmartSearch(org.address, searchQuery);

      const matchType = typeFilter === 'all' || org.type === typeFilter;
      const matchStatus = statusFilter === 'all' || org.status === statusFilter;

      return matchSearch && matchType && matchStatus;
    });
  }, [searchQuery, typeFilter, statusFilter]);

  const handleOpenOrgDetail = (org: Organization) => {
    const orgProjects = MOCK_PROJECTS.filter(
      (p) => p.investorId === org.id || p.contractors.some((c) => c.orgId === org.id)
    );
    const orgPersonnel = MOCK_PERSONNEL.filter((p) => p.orgId === org.id);

    openPanel({
      id: `org-${org.id}`,
      title: org.name,
      subtitle: `Mã: ${org.code} • MST: ${org.taxCode}`,
      tabTitle: org.code,
      component: (
        <div className="space-y-4 text-xs">
          {/* Hồ sơ Pháp nhân & Đại diện */}
          <div className="p-4 rounded-xl border border-border bg-subtle/50 space-y-3">
            <h4 className="font-bold text-ink uppercase tracking-wider text-2xs text-ink-muted flex items-center gap-1.5">
              <Building2 size={14} className="text-primary-600" />
              <span>Hồ sơ Pháp nhân & Đại diện</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-ink">
              <div>
                <span className="text-ink-muted">Người đại diện pháp luật:</span>
                <p className="font-semibold text-ink">{org.representative}</p>
              </div>
              <div>
                <span className="text-ink-muted">Mã số thuế / Mã ĐV:</span>
                <p className="font-mono font-semibold text-primary-600">{org.taxCode}</p>
              </div>
              <div>
                <span className="text-ink-muted">Số điện thoại liên hệ:</span>
                <p className="font-semibold text-ink flex items-center gap-1">
                  <Phone size={12} className="text-ink-muted" />
                  <span>{org.phone}</span>
                </p>
              </div>
              <div>
                <span className="text-ink-muted">Địa chỉ trụ sở:</span>
                <p className="font-semibold text-ink flex items-center gap-1">
                  <MapPin size={12} className="text-ink-muted shrink-0" />
                  <span>{org.address}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Chứng chỉ Năng lực Hoạt động Xây dựng */}
          {org.certificateNumber ? (
            <div className="p-4 rounded-xl border border-primary-500/30 bg-primary-500/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-primary-700 dark:text-primary-300 flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-primary-600" />
                  <span>Chứng chỉ Năng lực Hoạt động Xây dựng</span>
                </h4>
                <StatusBadge status={org.status} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-ink pt-1">
                <div>
                  <span className="text-ink-muted">Số chứng chỉ:</span>
                  <p className="font-mono font-bold text-ink">{org.certificateNumber}</p>
                </div>
                <div>
                  <span className="text-ink-muted">Hạng năng lực:</span>
                  <p className="font-bold text-primary-600">Hạng {org.certificateGrade}</p>
                </div>
                <div>
                  <span className="text-ink-muted">Ngày hết hạn:</span>
                  <p className="font-bold text-ink">{formatDate(org.certificateExpiry)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl border border-border bg-subtle/30 text-ink-muted flex items-center gap-2">
              <span className="italic">Cơ quan hành chính nhà nước / Chủ đầu tư đặc thù (Không thuộc diện cấp CCHN)</span>
            </div>
          )}

          {/* Danh sách Dự án Đang Triển khai tại Tỉnh Điện Biên */}
          <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="font-bold text-ink flex items-center gap-1.5">
                <Briefcase size={15} className="text-primary-600" />
                <span>Dự án Đang Triển khai tại Tỉnh Điện Biên ({orgProjects.length || org.activeProjectsCount})</span>
              </h4>
              <span className="text-3xs text-ink-muted">CSDL Sở Xây dựng Điện Biên</span>
            </div>

            {orgProjects.length > 0 ? (
              <div className="space-y-2">
                {orgProjects.map((p) => {
                  const roleInProj =
                    p.investorId === org.id
                      ? 'Chủ đầu tư / Cơ quan quyết định'
                      : p.contractors.find((c) => c.orgId === org.id)?.role || 'Nhà thầu tham gia';

                  return (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-lg border border-border bg-subtle/40 hover:bg-subtle transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-3xs font-bold text-primary-600 dark:text-primary-400">
                            {p.code}
                          </span>
                          <span className="text-3xs px-1.5 py-0.2 rounded bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold truncate">
                            {roleInProj}
                          </span>
                        </div>
                        <p className="font-semibold text-ink truncate mt-0.5">{p.name}</p>
                        <p className="text-3xs text-ink-muted mt-0.5">
                          Địa điểm: {p.location} • TMĐT: <strong className="text-ink">{formatCurrency(p.totalInvestment)}</strong>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <StatusBadge status={p.slaStatus} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-ink-secondary text-2xs italic py-1">
                Đơn vị tham gia {org.activeProjectsCount} công trình khác nhau trên địa bàn theo phân công của UBND tỉnh và các ban ngành.
              </p>
            )}
          </div>

          {/* Đội ngũ Kỹ sư & Chuyên gia thuộc Đơn vị */}
          {orgPersonnel.length > 0 && (
            <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h4 className="font-bold text-ink flex items-center gap-1.5">
                  <Users size={15} className="text-primary-600" />
                  <span>Đội ngũ Chuyên gia & Kỹ sư Chủ chốt ({orgPersonnel.length})</span>
                </h4>
                <span className="text-3xs text-ink-muted">Có CCHN hợp lệ</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {orgPersonnel.map((person) => (
                  <div key={person.id} className="p-2.5 rounded-lg border border-border bg-subtle/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-ink">{person.fullName}</span>
                      <span className="text-3xs font-mono font-bold px-1.5 py-0.2 rounded bg-primary-500/10 text-primary-600">
                        Hạng {person.certGrade}
                      </span>
                    </div>
                    <p className="text-3xs font-mono text-ink-muted">{person.certNumber}</p>
                    <p className="text-3xs text-ink-secondary truncate">
                      {person.specialties.join(' • ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
      storageKey: `slidepanel-org-${org.id}`,
    });
  };

  const columns: Column<Organization>[] = [
    {
      header: 'Mã & Tên Tổ chức',
      accessor: (org) => (
        <div className="flex flex-col py-0.5">
          <span className="font-bold text-ink hover:text-primary-600 transition-colors line-clamp-1">
            {org.name}
          </span>
          <span className="text-3xs font-mono text-primary-600 dark:text-primary-400 mt-0.5">
            {org.code} • MST: {org.taxCode}
          </span>
        </div>
      ),
      width: '34%',
    },
    {
      header: 'Phân loại',
      accessor: (org) => {
        const typeMap: Record<string, { label: string; cls: string }> = {
          investor: { label: 'Chủ đầu tư / Ban QLDA', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
          consultant_design: { label: 'Tư vấn Thiết kế', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
          consultant_audit: { label: 'Tư vấn Thẩm tra', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' },
          contractor: { label: 'Nhà thầu Thi công', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
          supervisor: { label: 'Tư vấn Giám sát', cls: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
        };
        const conf = typeMap[org.type] || { label: 'Khác', cls: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
        return <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${conf.cls}`}>{conf.label}</span>;
      },
      width: '18%',
    },
    {
      header: 'Chứng chỉ Năng lực',
      accessor: (org) =>
        org.certificateNumber ? (
          <div className="flex flex-col text-2xs">
            <span className="font-mono font-bold text-ink">{org.certificateNumber}</span>
            <span className="text-3xs text-ink-muted">Hạng {org.certificateGrade} (Hạn: {formatDate(org.certificateExpiry)})</span>
          </div>
        ) : (
          <span className="text-ink-muted italic">Cơ quan Nhà nước</span>
        ),
      width: '20%',
    },
    {
      header: 'Dự án tại Tỉnh',
      accessor: (org) => (
        <span className="font-mono font-bold text-primary-600 block text-center">
          {org.activeProjectsCount} DA
        </span>
      ),
      className: 'text-center',
      width: '12%',
    },
    {
      header: 'Trạng thái',
      accessor: (org) => (
        <div className="text-center">
          <StatusBadge status={org.status} />
        </div>
      ),
      className: 'text-center',
      width: '16%',
    },
  ];

  return (
    <div className="space-y-4">
      <TableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Tìm kiếm tên đơn vị, MST, đại diện, địa chỉ..."
        resultCount={filteredOrgs.length}
        onResetFilters={() => {
          setSearchQuery('');
          setTypeFilter('all');
          setStatusFilter('all');
        }}
        addNewLabel="Tiếp nhận Tổ chức mới"
        onAddNew={() => {}}
        filters={
          <div className="flex items-center gap-2">
            <div className="w-48">
              <SearchableSelect
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: 'all', label: 'Tất cả Loại hình' },
                  { value: 'investor', label: 'Chủ đầu tư / Ban QLDA' },
                  { value: 'consultant_design', label: 'Tư vấn Thiết kế' },
                  { value: 'consultant_audit', label: 'Tư vấn Thẩm tra' },
                  { value: 'contractor', label: 'Nhà thầu Thi công' },
                  { value: 'supervisor', label: 'Tư vấn Giám sát' },
                ]}
              />
            </div>

            <div className="w-40">
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'Tất cả Trạng thái' },
                  { value: 'hieu_luc', label: 'Còn hiệu lực' },
                  { value: 'sap_het_han', label: 'Sắp hết hạn (<90d)' },
                  { value: 'het_han', label: 'Đã hết hạn' },
                ]}
              />
            </div>
          </div>
        }
      />

      <MasterTable
        columns={columns}
        data={filteredOrgs}
        onRowClick={handleOpenOrgDetail}
        onView={handleOpenOrgDetail}
        maxHeight="calc(100vh - 250px)"
      />
    </div>
  );
}

