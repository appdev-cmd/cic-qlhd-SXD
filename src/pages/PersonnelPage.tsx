import React, { useState, useMemo } from 'react';
import { MasterTable, type Column } from '../components/MasterTable';
import { TableToolbar } from '../components/TableToolbar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { MOCK_PROJECTS, type Personnel } from '../data/mockData';
import { usePersonnel } from '../hooks/useSupabaseData';
import { formatDate, cn } from '../lib/utils';
import { useSlidePanel } from '../context/SlidePanelContext';
import { matchesSmartSearch } from '../lib/smartSearch';
import { UserCheck, ShieldAlert, Award, ExternalLink, Briefcase, FileBadge2, Database } from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';

export function PersonnelPage() {
  const { openPanel } = useSlidePanel();
  const { personnel, isLiveDb } = usePersonnel();
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredPersonnel = useMemo(() => {
    return personnel.filter((p) => {
      const matchSearch =
        matchesSmartSearch(p.fullName, searchQuery) ||
        matchesSmartSearch(p.certNumber, searchQuery) ||
        matchesSmartSearch(p.idCard, searchQuery) ||
        matchesSmartSearch(p.orgName, searchQuery) ||
        p.specialties.some((s) => matchesSmartSearch(s, searchQuery));

      const matchGrade = gradeFilter === 'all' || p.certGrade === gradeFilter;
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;

      return matchSearch && matchGrade && matchStatus;
    });
  }, [searchQuery, gradeFilter, statusFilter]);

  const handleOpenDetail = (person: Personnel) => {
    const personProjects = MOCK_PROJECTS.filter(
      (p) => p.contractors.some((c) => c.leadPersonnelId === person.id) || p.assignee.includes(person.fullName)
    );

    openPanel({
      id: `person-${person.id}`,
      title: `${person.fullName} — Chứng chỉ: ${person.certNumber}`,
      subtitle: `${person.orgName} • Hạng ${person.certGrade}`,
      tabTitle: person.fullName.split(' ').slice(-2).join(' '),
      component: (
        <div className="space-y-4 text-xs">
          {/* Cảnh báo nếu có xung đột hoặc quá tải */}
          {person.hasConflictWarning && (
            <div className="p-3.5 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
              <ShieldAlert size={18} className="text-rose-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Cảnh báo Giám sát Hành nghề từ AI:</p>
                <p className="text-2xs mt-0.5">
                  {person.status === 'het_han'
                    ? 'Chứng chỉ hành nghề của cá nhân này ĐÃ HẾT HẠN. Tuyệt đối không được chấp thuận ký duyệt hồ sơ thẩm định.'
                    : 'Cá nhân này đang đứng tên Chủ trì cho hơn 5 dự án lớn đồng thời trên địa bàn tỉnh. Cần rà soát kỹ năng lực thực hiện thực tế.'}
                </p>
              </div>
            </div>
          )}

          {/* Thông tin cá nhân */}
          <div className="p-4 rounded-xl border border-border bg-subtle/50 space-y-3">
            <h4 className="font-bold text-ink uppercase tracking-wider text-2xs text-ink-muted">
              Thông tin Nhân thân & Liên hệ
            </h4>
            <div className="grid grid-cols-2 gap-3 text-ink">
              <div>
                <span className="text-ink-muted">Họ và tên:</span>
                <p className="font-bold text-sm text-ink">{person.fullName}</p>
              </div>
              <div>
                <span className="text-ink-muted">Số CCCD / Định danh:</span>
                <p className="font-mono font-semibold">{person.idCard}</p>
              </div>
              <div>
                <span className="text-ink-muted">Số điện thoại:</span>
                <p className="font-semibold">{person.phone}</p>
              </div>
              <div>
                <span className="text-ink-muted">Email:</span>
                <p className="font-semibold text-primary-600">{person.email}</p>
              </div>
              <div className="col-span-2">
                <span className="text-ink-muted">Đơn vị đang công tác:</span>
                <p className="font-bold text-ink">{person.orgName}</p>
              </div>
            </div>
          </div>

          {/* Chi tiết Chứng chỉ Hành nghề */}
          <div className="p-4 rounded-xl border border-primary-500/30 bg-surface space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-ink flex items-center gap-1.5">
                <Award size={16} className="text-primary-500" />
                <span>Chi tiết Chứng chỉ Hành nghề Xây dựng</span>
              </h4>
              <Tooltip content="Tra cứu CSDL Bộ Xây dựng trực tiếp" placement="left">
                <button
                  type="button"
                  onClick={() => alert(`Đang kết nối API CSDL Quốc gia Bộ Xây dựng để xác thực số chứng chỉ ${person.certNumber}...`)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary-500 text-white text-2xs font-semibold shadow-xs hover:bg-primary-600 transition-colors"
                >
                  <ExternalLink size={12} />
                  <span>Xác thực CSDL BXD</span>
                </button>
              </Tooltip>
            </div>

            <div className="grid grid-cols-2 gap-2 text-ink">
              <div>
                <span className="text-ink-muted">Số chứng chỉ:</span>
                <p className="font-mono font-bold text-primary-600 text-sm">{person.certNumber}</p>
              </div>
              <div>
                <span className="text-ink-muted">Hạng chứng chỉ:</span>
                <p className="font-bold text-ink">Hạng {person.certGrade}</p>
              </div>
              <div>
                <span className="text-ink-muted">Cơ quan cấp:</span>
                <p className="font-medium text-ink">{person.certIssuer}</p>
              </div>
              <div>
                <span className="text-ink-muted">Ngày hết hạn:</span>
                <p className="font-bold text-ink">{formatDate(person.certExpiry)}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <span className="text-ink-muted">Lĩnh vực chuyên môn được phép hành nghề:</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {person.specialties.map((s, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-subtle border border-border text-2xs font-medium text-ink"
                  >
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Các dự án đang đảm nhiệm tại tỉnh */}
          <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="font-bold text-ink flex items-center gap-1.5">
                <Briefcase size={15} className="text-primary-600" />
                <span>Dự án Đang Phụ trách tại Tỉnh Điện Biên ({personProjects.length || person.activeProjectsCount})</span>
              </h4>
              <span className="text-3xs text-ink-muted">CSDL Sở Xây dựng Điện Biên</span>
            </div>

            {personProjects.length > 0 ? (
              <div className="space-y-2">
                {personProjects.map((p) => {
                  const myRole =
                    p.contractors.find((c) => c.leadPersonnelId === person.id)?.role ||
                    (p.assignee.includes(person.fullName) ? 'Chuyên viên thụ lý SXD' : 'Chủ nhiệm / Chủ trì');

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
                            {myRole}
                          </span>
                        </div>
                        <p className="font-semibold text-ink truncate mt-0.5">{p.name}</p>
                        <p className="text-3xs text-ink-muted mt-0.5">
                          Địa điểm: {p.location} • Hạn thẩm định: {formatDate(p.deadlineDate)}
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
              <p className="text-2xs text-ink-muted italic py-1">
                Cá nhân đang đứng tên cho {person.activeProjectsCount} dự án trên địa bàn toàn tỉnh. Hệ thống AI tự động đối soát tránh đứng tên vượt quá năng lực hoặc ký khống.
              </p>
            )}
          </div>
        </div>
      ),
      storageKey: `slidepanel-person-${person.id}`,
    });
  };

  const columns: Column<Personnel>[] = [
    {
      header: 'Họ tên & Đơn vị Công tác',
      accessor: (p) => (
        <div className="flex items-center gap-2.5 py-0.5">
          <div className="w-8 h-8 rounded-full bg-primary-500/10 border border-primary-500/30 flex items-center justify-center font-bold text-xs text-primary-600 shrink-0">
            {p.fullName.split(' ').slice(-1)[0][0]}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-ink hover:text-primary-600 transition-colors truncate">
                {p.fullName}
              </span>
              {p.hasConflictWarning && (
                <Tooltip content="Cảnh báo: Quá tải dự án hoặc chứng chỉ hết hạn" placement="top">
                  <ShieldAlert size={14} className="text-rose-500 shrink-0" />
                </Tooltip>
              )}
            </div>
            <span className="text-3xs text-ink-muted truncate">{p.orgName}</span>
          </div>
        </div>
      ),
      width: '32%',
    },
    {
      header: 'Số Chứng chỉ Hành nghề',
      accessor: (p) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-primary-600 dark:text-primary-400">{p.certNumber}</span>
          <span className="text-3xs text-ink-muted truncate">{p.certIssuer}</span>
        </div>
      ),
      width: '20%',
    },
    {
      header: 'Lĩnh vực Chuyên môn',
      accessor: (p) => (
        <div className="flex flex-wrap gap-1 max-w-[240px]">
          {p.specialties.map((s, idx) => (
            <span key={idx} className="px-1.5 py-0.5 rounded bg-subtle text-3xs text-ink-secondary truncate">
              {s}
            </span>
          ))}
        </div>
      ),
      width: '24%',
    },
    {
      header: 'Hạng CCHN',
      accessor: (p) => (
        <div className="text-center">
          <span
            className={cn(
              'px-2 py-0.5 rounded text-2xs font-bold font-mono',
              p.certGrade === 'I'
                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                : p.certGrade === 'II'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
            )}
          >
            Hạng {p.certGrade}
          </span>
        </div>
      ),
      className: 'text-center',
      width: '10%',
    },
    {
      header: 'Dự án tại ĐB',
      accessor: (p) => (
        <span className="font-mono font-bold text-ink block text-center">
          {p.activeProjectsCount}
        </span>
      ),
      className: 'text-center',
      width: '8%',
    },
    {
      header: 'Tình trạng',
      accessor: (p) => (
        <div className="text-center">
          <StatusBadge status={p.status} />
        </div>
      ),
      className: 'text-center',
      width: '12%',
    },
  ];

  return (
    <div className="space-y-4">
      <TableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Tìm kỹ sư, kiến trúc sư, số CCHN, CCCD, chuyên môn..."
        resultCount={filteredPersonnel.length}
        onResetFilters={() => {
          setSearchQuery('');
          setGradeFilter('all');
          setStatusFilter('all');
        }}
        addNewLabel="Tiếp nhận Chuyên gia mới"
        onAddNew={() => {}}
        filters={
          <>
            <div className="w-36">
              <SearchableSelect
                value={gradeFilter}
                onChange={setGradeFilter}
                options={[
                  { value: 'all', label: 'Tất cả Hạng CCHN' },
                  { value: 'I', label: 'Hạng I (Bộ XD cấp)' },
                  { value: 'II', label: 'Hạng II (Sở XD cấp)' },
                  { value: 'III', label: 'Hạng III' },
                ]}
              />
            </div>

            <div className="w-40">
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'Tất cả Tình trạng' },
                  { value: 'hieu_luc', label: 'Còn hiệu lực' },
                  { value: 'sap_het_han', label: 'Sắp hết hạn (<90d)' },
                  { value: 'het_han', label: 'Đã hết hạn' },
                ]}
              />
            </div>
          </>
        }
      />

      <MasterTable
        columns={columns}
        data={filteredPersonnel}
        onRowClick={handleOpenDetail}
        onView={handleOpenDetail}
        maxHeight="calc(100vh - 250px)"
      />
    </div>
  );
}
