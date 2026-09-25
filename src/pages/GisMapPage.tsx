import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Layers,
  Filter,
  Eye,
  Building2,
  Sparkles,
  Navigation,
  Key,
  Search,
  CheckCircle2,
  Compass,
  SlidersHorizontal,
  ChevronRight,
  Shield,
  Map as MapIcon,
  Maximize2,
  Share2,
} from 'lucide-react';
import { MOCK_PROJECTS, type Project } from '../data/mockData';
import { formatCurrency } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Tooltip } from '../components/ui/Tooltip';
import { useSlidePanel } from '../context/SlidePanelContext';
import { useTheme } from '../context/ThemeContext';
import { ProjectDetailSlidePanel } from './projects/ProjectDetailSlidePanel';
import { GoogleMapViewer, type GoogleMapType } from '../components/gis/GoogleMapViewer';
import { GoogleApiKeyModal } from '../components/gis/GoogleApiKeyModal';
import { getStoredGoogleMapsApiKey } from '../lib/googleMapsLoader';
import { getProjectCoordinates } from '../lib/gisData';

export function GisMapPage() {
  const { openPanel } = useSlidePanel();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [selectedProject, setSelectedProject] = useState<Project>(MOCK_PROJECTS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Project['slaStatus']>('all');
  const [mapType, setMapType] = useState<GoogleMapType>('hybrid');
  const [showBoundary, setShowBoundary] = useState(true);
  const [showZoning, setShowZoning] = useState(true);
  const [showTraffic, setShowTraffic] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => getStoredGoogleMapsApiKey());
  const [activeTab, setActiveTab] = useState<'detail' | 'list'>('detail');

  // Lọc danh sách dự án
  const filteredProjects = useMemo(() => {
    return MOCK_PROJECTS.filter((p) => {
      const matchSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.investorName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'all' || p.slaStatus === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [searchQuery, statusFilter]);

  const handleOpenDetail = (project: Project) => {
    openPanel({
      id: `project-${project.id}`,
      title: project.name,
      subtitle: `Mã: ${project.code} • ${project.investorName}`,
      tabTitle: project.code,
      component: <ProjectDetailSlidePanel project={project} />,
      storageKey: `slidepanel-project-${project.id}`,
    });
  };

  const selectedCoords = getProjectCoordinates(selectedProject.id, selectedProject.location);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-3">
      {/* ─── THANH CÔNG CỤ ĐIỀU HƯỚNG BẢN ĐỒ GOOGLE MAPS TRÊN CÙNG ─── */}
      <div className="p-3 rounded-2xl border border-border bg-surface shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Tiêu đề & Thông tin bản đồ */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center border border-primary-500/20">
            <MapPin size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-ink">Bản đồ Không gian Xây dựng & Quy hoạch Tỉnh Điện Biên</h2>
              <span className="px-2 py-0.5 rounded-full text-3xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {apiKey ? 'Google Maps API' : 'Google Maps Vệ tinh thực'}
              </span>
            </div>
            <p className="text-3xs text-ink-muted mt-0.5">
              Tọa độ VN-2000 • Tích hợp Google Maps vệ tinh, địa hình Tây Bắc và {MOCK_PROJECTS.length} dự án thẩm định
            </p>
          </div>
        </div>

        {/* Các nút chuyển đổi Map Type Google Maps & Lớp bản đồ */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Lựa chọn loại bản đồ Google */}
          <div className="flex items-center p-1 rounded-xl bg-subtle border border-border">
            <Tooltip content="Bản đồ Vệ tinh kết hợp nhãn đường Google Maps" placement="bottom">
              <button
                type="button"
                onClick={() => setMapType('hybrid')}
                className={`px-2.5 py-1 rounded-lg text-3xs font-semibold transition-all cursor-pointer ${
                  mapType === 'hybrid'
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Vệ tinh (Hybrid)
              </button>
            </Tooltip>

            <Tooltip content="Bản đồ Giao thông đường bộ Google Maps" placement="bottom">
              <button
                type="button"
                onClick={() => setMapType('roadmap')}
                className={`px-2.5 py-1 rounded-lg text-3xs font-semibold transition-all cursor-pointer ${
                  mapType === 'roadmap'
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Đường phố
              </button>
            </Tooltip>

            <Tooltip content="Bản đồ Địa hình đồi núi 3D Google Maps" placement="bottom">
              <button
                type="button"
                onClick={() => setMapType('terrain')}
                className={`px-2.5 py-1 rounded-lg text-3xs font-semibold transition-all cursor-pointer ${
                  mapType === 'terrain'
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Địa hình 3D
              </button>
            </Tooltip>

            <Tooltip content="Ảnh vệ tinh nguyên bản Google Maps" placement="bottom">
              <button
                type="button"
                onClick={() => setMapType('satellite')}
                className={`px-2.5 py-1 rounded-lg text-3xs font-semibold transition-all cursor-pointer ${
                  mapType === 'satellite'
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Vệ tinh thuần
              </button>
            </Tooltip>
          </div>

          {/* Bật/Tắt Lớp bản đồ chuyên đề */}
          <div className="flex items-center gap-1.5">
            <Tooltip content="Bật/Tắt ranh giới hành chính Tỉnh Điện Biên" placement="bottom">
              <button
                type="button"
                onClick={() => setShowBoundary(!showBoundary)}
                className={`px-2.5 py-1.5 rounded-xl border text-3xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  showBoundary
                    ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                    : 'border-border bg-subtle text-ink-muted hover:text-ink'
                }`}
              >
                <Shield size={12} />
                <span>Ranh giới Tỉnh</span>
              </button>
            </Tooltip>

            <Tooltip content="Bật/Tắt các phân khu quy hoạch xây dựng 1/500 & công nghiệp" placement="bottom">
              <button
                type="button"
                onClick={() => setShowZoning(!showZoning)}
                className={`px-2.5 py-1.5 rounded-xl border text-3xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  showZoning
                    ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                    : 'border-border bg-subtle text-ink-muted hover:text-ink'
                }`}
              >
                <Layers size={12} />
                <span>Vùng QH 1/500</span>
              </button>
            </Tooltip>

            {apiKey && (
              <Tooltip content="Bật/Tắt hiển thị lưu lượng giao thông trực tiếp" placement="bottom">
                <button
                  type="button"
                  onClick={() => setShowTraffic(!showTraffic)}
                  className={`px-2.5 py-1.5 rounded-xl border text-3xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    showTraffic
                      ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-border bg-subtle text-ink-muted hover:text-ink'
                  }`}
                >
                  <Navigation size={12} />
                  <span>Giao thông</span>
                </button>
              </Tooltip>
            )}

            {/* Nút Cấu hình Google Maps API Key */}
            <Tooltip content="Cấu hình Google Maps JavaScript API Key" placement="bottom">
              <button
                type="button"
                onClick={() => setIsApiKeyModalOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-border bg-subtle hover:bg-surface text-ink text-3xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Key size={13} className={apiKey ? 'text-emerald-500' : 'text-amber-500'} />
                <span>{apiKey ? 'API Key: Đã kết nối' : 'Cấu hình API Key'}</span>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ─── NỘI DUNG CHÍNH: BẢN ĐỒ GOOGLE MAPS + SIDEBAR THÔNG TIN DỰ ÁN ─── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* ─── KHUNG BẢN ĐỒ GOOGLE MAPS ─── */}
        <div className="flex-1 rounded-2xl border border-border shadow-card relative overflow-hidden flex flex-col bg-slate-950">
          <GoogleMapViewer
            projects={filteredProjects}
            selectedProject={selectedProject}
            onSelectProject={setSelectedProject}
            onOpenDetail={handleOpenDetail}
            apiKey={apiKey}
            mapType={mapType}
            showBoundary={showBoundary}
            showZoning={showZoning}
            showTraffic={showTraffic}
            isDark={isDark}
            className="w-full h-full"
          />

          {/* Chú thích trạng thái ghim nổi góc trên bên trái */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md text-white text-3xs shadow-lg">
            <span className="font-bold text-slate-300 pr-1 border-r border-slate-700">Trạng thái:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Đang thẩm định
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Đã có kết quả
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Quá hạn SLA
            </span>
          </div>
        </div>

        {/* ─── SIDEBAR THÔNG TIN DỰ ÁN & DANH SÁCH ─── */}
        <div className="w-full lg:w-96 rounded-2xl border border-border bg-surface p-4 shadow-card flex flex-col justify-between shrink-0 space-y-3 overflow-hidden">
          {/* Tabs chuyển đổi giữa Chi tiết điểm ghim & Danh sách dự án */}
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-subtle border border-border">
              <button
                type="button"
                onClick={() => setActiveTab('detail')}
                className={`px-3 py-1 rounded-md text-3xs font-bold transition-all cursor-pointer ${
                  activeTab === 'detail'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Chi tiết Điểm ghim
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`px-3 py-1 rounded-md text-3xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'list'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span>Dự án trên Bản đồ</span>
                <span className="px-1.5 py-0.2 rounded-full text-3xs bg-primary-500/10 text-primary-600">
                  {filteredProjects.length}
                </span>
              </button>
            </div>

            <StatusBadge status={selectedProject.slaStatus} />
          </div>

          {/* Ô Tìm kiếm nhanh dự án trên bản đồ */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="Tìm dự án theo tên, mã, địa bàn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-subtle text-ink text-2xs focus:outline-hidden focus:ring-1 focus:ring-primary-500 transition-all"
            />
          </div>

          {/* Tab 1: Chi tiết dự án đang chọn */}
          {activeTab === 'detail' && (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div>
                <span className="text-3xs font-mono text-primary-600 dark:text-primary-400 font-bold">
                  {selectedProject.code}
                </span>
                <h3 className="text-xs font-bold text-ink mt-0.5 leading-snug">
                  {selectedProject.name}
                </h3>
              </div>

              {/* Tọa độ GPS & Chỉ giới quy hoạch */}
              <div className="p-2.5 rounded-xl bg-primary-50/70 dark:bg-primary-950/30 border border-primary-200/80 dark:border-primary-900/60 text-3xs flex items-center justify-between text-primary-900 dark:text-primary-200">
                <div className="flex items-center gap-2">
                  <Navigation size={13} className="text-primary-600 dark:text-primary-400 shrink-0" />
                  <span className="font-mono font-semibold">
                    {selectedCoords.lat.toFixed(4)}°N, {selectedCoords.lng.toFixed(4)}°E
                  </span>
                </div>
                <span className="text-3xs text-primary-600 dark:text-primary-400 font-medium">Hệ VN-2000</span>
              </div>

              {/* Card thông số chi tiết */}
              <div className="p-3 rounded-xl bg-subtle space-y-2 text-2xs text-ink">
                <div>
                  <span className="text-ink-muted text-3xs">Chủ đầu tư:</span>
                  <p className="font-semibold text-ink leading-tight mt-0.5">{selectedProject.investorName}</p>
                </div>
                <div>
                  <span className="text-ink-muted text-3xs">Địa điểm xây dựng:</span>
                  <p className="font-semibold text-ink leading-tight mt-0.5">{selectedProject.location}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
                  <div>
                    <span className="text-ink-muted text-3xs">Tổng mức đầu tư:</span>
                    <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {formatCurrency(selectedProject.totalInvestment)}
                    </p>
                  </div>
                  <div>
                    <span className="text-ink-muted text-3xs">Nhóm / Cấp:</span>
                    <p className="font-semibold text-ink mt-0.5">
                      Nhóm {selectedProject.projectGroup} • Cấp {selectedProject.buildingGrade}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
                  <div>
                    <span className="text-ink-muted text-3xs">Chuyên viên thụ lý:</span>
                    <p className="font-semibold text-ink mt-0.5">{selectedProject.assignee}</p>
                  </div>
                  <div>
                    <span className="text-ink-muted text-3xs">Phòng chuyên môn:</span>
                    <p className="font-semibold text-ink mt-0.5">{selectedProject.department}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Danh sách tất cả dự án trên bản đồ */}
          {activeTab === 'list' && (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredProjects.map((p) => {
                const isSelected = selectedProject.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProject(p)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/40 shadow-xs'
                        : 'border-border bg-subtle hover:bg-surface'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-3xs font-mono font-bold text-primary-600 dark:text-primary-400">
                          {p.code}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            p.slaStatus === 'dang_tham_dinh'
                              ? 'bg-amber-500'
                              : p.slaStatus === 'da_tham_dinh'
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                          }`}
                        />
                      </div>
                      <h4 className="text-2xs font-semibold text-ink truncate mt-0.5">{p.name}</h4>
                      <p className="text-3xs text-ink-muted truncate">{p.location}</p>
                    </div>
                    <ChevronRight size={14} className="text-ink-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Nút Mở Hồ sơ Thẩm định Toàn diện */}
          <div className="pt-2 border-t border-border space-y-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenDetail(selectedProject)}
              className="w-full py-2.5 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Eye size={15} />
              <span>Mở Hồ sơ Thẩm định Chi tiết</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── MODAL CẤU HÌNH GOOGLE MAPS API KEY ─── */}
      <GoogleApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onKeyUpdated={(newKey) => setApiKey(newKey)}
      />
    </div>
  );
}
