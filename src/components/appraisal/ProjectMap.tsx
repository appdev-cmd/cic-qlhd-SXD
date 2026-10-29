import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Compass,
  Eye,
  ExternalLink,
  Layers,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Mountain,
  Pickaxe,
  Plane,
  Ruler,
} from 'lucide-react';
import { projectService } from '../../services/projectService';
import type { Project } from '../../types/project';
import { PageHeader } from '../ui/PageHeader';
import { Tooltip } from '../ui/Tooltip';
import { EntityLink } from '../ui/EntityLink';
import { SearchableSelect } from '../ui/SearchableSelect';
import { DateInput } from '../ui/DateInput';
import { StatusBadge } from '../ui/StatusBadge';
import { GridCount, GridSearchInput, GridToolbar } from '../ui/grid/GridToolbar';
import { MasterTable, type Column } from '../MasterTable';
import { useFilterState } from '../../hooks/useFilterState';
import { useEntityPanel } from '../../hooks/useEntityPanel';
import { formatCurrency, formatDate, formatNumber } from '../../lib/utils';
import { matchesSmartSearch } from '../../lib/smartSearch';
import { getProjectTT39Data } from '../../data/mockData';
import {
  DIEN_BIEN_AIRPORT_COORD,
  DIEN_BIEN_CENTER_COORD,
  DIEN_BIEN_DISTRICTS,
  DIEN_BIEN_LINES,
  DIEN_BIEN_MATERIAL_MINES,
  DIEN_BIEN_PLANNING_ZONES,
  haversineDistanceKm,
  matchDienBienDistrict,
  matchPlanningZone,
  wgs84ToVn2000DienBien,
  type MaterialMine,
} from '../../data/dienBienGisData';

type MapStyleMode = 'roadmap' | 'satellite' | 'esri';
type StageKey = 'all' | 'bcnckt' | 'gpxd' | 'hau_kiem';

interface StageConfig {
  key: Exclude<StageKey, 'all'>;
  label: string;
  shortLabel: string;
  hex: string;
}

const STAGE_CONFIGS: Record<Exclude<StageKey, 'all'>, StageConfig> = {
  bcnckt: {
    key: 'bcnckt',
    label: 'Thẩm định BCNCKT (Mục II)',
    shortLabel: 'Thẩm định BCNCKT',
    hex: '#0284c7',
  },
  gpxd: {
    key: 'gpxd',
    label: 'Cấp Giấy phép XD (Mục III)',
    shortLabel: 'Cấp phép GPXD',
    hex: '#f59e0b',
  },
  hau_kiem: {
    key: 'hau_kiem',
    label: 'Hậu kiểm & Nghiệm thu (Mục IV)',
    shortLabel: 'Hậu kiểm & NT',
    hex: '#10b981',
  },
};

function getProjectStageKey(project: Project): Exclude<StageKey, 'all'> {
  if (project.stage === 'nghiem_thu' || project.stage === 'hoan_thanh') return 'hau_kiem';
  if (project.stage === 'gpxd') return 'gpxd';
  return 'bcnckt';
}

function getProjectProgress(project: Project): number {
  if (project.stage === 'hoan_thanh' || project.slaStatus === 'da_tham_dinh') return 100;
  if (project.slaStatus === 'dang_tham_dinh') return 68;
  if (project.slaStatus === 'yeu_cau_bo_sung') return 52;
  if (project.slaStatus === 'qua_han') return 85;
  return 35;
}

function getComplianceBadgeInfo(project: Project) {
  if (project.planningCompliance && project.standardCompliance) {
    return {
      label: 'Phù hợp QH',
      tone: 'success' as const,
      hex: '#10b981',
    };
  }
  if (!project.planningCompliance) {
    return {
      label: 'Cần rà soát QH',
      tone: 'warning' as const,
      hex: '#f59e0b',
    };
  }
  return {
    label: 'Rà soát QCVN',
    tone: 'info' as const,
    hex: '#0284c7',
  };
}

const INITIAL_FILTERS = {
  search: '',
  stage: 'all',
  districtId: 'all',
  investor: 'all',
  compliance: 'all',
  fromDate: '',
  toDate: '',
};

function createMapStyle(mode: MapStyleMode, enable3D: boolean): maplibregl.StyleSpecification {
  const sources: Record<string, maplibregl.SourceSpecification> = {};
  const layers: maplibregl.LayerSpecification[] = [];

  if (mode === 'satellite') {
    sources['basemap-tiles'] = {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      attribution: '© Google Satellite Hybrid',
      maxzoom: 20,
    };
  } else if (mode === 'esri') {
    sources['basemap-tiles'] = {
      type: 'raster',
      tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, HERE, Garmin, USGS',
      maxzoom: 19,
    };
  } else {
    sources['basemap-tiles'] = {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      attribution: '© Google Maps',
      maxzoom: 20,
    };
  }

  layers.push({
    id: 'basemap-layer',
    type: 'raster',
    source: 'basemap-tiles',
    minzoom: 0,
    maxzoom: 22,
  });

  if (enable3D) {
    sources['terrain-dem'] = {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
    };
  }

  // Lớp GeoJSON Phân vùng Quy hoạch & Hành lang Kiểm soát Xây dựng Điện Biên
  sources['planning-zones'] = {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: DIEN_BIEN_PLANNING_ZONES.map((zone) => ({
        type: 'Feature' as const,
        properties: {
          id: zone.id,
          code: zone.code,
          name: zone.name,
          categoryLabel: zone.categoryLabel,
          decisionNumber: zone.decisionNumber,
          color: zone.color,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...zone.polygon.map(([lat, lng]) => [lng, lat]), [zone.polygon[0][1], zone.polygon[0][0]]]],
        },
      })),
    },
  };

  // Lớp GeoJSON Địa giới khái quát 10 Huyện / Thị / Thành phố Điện Biên
  sources['districts-boundary'] = {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: DIEN_BIEN_DISTRICTS.map((dist) => ({
        type: 'Feature' as const,
        properties: {
          id: dist.id,
          name: dist.name,
          shortName: dist.shortName,
          color: dist.color,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...dist.polygon.map(([lat, lng]) => [lng, lat]), [dist.polygon[0][1], dist.polygon[0][0]]]],
        },
      })),
    },
  };

  // Lớp GeoJSON Trục Quốc lộ & Sông chính
  sources['gis-lines'] = {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: DIEN_BIEN_LINES.map((line) => ({
        type: 'Feature' as const,
        properties: {
          id: line.id,
          code: line.code,
          name: line.name,
          kind: line.kind,
          color: line.color,
          weight: line.weight,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: line.coordinates.map(([lat, lng]) => [lng, lat]),
        },
      })),
    },
  };

  layers.push(
    {
      id: 'districts-outline',
      type: 'line',
      source: 'districts-boundary',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1.5,
        'line-dasharray': [4, 3],
        'line-opacity': 0.55,
      },
    },
    {
      id: 'planning-zones-fill',
      type: 'fill',
      source: 'planning-zones',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.16,
      },
    },
    {
      id: 'planning-zones-outline',
      type: 'line',
      source: 'planning-zones',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2.2,
        'line-dasharray': [3, 2],
        'line-opacity': 0.9,
      },
    },
    {
      id: 'gis-lines-layer',
      type: 'line',
      source: 'gis-lines',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'weight'],
        'line-opacity': 0.78,
      },
    },
  );

  return {
    version: 8,
    sources,
    layers,
    ...(enable3D ? { terrain: { source: 'terrain-dem', exaggeration: 1.5 } } : {}),
  };
}

export function ProjectMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: maplibregl.Marker; popup: maplibregl.Popup }>>(new Map());
  const mineMarkersRef = useRef<maplibregl.Marker[]>([]);

  const { open: openEntity } = useEntityPanel();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Toggles đồng bộ theo dự án qlda-ddcn-ht-selfhost
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('roadmap');
  const [is3D, setIs3D] = useState<boolean>(false);
  const [showProjects, setShowProjects] = useState<boolean>(true);
  const [showMines, setShowMines] = useState<boolean>(true);
  const [showPlanning, setShowPlanning] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>([]);

  const [filters, setFilters] = useFilterState('sxd-gis-map-filters-v3', INITIAL_FILTERS);
  const updateFilters = useCallback(
    (patch: Partial<typeof INITIAL_FILTERS>) => {
      setFilters((prev) => ({ ...prev, ...patch }));
    },
    [setFilters],
  );
  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, [setFilters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    projectService
      .list({ limit: 50, offset: 0 })
      .then((res) => {
        if (!active) return;
        const rows = res.items || [];
        setProjects(rows);
        if (rows.length > 0 && !selectedProjectId) {
          const firstWithCoords = rows.find((p: Project) => p.lat != null && p.lng != null);
          setSelectedProjectId(firstWithCoords ? firstWithCoords.id : rows[0].id);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Danh sách Chủ đầu tư cho SearchableSelect
  const investorOptions = useMemo(() => {
    const uniq = Array.from(new Set(projects.map((p) => p.investorName).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'vi'),
    );
    return [{ value: 'all', label: 'Tất cả Chủ đầu tư' }, ...uniq.map((inv) => ({ value: inv, label: inv }))];
  }, [projects]);

  // Danh sách Giai đoạn & Địa bàn Huyện/Thị/Thành phố
  const classificationOptions = useMemo(
    () => [
      { value: 'all', label: 'Tất cả giai đoạn (BCNCKT / GPXD / Hậu kiểm)' },
      { value: 'bcnckt', label: 'Mục II — Thẩm định BCNCKT / TKCS' },
      { value: 'gpxd', label: 'Mục III — Cấp Giấy phép xây dựng (GPXD)' },
      { value: 'hau_kiem', label: 'Mục IV — Hậu kiểm & Nghiệm thu hoàn thành' },
    ],
    [],
  );

  const districtOptions = useMemo(
    () => [
      { value: 'all', label: 'Toàn tỉnh Điện Biên (10 Huyện/Thị/TP)' },
      ...DIEN_BIEN_DISTRICTS.map((d) => ({
        value: d.id,
        label: `${d.name} (${d.urbanGrade.split('(')[0].trim()})`,
      })),
    ],
    [],
  );

  const complianceOptions = useMemo(
    () => [
      { value: 'all', label: 'Mọi trạng thái Quy hoạch' },
      { value: 'compliant', label: 'Phù hợp Quy hoạch chung / phân khu' },
      { value: 'review_needed', label: 'Cần rà soát chỉ tiêu QCVN 01 / Tĩnh không' },
    ],
    [],
  );

  // Lọc danh sách Dự án
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (
        filters.search &&
        !matchesSmartSearch(
          `${project.name} ${project.code} ${project.location} ${project.investorName} ${project.field || ''}`,
          filters.search,
        )
      ) {
        return false;
      }
      if (filters.stage !== 'all' && getProjectStageKey(project) !== filters.stage) {
        return false;
      }
      if (filters.districtId !== 'all') {
        const matchedDist = matchDienBienDistrict(project.location);
        if (!matchedDist || matchedDist.id !== filters.districtId) return false;
      }
      if (filters.investor !== 'all' && project.investorName !== filters.investor) {
        return false;
      }
      if (filters.compliance === 'compliant' && !project.planningCompliance) {
        return false;
      }
      if (filters.compliance === 'review_needed' && project.planningCompliance) {
        return false;
      }
      if (filters.fromDate && project.submissionDate && project.submissionDate < filters.fromDate) {
        return false;
      }
      if (filters.toDate && project.submissionDate && project.submissionDate > filters.toDate) {
        return false;
      }
      return true;
    });
  }, [projects, filters]);

  // Lọc danh sách Mỏ vật liệu theo từ khóa tìm kiếm & địa bàn
  const filteredMines = useMemo<MaterialMine[]>(() => {
    return DIEN_BIEN_MATERIAL_MINES.filter((mine) => {
      if (
        filters.search &&
        !matchesSmartSearch(`${mine.name} ${mine.mine_type} ${mine.address} ${mine.notes}`, filters.search)
      ) {
        return false;
      }
      if (filters.districtId !== 'all') {
        const matchedDist = matchDienBienDistrict(mine.address);
        if (!matchedDist || matchedDist.id !== filters.districtId) return false;
      }
      return true;
    });
  }, [filters.search, filters.districtId]);

  // Lắng nghe sự kiện từ bên trong DOM Popup của MapLibre GL
  useEffect(() => {
    const handleHideProject = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setHiddenProjectIds((prev) => (prev.includes(customEvent.detail) ? prev : [...prev, customEvent.detail]));
      }
    };
    const handleOpenProjectPanel = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string; name: string }>;
      if (customEvent.detail?.id) {
        setSelectedProjectId(customEvent.detail.id);
        openEntity('project', {
          id: customEvent.detail.id,
          name: customEvent.detail.name,
        });
      }
    };
    window.addEventListener('sxd:hide-map-project', handleHideProject);
    window.addEventListener('sxd:open-map-project', handleOpenProjectPanel);
    return () => {
      window.removeEventListener('sxd:hide-map-project', handleHideProject);
      window.removeEventListener('sxd:open-map-project', handleOpenProjectPanel);
    };
  }, [openEntity]);

  // Khởi tạo MapLibre GL Map (giống hệt InteractiveMap.tsx bên qlda-ddcn-ht-selfhost)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: createMapStyle(mapStyle, is3D),
      center: [DIEN_BIEN_CENTER_COORD[1], DIEN_BIEN_CENTER_COORD[0]],
      zoom: 9.6,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showZoom: true,
        showCompass: true,
      }),
      'bottom-right',
    );

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cập nhật Style nền (Google Maps / Google Satellite Hybrid / ESRI) & 3D Địa hình
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(createMapStyle(mapStyle, is3D));

    map.once('styledata', () => {
      const visibility = showPlanning ? 'visible' : 'none';
      ['districts-outline', 'planning-zones-fill', 'planning-zones-outline', 'gis-lines-layer'].forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      });
    });

    if (is3D) {
      map.easeTo({ pitch: 60, bearing: -15, duration: 1000 });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
    }
  }, [mapStyle, is3D]);

  // Bật / tắt hiển thị lớp Quy hoạch & Địa giới
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const visibility = showPlanning ? 'visible' : 'none';
    ['districts-outline', 'planning-zones-fill', 'planning-zones-outline', 'gis-lines-layer'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }, [showPlanning]);

  // Render Markers Dự án (.project-gl-pin) & Mỏ vật liệu (.mine-gl-marker)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Xóa markers cũ
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();
    mineMarkersRef.current.forEach((m) => m.remove());
    mineMarkersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    let hasValidPoints = false;

    // 1. Render Markers Dự án Đầu tư Xây dựng
    if (showProjects) {
      filteredProjects.forEach((project) => {
        if (hiddenProjectIds.includes(project.id)) return;
        if (project.lat == null || project.lng == null) return;

        const stageKey = getProjectStageKey(project);
        const stageCfg = STAGE_CONFIGS[stageKey];
        const complianceInfo = getComplianceBadgeInfo(project);
        const progress = getProjectProgress(project);
        const tt39 = project.tt39_data || getProjectTT39Data(project);
        const vn2000 = wgs84ToVn2000DienBien(project.lat, project.lng);

        const el = document.createElement('div');
        el.className = `project-gl-pin${selectedProjectId === project.id ? ' is-selected' : ''}`;
        el.style.setProperty('--pin-color', stageCfg.hex);
        el.innerHTML = `<div style="width: 8px; height: 8px; background: white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`;

        const safeName = project.name.replace(/"/g, '&quot;');
        const popupHtml = `
          <div style="padding: 16px; min-width: 295px; max-width: 335px; font-family: inherit;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <h4 style="margin: 0; font-size: 13.5px; font-weight: 800; color: inherit; line-height: 1.38; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${project.name}
              </h4>
            </div>
            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
              <span style="display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: ${stageCfg.hex}18; color: ${stageCfg.hex}; border: 1px solid ${stageCfg.hex}40;">
                ${stageCfg.shortLabel}
              </span>
              <span style="display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: ${complianceInfo.hex}18; color: ${complianceInfo.hex}; border: 1px solid ${complianceInfo.hex}40;">
                ${complianceInfo.label}
              </span>
              <span style="font-size: 10px; font-weight: 700; font-family: monospace; opacity: 0.72;">
                ${project.code}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; border-top: 1px solid rgba(148, 163, 184, 0.22); padding-top: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="opacity: 0.7; font-size: 11px;">Tổng mức đầu tư:</span>
                <strong style="color: #0284c7; font-weight: 800; font-size: 12.5px;">${formatCurrency(project.totalInvestment)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <span style="opacity: 0.7; font-size: 11px; white-space: nowrap;">Chủ đầu tư:</span>
                <strong style="font-weight: 600; text-align: right; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${project.investorName}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                <span style="opacity: 0.7; font-size: 11px; white-space: nowrap;">Vị trí:</span>
                <strong style="font-weight: 600; text-align: right; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${project.location}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="opacity: 0.7; font-size: 11px;">Chỉ tiêu TT39:</span>
                <strong style="font-weight: 700; font-size: 11px;">MĐXD ${tt39.buildingDensity}% • ${tt39.floorCount} (${tt39.buildingHeight}m)</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="opacity: 0.7; font-size: 11px;">Tọa độ VN-2000:</span>
                <strong style="font-weight: 600; font-family: monospace; font-size: 10.5px;">${vn2000.formatted}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="opacity: 0.7; font-size: 11px;">Hạn trả kết quả:</span>
                <strong style="font-weight: 600;">${formatDate(project.deadlineDate)}</strong>
              </div>
              <div style="margin-top: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                  <span style="opacity: 0.7;">Tiến độ xử lý hồ sơ:</span>
                  <strong style="color: ${stageCfg.hex}; font-weight: 800;">${progress}%</strong>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(148, 163, 184, 0.22); border-radius: 99px; overflow: hidden;">
                  <div style="width: ${Math.min(progress, 100)}%; height: 100%; background: ${stageCfg.hex}; border-radius: 99px;"></div>
                </div>
              </div>

              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(148, 163, 184, 0.28); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <button
                  type="button"
                  onclick="window.dispatchEvent(new CustomEvent('sxd:hide-map-project', { detail: '${project.id}' }))"
                  style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25); padding: 5px 10px; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer;"
                >
                  Ẩn dự án này
                </button>
                <button
                  type="button"
                  onclick="window.dispatchEvent(new CustomEvent('sxd:open-map-project', { detail: { id: '${project.id}', name: '${safeName}' } }))"
                  style="background: #0284c7; color: #ffffff; border: none; padding: 5px 11px; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer;"
                >
                  Mở hồ sơ dự án →
                </button>
              </div>
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({
          offset: 16,
          closeButton: false,
          maxWidth: '350px',
          className: 'custom-gl-popup',
        }).setHTML(popupHtml);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([project.lng, project.lat])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener('click', () => {
          setSelectedProjectId(project.id);
        });

        markersRef.current.set(project.id, { marker, popup });
        bounds.extend([project.lng, project.lat]);
        hasValidPoints = true;
      });
    }

    // 2. Render Markers Mỏ Vật liệu Xây dựng (.mine-gl-marker) giống qlda-ddcn-ht-selfhost
    if (showMines) {
      filteredMines.forEach((mine) => {
        const el = document.createElement('div');
        el.className = 'mine-gl-marker';
        el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 10l-8.5 8.5a2.12 2.12 0 1 1-3-3L11 7"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>`;

        const statusBg =
          mine.status === 'Đang khai thác' ? '#10b98118' : mine.status === 'Quy hoạch' ? '#0284c718' : '#ef444418';
        const statusColor =
          mine.status === 'Đang khai thác' ? '#10b981' : mine.status === 'Quy hoạch' ? '#0284c7' : '#ef4444';

        const popupHtml = `
          <div style="padding: 16px; min-width: 265px; max-width: 310px; font-family: inherit;">
            <h4 style="margin: 0 0 6px 0; font-size: 13.5px; font-weight: 800; line-height: 1.35;">
              ${mine.name}
            </h4>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: #f59e0b20; color: #d97706; border: 1px solid #f59e0b40;">
                Mỏ ${mine.mine_type}
              </span>
              <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}40;">
                ${mine.status}
              </span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; border-top: 1px solid rgba(148, 163, 184, 0.22); padding-top: 10px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="opacity: 0.7; font-size: 11px;">Trữ lượng công bố:</span>
                <strong style="color: #d97706; font-weight: 800;">${mine.capacity}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <span style="opacity: 0.7; font-size: 11px; white-space: nowrap;">Địa chỉ:</span>
                <strong style="font-weight: 600; text-align: right;">${mine.address}</strong>
              </div>
              <div style="margin-top: 4px; font-size: 11px; opacity: 0.85; font-style: italic; background: rgba(148, 163, 184, 0.12); padding: 7px 9px; border-radius: 8px;">
                "${mine.notes}"
              </div>
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({
          offset: 16,
          closeButton: false,
          maxWidth: '320px',
          className: 'custom-gl-popup',
        }).setHTML(popupHtml);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([mine.coordinates.lng, mine.coordinates.lat])
          .setPopup(popup)
          .addTo(map);

        mineMarkersRef.current.push(marker);
        bounds.extend([mine.coordinates.lng, mine.coordinates.lat]);
        hasValidPoints = true;
      });
    }

    if (hasValidPoints && !bounds.isEmpty() && filters.districtId !== 'all') {
      map.fitBounds(bounds, { padding: 65, maxZoom: 13.5, duration: 900 });
    }
  }, [
    filteredProjects,
    filteredMines,
    showProjects,
    showMines,
    hiddenProjectIds,
    selectedProjectId,
    filters.districtId,
  ]);

  const handleFocusProject = useCallback(
    (project: Project) => {
      setSelectedProjectId(project.id);
      const map = mapRef.current;
      if (!map || project.lat == null || project.lng == null) return;

      markersRef.current.forEach(({ popup }, id) => {
        if (id !== project.id && popup.isOpen()) {
          popup.remove();
        }
      });

      map.flyTo({
        center: [project.lng, project.lat],
        zoom: Math.max(map.getZoom(), 14.2),
        pitch: is3D ? 60 : 0,
        duration: 1100,
      });

      const entry = markersRef.current.get(project.id);
      if (entry && !entry.popup.isOpen()) {
        entry.marker.togglePopup();
      }
    },
    [is3D],
  );

  const handleFlyToCenter = useCallback(
    (coords: [number, number], zoom: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({
        center: [coords[1], coords[0]],
        zoom,
        pitch: is3D ? 60 : 0,
        bearing: is3D ? -15 : 0,
        duration: 1100,
      });
    },
    [is3D],
  );

  // Dự án đang chọn để hiển thị trên bảng Thanh tra Quy hoạch & Chỉ tiêu TT39 bên phải
  const selectedProject = useMemo(() => {
    return (
      filteredProjects.find((p) => p.id === selectedProjectId) ||
      projects.find((p) => p.id === selectedProjectId) ||
      filteredProjects[0] ||
      projects[0] ||
      null
    );
  }, [filteredProjects, projects, selectedProjectId]);

  const selectedProjectSpatial = useMemo(() => {
    if (!selectedProject) return null;
    const tt39 = selectedProject.tt39_data || getProjectTT39Data(selectedProject);
    const lat = selectedProject.lat ?? DIEN_BIEN_CENTER_COORD[0];
    const lng = selectedProject.lng ?? DIEN_BIEN_CENTER_COORD[1];
    const vn2000 = wgs84ToVn2000DienBien(lat, lng);
    const district = matchDienBienDistrict(selectedProject.location);
    const planningZone = matchPlanningZone(lat, lng);
    const airportDistanceKm = haversineDistanceKm(lat, lng, DIEN_BIEN_AIRPORT_COORD[0], DIEN_BIEN_AIRPORT_COORD[1]);
    return {
      tt39,
      lat,
      lng,
      vn2000,
      district,
      planningZone,
      airportDistanceKm,
    };
  }, [selectedProject]);

  // Số liệu thống kê theo giai đoạn
  const stageCounts = useMemo(() => {
    let bcnckt = 0;
    let gpxd = 0;
    let hau_kiem = 0;
    filteredProjects.forEach((p) => {
      const st = getProjectStageKey(p);
      if (st === 'bcnckt') bcnckt++;
      else if (st === 'gpxd') gpxd++;
      else hau_kiem++;
    });
    return { bcnckt, gpxd, hau_kiem };
  }, [filteredProjects]);

  const tableColumns = useMemo<Column<Project>[]>(
    () => [
      {
        header: 'Dự án đầu tư xây dựng',
        width: 310,
        sortKey: 'name',
        sortValue: (p) => p.name,
        accessor: (project) => (
          <div className="flex flex-col gap-0.5 py-0.5">
            <EntityLink
              type="project"
              id={project.id}
              name={project.name}
              className="font-bold text-slate-900 dark:text-slate-100"
            />
            <span className="text-2xs text-slate-500 dark:text-slate-400">
              {project.field || 'Công trình xây dựng'} • Nhóm {project.projectGroup} (Cấp {project.buildingGrade})
            </span>
          </div>
        ),
      },
      {
        header: 'Mã dự án',
        width: 145,
        sortKey: 'code',
        sortValue: (p) => p.code,
        accessor: (project) => (
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{project.code}</span>
        ),
      },
      {
        header: 'Giai đoạn quản lý',
        width: 165,
        sortKey: 'stage',
        sortValue: (p) => STAGE_CONFIGS[getProjectStageKey(p)].label,
        accessor: (project) => {
          const st = STAGE_CONFIGS[getProjectStageKey(project)];
          return (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-bold"
              style={{
                backgroundColor: `${st.hex}18`,
                color: st.hex,
                border: `1px solid ${st.hex}40`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.hex }} />
              {st.shortLabel}
            </span>
          );
        },
      },
      {
        header: 'Chủ đầu tư',
        width: 220,
        sortKey: 'investorName',
        sortValue: (p) => p.investorName,
        accessor: (project) =>
          project.investorId ? (
            <EntityLink
              type="organization"
              id={project.investorId}
              name={project.investorName}
              className="text-xs font-medium"
            />
          ) : (
            <span className="text-xs text-slate-700 dark:text-slate-300">{project.investorName}</span>
          ),
      },
      {
        header: 'Địa điểm & Địa bàn',
        width: 210,
        sortKey: 'location',
        sortValue: (p) => p.location,
        accessor: (project) => (
          <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="truncate">{project.location}</span>
          </div>
        ),
      },
      {
        header: 'Tổng mức đầu tư',
        width: 155,
        className: 'text-right',
        sortKey: 'totalInvestment',
        sortValue: (p) => p.totalInvestment || 0,
        accessor: (project) => (
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
            {formatCurrency(project.totalInvestment)}
          </span>
        ),
      },
      {
        header: 'Đối chiếu QH',
        width: 145,
        sortKey: 'planningCompliance',
        sortValue: (p) => (p.planningCompliance ? 1 : 0),
        accessor: (project) => {
          const badge = getComplianceBadgeInfo(project);
          return <StatusBadge status={badge.tone} label={badge.label} />;
        },
      },
      {
        header: 'Tọa độ WGS84 / VN-2000',
        width: 195,
        sortKey: 'coords',
        sortValue: (p) => p.lat || 0,
        accessor: (project) => {
          if (project.lat == null || project.lng == null) {
            return <span className="text-xs italic text-slate-400 dark:text-slate-500">Chưa gắn tọa độ</span>;
          }
          const vn = wgs84ToVn2000DienBien(project.lat, project.lng);
          return (
            <div className="flex flex-col font-mono text-2xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {project.lat.toFixed(4)}°N, {project.lng.toFixed(4)}°E
              </span>
              <span className="text-slate-500 dark:text-slate-400">{vn.formatted}</span>
            </div>
          );
        },
      },
      {
        header: 'Hạn trả KQ',
        width: 115,
        sortKey: 'deadlineDate',
        sortValue: (p) => p.deadlineDate || '',
        accessor: (project) => (
          <span className="text-xs text-slate-700 dark:text-slate-300">{formatDate(project.deadlineDate)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bản đồ Vị trí Dự án, Mỏ Vật liệu & Quy hoạch Xây dựng"
        description="Không gian địa lý WebGIS 2D/3D (Google Maps, Google Vệ tinh, ESRI & Địa hình 3D) tích hợp 28 dự án đầu tư, 10 mỏ vật liệu xây dựng và phân vùng quy hoạch tỉnh Điện Biên."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Nút bật/tắt Dự án giống hệt OverviewTab bên qlda-ddcn-ht-selfhost */}
            <Tooltip content="Bật/tắt hiển thị các mốc Dự án đầu tư xây dựng trên bản đồ" placement="bottom">
              <button
                type="button"
                onClick={() => setShowProjects((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                  showProjects
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    showProjects ? 'animate-pulse bg-blue-600 dark:bg-blue-400' : 'bg-slate-400 dark:bg-slate-500'
                  }`}
                />
                {showProjects ? `Đang hiện Dự án (${filteredProjects.length})` : 'Hiện Dự án'}
              </button>
            </Tooltip>

            {/* Nút bật/tắt Mỏ vật liệu giống hệt OverviewTab bên qlda-ddcn-ht-selfhost */}
            <Tooltip content="Bật/tắt hiển thị các Mỏ vật liệu (Đá, Cát, Đất san lấp) trên bản đồ" placement="bottom">
              <button
                type="button"
                onClick={() => setShowMines((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                  showMines
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    showMines ? 'animate-pulse bg-amber-500 dark:bg-amber-400' : 'bg-slate-400 dark:bg-slate-500'
                  }`}
                />
                {showMines ? `Đang hiện Mỏ vật liệu (${filteredMines.length})` : 'Hiện Mỏ vật liệu'}
              </button>
            </Tooltip>

            {/* Nút bật/tắt Lớp Quy hoạch & Địa giới */}
            <Tooltip content="Bật/tắt ranh giới Quy hoạch chung, Phễu tĩnh không & Trục Quốc lộ" placement="bottom">
              <button
                type="button"
                onClick={() => setShowPlanning((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                  showPlanning
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    showPlanning ? 'animate-pulse bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-400 dark:bg-slate-500'
                  }`}
                />
                {showPlanning ? 'Đang hiện Lớp Quy hoạch' : 'Hiện Lớp Quy hoạch'}
              </button>
            </Tooltip>
          </div>
        }
      />

      {/* Thanh tìm kiếm & bộ lọc chuẩn 5 vị trí từ Trái sang Phải (Standard Filter Bar Layout) */}
      <GridToolbar
        search={
          <GridSearchInput
            value={filters.search}
            onChange={(val: string) => updateFilters({ search: val })}
            placeholder="Tìm theo tên dự án, mã dự án, mỏ vật liệu, địa bàn..."
          />
        }
        classification={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <SearchableSelect
                value={filters.stage}
                onChange={(val) => updateFilters({ stage: val || 'all' })}
                options={classificationOptions}
                placeholder="Giai đoạn dự án"
              />
            </div>
            <div className="w-56">
              <SearchableSelect
                value={filters.districtId}
                onChange={(val) => {
                  const nextDist = val || 'all';
                  updateFilters({ districtId: nextDist });
                  const found = DIEN_BIEN_DISTRICTS.find((d) => d.id === nextDist);
                  if (found) {
                    handleFlyToCenter(found.center, 11.8);
                  } else {
                    handleFlyToCenter(DIEN_BIEN_CENTER_COORD, 9.6);
                  }
                }}
                options={districtOptions}
                placeholder="Chọn Huyện / Thị / TP"
              />
            </div>
          </div>
        }
        people={
          <div className="w-60">
            <SearchableSelect
              value={filters.investor}
              onChange={(val) => updateFilters({ investor: val || 'all' })}
              options={investorOptions}
              placeholder="Chủ đầu tư"
            />
          </div>
        }
        status={
          <div className="w-56">
            <SearchableSelect
              value={filters.compliance}
              onChange={(val) => updateFilters({ compliance: val || 'all' })}
              options={complianceOptions}
              placeholder="Sự phù hợp quy hoạch"
            />
          </div>
        }
        period={
          <div className="flex items-center gap-1.5">
            <DateInput
              value={filters.fromDate}
              onChange={(val) => updateFilters({ fromDate: val })}
              placeholder="Từ ngày"
            />
            <span className="text-xs text-slate-400">–</span>
            <DateInput
              value={filters.toDate}
              onChange={(val) => updateFilters({ toDate: val })}
              placeholder="Đến ngày"
            />
          </div>
        }
        onReset={() => {
          resetFilters();
          setHiddenProjectIds([]);
          handleFlyToCenter(DIEN_BIEN_CENTER_COORD, 9.6);
        }}
        count={
          <GridCount
            total={filteredProjects.length}
            unit="dự án"
            detail={filteredProjects.length !== projects.length ? `trên ${formatNumber(projects.length)}` : undefined}
          />
        }
      />

      {/* Khối Bản đồ Tương tác MapLibre GL + Thanh tra Quy hoạch & Chỉ tiêu TT39 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Khung Bản đồ chính (chiếm 8/12 cột hoặc 12/12 khi phóng rộng) */}
        <div
          className={`${
            isExpanded ? 'xl:col-span-12' : 'xl:col-span-8'
          } relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900`}
        >
          <div className="project-map-canvas relative w-full">
            <div ref={mapContainerRef} className="h-full w-full" />

            {/* Floating Top-Left Toolbar giống hệt InteractiveMap.tsx bên qlda-ddcn-ht-selfhost */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
              {/* Basemap Switcher: Bản đồ (Google) / Vệ tinh (Google Hybrid) / ESRI */}
              <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <Tooltip content="Bản đồ Đường phố Google Maps (Tiếng Việt sắc nét)" placement="bottom">
                  <button
                    type="button"
                    onClick={() => setMapStyle('roadmap')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                      mapStyle === 'roadmap'
                        ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                        : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    Bản đồ
                  </button>
                </Tooltip>
                <Tooltip content="Ảnh Vệ tinh Google Hybrid kèm nhãn đường phố & địa danh" placement="bottom">
                  <button
                    type="button"
                    onClick={() => setMapStyle('satellite')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                      mapStyle === 'satellite'
                        ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                        : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    Vệ tinh
                  </button>
                </Tooltip>
                <Tooltip content="Bản đồ Hành chính & Địa hình quốc tế ESRI ArcGIS" placement="bottom">
                  <button
                    type="button"
                    onClick={() => setMapStyle('esri')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                      mapStyle === 'esri'
                        ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                        : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    ESRI
                  </button>
                </Tooltip>
              </div>

              {/* 3D Terrain Toggle giống hệt InteractiveMap.tsx bên qlda-ddcn-ht-selfhost */}
              <Tooltip content="Bật/tắt chế độ Địa hình 3D (AWS Terrarium DEM) nghiêng góc nhìn 60°" placement="bottom">
                <button
                  type="button"
                  onClick={() => setIs3D((prev) => !prev)}
                  className={`pointer-events-auto flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-lg transition-all ${
                    is3D
                      ? 'border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Mountain className="h-3.5 w-3.5" />
                  <span>Chế độ 3D</span>
                </button>
              </Tooltip>

              {/* Nút điều hướng nhanh về Trung tâm TP. Điện Biên Phủ hoặc Toàn tỉnh */}
              <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <Tooltip content="Bay về Trung tâm TP. Điện Biên Phủ (Quảng trường 7/5)" placement="bottom">
                  <button
                    type="button"
                    onClick={() => handleFlyToCenter(DIEN_BIEN_CENTER_COORD, 13.4)}
                    className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Compass className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>TP. ĐBP</span>
                  </button>
                </Tooltip>
                <Tooltip content="Thu phóng toàn cảnh 10 Huyện/Thị/TP tỉnh Điện Biên" placement="bottom">
                  <button
                    type="button"
                    onClick={() => handleFlyToCenter(DIEN_BIEN_CENTER_COORD, 9.2)}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Toàn tỉnh
                  </button>
                </Tooltip>
                <Tooltip content={isExpanded ? 'Thu gọn khung bản đồ' : 'Mở rộng toàn chiều ngang'} placement="bottom">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExpanded((prev) => !prev);
                      setTimeout(() => mapRef.current?.resize(), 150);
                    }}
                    className="rounded-lg bg-white p-1.5 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Chú thích giai đoạn (Lọc trực tiếp) ở góc phải trên giống hệt OverviewTab.tsx bên qlda-ddcn-ht-selfhost */}
            <div className="absolute right-3 top-3 z-10 w-60 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Chú thích giai đoạn (Bấm để lọc)
                </span>
                {filters.stage !== 'all' && (
                  <button
                    type="button"
                    onClick={() => updateFilters({ stage: 'all' })}
                    className="text-2xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Bỏ lọc
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {Object.values(STAGE_CONFIGS).map((cfg) => {
                  const isActive = filters.stage === 'all' || filters.stage === cfg.key;
                  const count = stageCounts[cfg.key];
                  return (
                    <Tooltip
                      key={cfg.key}
                      content={filters.stage === cfg.key ? 'Bấm để hiển thị lại tất cả giai đoạn' : `Lọc: ${cfg.label}`}
                      placement="left"
                    >
                      <button
                        type="button"
                        onClick={() => updateFilters({ stage: filters.stage === cfg.key ? 'all' : cfg.key })}
                        className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left transition-all ${
                          isActive
                            ? 'bg-slate-50 opacity-100 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700'
                            : 'bg-white opacity-45 hover:opacity-80 dark:bg-slate-900'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-slate-700"
                            style={{ backgroundColor: cfg.hex }}
                          />
                          <span className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                            {cfg.shortLabel}
                          </span>
                        </span>
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 font-mono text-2xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {count}
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}

                <div className="my-1.5 border-t border-slate-200 pt-1.5 dark:border-slate-700">
                  <div className="flex items-center justify-between px-2 py-0.5 text-2xs font-semibold text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <span className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-white dark:bg-amber-600">
                        <Pickaxe className="h-2 w-2" />
                      </span>
                      <span>Mỏ vật liệu xây dựng</span>
                    </span>
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                      {filteredMines.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-0.5 text-2xs font-semibold text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-sky-600 bg-sky-500 dark:border-sky-400 dark:bg-sky-600" />
                      <span>Phân vùng Quy hoạch</span>
                    </span>
                    <span className="font-mono font-bold text-sky-700 dark:text-sky-400">
                      {DIEN_BIEN_PLANNING_ZONES.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Nút khôi phục dự án đã ẩn giống hệt InteractiveMap.tsx bên qlda-ddcn-ht-selfhost */}
            {hiddenProjectIds.length > 0 && (
              <div className="absolute bottom-4 left-3 z-10">
                <button
                  type="button"
                  onClick={() => setHiddenProjectIds([])}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-lg transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Eye className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Khôi phục {hiddenProjectIds.length} dự án đã ẩn</span>
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-2xs font-extrabold text-white dark:bg-red-600">
                    {hiddenProjectIds.length}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Panel Đối chiếu Quy hoạch, Tọa độ VN-2000 & Chỉ tiêu TT39 của Dự án đang chọn (4/12 cột) */}
        <div
          className={`${
            isExpanded ? 'xl:col-span-12' : 'xl:col-span-4'
          } flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900`}
        >
          {selectedProject && selectedProjectSpatial ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-2xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      {selectedProject.code}
                    </span>
                    <StatusBadge
                      status={getComplianceBadgeInfo(selectedProject).tone}
                      label={getComplianceBadgeInfo(selectedProject).label}
                    />
                  </div>
                  <h3 className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">
                    <EntityLink type="project" id={selectedProject.id} name={selectedProject.name} />
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selectedProject.location}</p>
                </div>
              </div>

              {/* Khối Tọa độ WGS84 & VN-2000 Kinh tuyến trục 103° Điện Biên */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-2xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Compass className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    Hệ tọa độ VN-2000 (Kinh tuyến trục 103°00&apos; ĐB)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleFocusProject(selectedProject)}
                    className="text-2xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Định vị trên bản đồ
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                    <span className="block text-2xs text-slate-400">WGS84 (Lat / Lng)</span>
                    <strong className="text-slate-800 dark:text-slate-100">
                      {selectedProjectSpatial.lat.toFixed(4)}°N, {selectedProjectSpatial.lng.toFixed(4)}°E
                    </strong>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                    <span className="block text-2xs text-slate-400">VN-2000 Múi 3°</span>
                    <strong className="text-slate-800 dark:text-slate-100">
                      X:{formatNumber(selectedProjectSpatial.vn2000.x)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Chỉ tiêu Quy hoạch & Kiến trúc theo Thông tư 39/2026/TT-BXD */}
              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <Ruler className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  Chỉ tiêu Quy hoạch – Kiến trúc (TT 39/2026/TT-BXD)
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800">
                    <span className="block text-2xs text-slate-500 dark:text-slate-400">Lô đất & Diện tích</span>
                    <strong className="font-bold text-slate-900 dark:text-slate-100">
                      {selectedProjectSpatial.tt39.landLot} • {formatNumber(selectedProjectSpatial.tt39.landArea)} m²
                    </strong>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800">
                    <span className="block text-2xs text-slate-500 dark:text-slate-400">Mật độ XD & Hệ số SDD</span>
                    <strong className="font-bold text-blue-700 dark:text-blue-400">
                      MĐ {selectedProjectSpatial.tt39.buildingDensity}% • HSSD {selectedProjectSpatial.tt39.plotRatio}
                    </strong>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800">
                    <span className="block text-2xs text-slate-500 dark:text-slate-400">Tầng cao & Chiều cao</span>
                    <strong className="font-bold text-slate-900 dark:text-slate-100">
                      {selectedProjectSpatial.tt39.floorCount} • {selectedProjectSpatial.tt39.buildingHeight}m
                    </strong>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800">
                    <span className="block text-2xs text-slate-500 dark:text-slate-400">DT xây dựng & Tổng sàn</span>
                    <strong className="font-bold text-slate-900 dark:text-slate-100">
                      {formatNumber(selectedProjectSpatial.tt39.constructionArea)} /{' '}
                      {formatNumber(selectedProjectSpatial.tt39.grossFloorArea)} m²
                    </strong>
                  </div>
                </div>
              </div>

              {/* Đồ án Quy hoạch tham chiếu & Kiểm tra Tĩnh không Cảng HK Điện Biên */}
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-200">
                    <Layers className="h-3.5 w-3.5" />
                    {selectedProjectSpatial.planningZone.categoryLabel}
                  </span>
                  <span className="font-mono text-2xs font-bold text-blue-700 dark:text-blue-300">
                    {selectedProjectSpatial.planningZone.decisionNumber}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {selectedProjectSpatial.planningZone.name}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-200 pt-2 text-2xs text-slate-700 dark:border-blue-800 dark:text-slate-300">
                  <span className="flex items-center gap-1">
                    <Plane className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    Cách CHK Điện Biên: <strong>{selectedProjectSpatial.airportDistanceKm} km</strong>
                  </span>
                  <span>
                    Trần quy hoạch: <strong>≤ {selectedProjectSpatial.planningZone.maxHeightMeters}m</strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Chọn một dự án trên bản đồ hoặc bảng bên dưới để xem chi tiết chỉ tiêu quy hoạch.
            </div>
          )}

          {selectedProject && (
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="text-xs">
                <span className="text-slate-500 dark:text-slate-400">Tổng mức ĐT: </span>
                <strong className="font-mono font-bold text-blue-700 dark:text-blue-400">
                  {formatCurrency(selectedProject.totalInvestment)}
                </strong>
              </div>
              <button
                type="button"
                onClick={() =>
                  openEntity('project', {
                    id: selectedProject.id,
                    name: selectedProject.name,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <span>Mở hồ sơ thẩm định</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bảng Danh mục Dự án đồng bộ với Bản đồ (Bấm dòng để bay tới vị trí dự án) */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Danh sách Dự án đồng bộ Không gian Bản đồ ({filteredProjects.length} dự án)
            </h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            💡 Bấm vào bất kỳ dòng dự án nào để bản đồ tự động bay (Fly-To) tới tâm công trình và mở thẻ thông tin.
          </span>
        </div>

        <MasterTable
          columns={tableColumns}
          data={filteredProjects}
          storageKey="sxd-gis-map-master-table-v3"
          loading={loading}
          onRowClick={(project) => handleFocusProject(project)}
          onView={(project) => openEntity('project', { id: project.id, name: project.name })}
          emptyMessage="Không tìm thấy dự án phù hợp bộ lọc không gian"
          maxHeight="460px"
        />
      </div>
    </div>
  );
}

export default ProjectMap;
