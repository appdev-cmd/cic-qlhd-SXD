import React, { useState, useMemo,useEffect } from 'react';
import {
  LayoutGrid,
  List,
  Camera,
  MapPin,
  Building,
  Calendar,
  ArrowRight,
  Eye,
  Sparkles,
  TrendingDown,
  Coins,
  Plus,
} from 'lucide-react';
import { MasterTable, type Column } from '../components/MasterTable';
import { GridToolbar, GridSearchInput, GridCount } from '../components/ui/grid/GridToolbar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Tooltip } from '../components/ui/Tooltip';
import type { Project } from '../types/project';
import {projectService} from '../services/projectService';
import {useFilterState} from '../hooks/useFilterState';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { useSlidePanel } from '../context/SlidePanelContext';
import { ProjectDetailSlidePanel } from './projects/ProjectDetailSlidePanel';
import { matchesSmartSearch } from '../lib/smartSearch';
import {useAuth} from '../context/AuthContext';
import {CreateProjectModal} from '../components/appraisal/CreateProjectModal';
import {EntityLink} from '../components/ui/EntityLink';

export function ProjectsPage() {
  const {mode,profile}=useAuth();const [createOpen,setCreateOpen]=useState(false);const [version,setVersion]=useState(0);
  const { openPanel } = useSlidePanel();
  const [filters,setFilters]=useFilterState('projects-filters-v2',{search:'',group:'all',status:'all',stage:'all'});
  const [sorting,setSorting]=useFilterState('projects-sort-v1',{key:'submissionDate',direction:'desc'});
  const searchQuery=filters.search,groupFilter=filters.group,slaFilter=filters.status,stageFilter=filters.stage;
  const setSearchQuery=(search:string)=>setFilters({...filters,search});
  const setGroupFilter=(group:string)=>setFilters({...filters,group});
  const setSlaFilter=(status:string)=>setFilters({...filters,status});
  const setStageFilter=(stage:string)=>setFilters({...filters,stage});
  const [viewMode,setViewMode]=useState<'table'|'cards'>('table');
  const [filteredProjects,setProjects]=useState<Project[]>([]);
  const [total,setTotal]=useState(0);const [page,setPage]=useState(0);const [error,setError]=useState('');
  useEffect(()=>{const refresh=()=>setVersion(v=>v+1);window.addEventListener('appraisal:changed',refresh);return()=>window.removeEventListener('appraisal:changed',refresh);},[]);
  useEffect(()=>setPage(0),[JSON.stringify(filters),JSON.stringify(sorting)]);
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{
    projectService.list({...filters,sort:sorting.key,direction:sorting.direction,offset:page*50,limit:50}).then(result=>{if(active){setProjects(result.items);setTotal(result.total);setError('');}}).catch(e=>{if(active)setError(e.message);});
  },180);return()=>{active=false;clearTimeout(timer);};},[JSON.stringify(filters),JSON.stringify(sorting),page,version]);

  const handleOpenDetail = (project: Project) => {
    openPanel({
      id: `project-${project.id}`,
      title: project.name,
      subtitle: `Mã: ${project.code} • ${project.investorName}`,
      tabTitle: project.code,
      icon: <Building size={14} />,
      component: <ProjectDetailSlidePanel project={project} />,
      storageKey: `slidepanel-project-${project.id}`,
    });
  };

  const columns: Column<Project>[] = [
    {
      header: 'Mã & Tên Dự án',
      sortValue:p=>p.name,
      sortKey:'name',
      accessor: (p) => (
        <div className="flex items-center gap-3 py-1">
          {p.coverImage && (
            <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-border/80 bg-slate-950 group/img shadow-xs">
              <img
                src={p.coverImage}
                alt={p.name}
                className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-300"
                loading="lazy"
              />
              {p.images && p.images.length > 0 && (
                <span className="absolute bottom-0 right-0 bg-black/75 backdrop-blur-xs text-white text-[9px] px-1 py-0.2 rounded-tl font-mono flex items-center gap-0.5">
                  <Camera size={8} />
                  {p.images.length}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-ink hover:text-primary-600 transition-colors line-clamp-1">
              <EntityLink type="project" id={p.id} name={p.name} onClick={()=>handleOpenDetail(p)}/>
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 text-3xs font-mono">
              <span className="text-primary-600 dark:text-primary-400 font-bold">{p.code}</span>
              <span className="text-ink-muted">•</span>
              <span className="text-ink-secondary">Nhóm {p.projectGroup} (Cấp {p.buildingGrade})</span>
            </div>
          </div>
        </div>
      ),
      width: '34%',
    },
    {
      header: 'Chủ đầu tư / Ban QLDA',
      sortValue:p=>p.investorName,
      sortKey:'investorName',
      accessor: (p) => (
        <span className="text-ink-secondary dark:text-ink-secondary line-clamp-1">
          {p.investorId?<EntityLink type="organization" id={p.investorId} name={p.investorName}/>:p.investorName}
        </span>
      ),
      width: '20%',
    },
    {
      header: 'Địa bàn (Huyện/Thị)',
      sortValue:p=>p.location,
      sortKey:'location',
      accessor: (p) => <span className="text-ink-secondary truncate">{p.location}</span>,
      width: '13%',
    },
    {
      header: 'Tổng mức đầu tư',
      sortValue:p=>p.totalInvestment??0,
      sortKey:'totalInvestment',
      accessor: (p) => (
        <span className="font-mono font-bold text-ink text-right block">
          {formatCurrency(p.totalInvestment)}
        </span>
      ),
      className: 'text-right',
      width: '13%',
    },
    {
      header: 'Giai đoạn',
      sortValue:p=>p.stage,
      sortKey:'stage',
      accessor: (p) => (
        <div className="text-center">
          <span className="px-2 py-0.5 rounded-md bg-subtle border border-border text-2xs font-semibold text-ink-secondary uppercase">
            {p.stage === 'bcnckt' ? 'BCNCKT' : p.stage === 'gpxd' ? 'Cấp GPXD' : 'Nghiệm thu'}
          </span>
        </div>
      ),
      className: 'text-center',
      width: '8%',
    },
    {
      header: 'Trạng thái SLA',
      sortValue:p=>p.slaStatus,
      sortKey:'slaStatus',
      accessor: (p) => (
        <div className="text-center">
          <StatusBadge status={p.slaStatus} />
        </div>
      ),
      className: 'text-center',
      width: '12%',
    },
  ];

  return (
    <div className="space-y-4">
      {createOpen&&<CreateProjectModal onClose={()=>setCreateOpen(false)} onCreated={p=>{setCreateOpen(false);setVersion(v=>v+1);handleOpenDetail(p);}}/>}
      {error&&<p role="alert" className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-3 text-sm text-ink dark:text-ink"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Trang trước</button><span>Trang {page+1} · {total} dự án</span><button disabled={(page+1)*50>=total} onClick={()=>setPage(p=>p+1)}>Trang sau</button></div>
      {/* ─── THANH CÔNG CỤ LỌC CHUẨN 5 VỊ TRÍ + CHẾ ĐỘ XEM ─── */}
      <GridToolbar
        search={<GridSearchInput value={searchQuery} onChange={setSearchQuery} label="Tìm dự án" placeholder="Tìm theo tên dự án, mã hồ sơ, chủ đầu tư, địa bàn..." />}
        classification={<>
          <div className="w-40"><SearchableSelect value={stageFilter} onChange={setStageFilter} options={[
            { value: 'all', label: 'Tất cả giai đoạn' },
            { value: 'bcnckt', label: 'Thẩm định BCNCKT' },
            { value: 'gpxd', label: 'Cấp giấy phép XD' },
            { value: 'nghiem_thu', label: 'Kiểm tra nghiệm thu' },
          ]} /></div>
          <div className="w-36"><SearchableSelect value={groupFilter} onChange={setGroupFilter} options={[
            { value: 'all', label: 'Tất cả nhóm DA' },
            { value: 'A', label: 'Dự án nhóm A' },
            { value: 'B', label: 'Dự án nhóm B' },
            { value: 'C', label: 'Dự án nhóm C' },
          ]} /></div>
        </>}
        status={<div className="w-40"><SearchableSelect value={slaFilter} onChange={setSlaFilter} options={[
          { value: 'all', label: 'Tất cả trạng thái' },
          { value: 'dang_tham_dinh', label: 'Đang thẩm định' },
          { value: 'yeu_cau_bo_sung', label: 'Yêu cầu bổ sung' },
          { value: 'da_tham_dinh', label: 'Đã có kết quả' },
          { value: 'qua_han', label: 'Quá hạn SLA' },
        ]} /></div>}
        onReset={() => setFilters({search:'',group:'all',status:'all',stage:'all'})}
        count={<GridCount total={total} unit="dự án" />}
        actions={<>
          <div className="flex items-center rounded-lg border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 p-0.5">
            {([['table', 'Chế độ xem bảng chi tiết', List], ['cards', 'Chế độ xem lưới thẻ phối cảnh & hình ảnh', LayoutGrid]] as const).map(([view, label, Icon]) => (
              <Tooltip key={view} content={label} placement="top">
                <button type="button" aria-label={label} aria-pressed={viewMode === view} onClick={() => setViewMode(view)}
                  className={cn('rounded-md p-1.5 transition-all', viewMode === view ? 'bg-surface dark:bg-slate-900 text-ink dark:text-slate-100 shadow-xs' : 'text-ink-muted dark:text-slate-400 hover:text-ink dark:hover:text-slate-100')}>
                  <Icon size={15} />
                </button>
              </Tooltip>
            ))}
          </div>
          {mode==='cloud'&&['admin','officer','head_of_department'].includes(profile?.role||'')&&(
            <button type="button" onClick={()=>setCreateOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 dark:bg-primary-500 dark:text-white dark:hover:bg-primary-600">
              <Plus size={14} /><span>Tiếp nhận dự án</span>
            </button>
          )}
        </>}
      />

      {/* ─── NỘI DUNG THEO CHẾ ĐỘ XEM ─── */}
      {viewMode === 'table' ? (
        <MasterTable
          storageKey="projects-grid"
          serverSort={sorting} onSort={(key,direction)=>setSorting({key,direction})}
          columns={columns}
          data={filteredProjects}
          onRowClick={handleOpenDetail}
          onView={handleOpenDetail}
          maxHeight="calc(100vh - 250px)"
        />
      ) : (
        /* CHẾ ĐỘ XEM LƯỚI THẺ ẢNH PHỐI CẢNH (CARDS VIEW) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((p) => {
            return (
              <div
                key={p.id}
                onClick={() => handleOpenDetail(p)}
                className="group relative rounded-2xl border border-border bg-surface overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col cursor-pointer hover:border-primary-500/40"
              >
                {/* Ảnh bìa phối cảnh nổi bật */}
                <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
                  <img
                    src={p.coverImage || 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1200&q=80'}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 group-hover:opacity-75 transition-opacity" />

                  {/* Header badges trên ảnh */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-3xs font-bold bg-black/60 text-white backdrop-blur-md border border-white/20 shadow-xs">
                      Nhóm {p.projectGroup} • Cấp {p.buildingGrade}
                    </span>
                    <StatusBadge status={p.slaStatus} />
                  </div>

                  {/* Badge số lượng ảnh & Giai đoạn ở chân ảnh */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-2xs">
                    <span className="font-mono text-3xs font-bold px-2 py-0.5 rounded-md bg-primary-600/90 backdrop-blur-xs">
                      {p.code}
                    </span>
                    {p.images && p.images.length > 0 && (
                      <span className="flex items-center gap-1 text-3xs font-medium px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs border border-white/20">
                        <Camera size={11} />
                        <span>{p.images.length} hình ảnh</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Thông tin chi tiết dự án */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                  <div className="space-y-2">
                    <h3 className="font-bold text-sm text-ink group-hover:text-primary-600 transition-colors line-clamp-2 leading-snug">
                      {p.name}
                    </h3>

                    <div className="space-y-1.5 text-2xs text-ink-secondary">
                      <div className="flex items-center gap-1.5">
                        <Building size={13} className="text-ink-muted shrink-0" />
                        <span className="truncate">{p.investorName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-ink-muted shrink-0" />
                        <span className="truncate">{p.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Thư viện ảnh nhỏ xem nhanh (Mini Gallery Preview) */}
                  {p.images && p.images.length > 1 && (
                    <div className="pt-2 border-t border-border/60">
                      <p className="text-3xs text-ink-muted uppercase font-semibold tracking-wider mb-1.5">
                        Hình ảnh tư liệu khảo sát & phối cảnh:
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {p.images.slice(0, 4).map((subImg, sIdx) => (
                          <div
                            key={subImg.id || sIdx}
                            className="aspect-video rounded-md overflow-hidden border border-border bg-slate-900 relative group/sub"
                          >
                            <img
                              src={subImg.thumbnailUrl || subImg.url}
                              alt={subImg.title}
                              className="w-full h-full object-cover group-hover/sub:scale-110 transition-transform duration-200"
                              loading="lazy"
                            />
                            {sIdx === 3 && p.images && p.images.length > 4 && (
                              <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-white text-[10px] font-bold">
                                +{p.images.length - 4}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chỉ số tài chính & Nút hành động */}
                  <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                    <div>
                      <span className="text-3xs uppercase tracking-wider text-ink-muted block">Tổng mức đầu tư</span>
                      <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.totalInvestment)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(p);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-slate-800 text-primary-600 dark:text-primary-400 font-semibold text-2xs group-hover:bg-primary-600 group-hover:text-white transition-all shadow-xs"
                    >
                      <span>Xem hồ sơ</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
