import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers,
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Compass,
  Navigation,
  ExternalLink,
  Shield,
  Eye,
  Info,
} from 'lucide-react';
import type { Project } from '../../data/mockData';
import {
  DIEN_BIEN_CENTER,
  DIEN_BIEN_DEFAULT_ZOOM,
  DIEN_BIEN_PROVINCE_BOUNDARY,
  DIEN_BIEN_ZONING_AREAS,
  GOOGLE_MAP_DARK_STYLES,
  getProjectCoordinates,
  type LatLng,
} from '../../lib/gisData';
import { formatCurrency } from '../../lib/utils';
import { loadGoogleMaps, isGoogleMapsLoaded } from '../../lib/googleMapsLoader';

export type GoogleMapType = 'hybrid' | 'roadmap' | 'satellite' | 'terrain';

export interface GoogleMapViewerProps {
  projects: Project[];
  selectedProject: Project;
  onSelectProject: (project: Project) => void;
  onOpenDetail: (project: Project) => void;
  apiKey?: string;
  mapType?: GoogleMapType;
  showBoundary?: boolean;
  showZoning?: boolean;
  showTraffic?: boolean;
  isDark?: boolean;
  className?: string;
}

export function GoogleMapViewer({
  projects,
  selectedProject,
  onSelectProject,
  onOpenDetail,
  apiKey,
  mapType = 'hybrid',
  showBoundary = true,
  showZoning = true,
  showTraffic = false,
  isDark = false,
  className,
}: GoogleMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeEngine, setActiveEngine] = useState<'sdk' | 'tiles'>('tiles');
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mouseCoords, setMouseCoords] = useState<LatLng | null>(null);

  // References for Leaflet engine
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletTileLayerRef = useRef<L.TileLayer | null>(null);
  const leafletMarkersRef = useRef<Record<string, L.Marker>>({});
  const leafletBoundaryRef = useRef<L.Polygon | null>(null);
  const leafletZoningRef = useRef<L.Polygon[]>([]);

  // References for Google Maps SDK engine
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const googleMarkersRef = useRef<Record<string, google.maps.Marker>>({});
  const googleBoundaryRef = useRef<google.maps.Polygon | null>(null);
  const googleZoningRef = useRef<google.maps.Polygon[]>([]);
  const googleTrafficRef = useRef<google.maps.TrafficLayer | null>(null);
  const googleInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // ─── 1. THIẾT LẬP DUAL ENGINE: THỬ NẠP GOOGLE MAPS JS SDK NẾU CÓ KEY ───
  useEffect(() => {
    let isCancelled = false;

    if (apiKey && apiKey.trim().length > 0) {
      loadGoogleMaps(apiKey)
        .then(() => {
          if (!isCancelled) {
            setActiveEngine('sdk');
            setSdkError(null);
          }
        })
        .catch((err) => {
          console.warn('Google Maps JS API load failed, falling back to Google Maps Tile Layer:', err);
          if (!isCancelled) {
            setSdkError(err.message || 'Không thể kết nối Google Maps SDK');
            setActiveEngine('tiles');
          }
        });
    } else {
      setActiveEngine('tiles');
      setSdkError(null);
    }

    return () => {
      isCancelled = true;
    };
  }, [apiKey]);

  // ─── 2. ENGINE 1: GOOGLE MAPS JS SDK (OFFICIAL) ───
  useEffect(() => {
    if (activeEngine !== 'sdk' || !containerRef.current) return;

    try {
      // Dọn dẹp Leaflet nếu đang có
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const mapTypeIds: Record<GoogleMapType, google.maps.MapTypeId> = {
        roadmap: google.maps.MapTypeId.ROADMAP,
        satellite: google.maps.MapTypeId.SATELLITE,
        hybrid: google.maps.MapTypeId.HYBRID,
        terrain: google.maps.MapTypeId.TERRAIN,
      };

      const map = new google.maps.Map(containerRef.current, {
        center: { lat: DIEN_BIEN_CENTER.lat, lng: DIEN_BIEN_CENTER.lng },
        zoom: DIEN_BIEN_DEFAULT_ZOOM,
        mapTypeId: mapTypeIds[mapType],
        disableDefaultUI: true, // Tùy biến thanh công cụ riêng
        zoomControl: false,
        styles: isDark && (mapType === 'roadmap' || mapType === 'terrain') ? GOOGLE_MAP_DARK_STYLES : [],
      });

      googleMapRef.current = map;

      // Hover theo dõi tọa độ
      map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          setMouseCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      });

      const infoWindow = new google.maps.InfoWindow();
      googleInfoWindowRef.current = infoWindow;

      // Tạo markers cho Google Maps
      googleMarkersRef.current = {};
      projects.forEach((p) => {
        const coords = getProjectCoordinates(p.id, p.location);
        const color =
          p.slaStatus === 'dang_tham_dinh'
            ? '#f59e0b'
            : p.slaStatus === 'da_tham_dinh'
            ? '#10b981'
            : p.slaStatus === 'qua_han'
            ? '#f43f5e'
            : '#0284c7';

        const svgPin = `
          <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42" fill="none">
            <filter id="shadow" x="-4" y="-2" width="42" height="48" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.45"/>
            </filter>
            <path d="M17 0C7.61 0 0 7.61 0 17C0 27.2 14.62 39.8 15.24 40.34C16.27 41.22 17.73 41.22 18.76 40.34C19.38 39.8 34 27.2 34 17C34 7.61 26.39 0 17 0Z" fill="${color}" filter="url(#shadow)"/>
            <circle cx="17" cy="17" r="8" fill="#ffffff"/>
            <circle cx="17" cy="17" r="4.5" fill="${color}"/>
          </svg>
        `;

        const marker = new google.maps.Marker({
          position: { lat: coords.lat, lng: coords.lng },
          map,
          title: p.name,
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgPin)}`,
            scaledSize: new google.maps.Size(34, 42),
            anchor: new google.maps.Point(17, 42),
          },
        });

        marker.addListener('click', () => {
          onSelectProject(p);
          const content = `
            <div style="font-family: inherit; padding: 4px; max-width: 260px;">
              <span style="font-size: 10px; font-weight: 700; color: #0284c7; font-family: monospace;">${p.code}</span>
              <h4 style="font-size: 12px; font-weight: bold; margin: 4px 0 6px 0; color: #0f172a; line-height: 1.3;">${p.name}</h4>
              <p style="font-size: 11px; margin: 2px 0; color: #475569;"><strong>Chủ đầu tư:</strong> ${p.investorName}</p>
              <p style="font-size: 11px; margin: 2px 0; color: #475569;"><strong>TMĐT:</strong> <span style="color: #059669; font-weight: bold;">${formatCurrency(p.totalInvestment)}</span></p>
              <div style="margin-top: 8px;">
                <button id="btn-open-${p.id}" style="width: 100%; background: #0284c7; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">
                  Mở Hồ sơ Thẩm định
                </button>
              </div>
            </div>
          `;
          infoWindow.setContent(content);
          infoWindow.open(map, marker);

          setTimeout(() => {
            const btn = document.getElementById(`btn-open-${p.id}`);
            if (btn) {
              btn.onclick = () => onOpenDetail(p);
            }
          }, 100);
        });

        googleMarkersRef.current[p.id] = marker;
      });

      // Lớp ranh giới Tỉnh Điện Biên
      if (showBoundary) {
        const boundaryCoords = DIEN_BIEN_PROVINCE_BOUNDARY.map(([lat, lng]) => ({ lat, lng }));
        const boundaryPolygon = new google.maps.Polygon({
          paths: boundaryCoords,
          strokeColor: '#00668c',
          strokeOpacity: 0.9,
          strokeWeight: 2.5,
          fillColor: '#00668c',
          fillOpacity: 0.05,
          map,
        });
        googleBoundaryRef.current = boundaryPolygon;
      }

      // Lớp vùng quy hoạch
      if (showZoning) {
        googleZoningRef.current = DIEN_BIEN_ZONING_AREAS.map((zone) => {
          return new google.maps.Polygon({
            paths: zone.coordinates.map(([lat, lng]) => ({ lat, lng })),
            strokeColor: zone.color,
            strokeOpacity: 0.8,
            strokeWeight: 1.5,
            fillColor: zone.color,
            fillOpacity: zone.fillOpacity,
            map,
          });
        });
      }

      // Lớp giao thông
      if (showTraffic) {
        const trafficLayer = new google.maps.TrafficLayer();
        trafficLayer.setMap(map);
        googleTrafficRef.current = trafficLayer;
      }
    } catch (e: any) {
      console.warn('Google Maps SDK init error:', e);
      setActiveEngine('tiles');
    }

    return () => {
      // Dọn dẹp Google Maps listeners / polygons
      if (googleInfoWindowRef.current) googleInfoWindowRef.current.close();
      if (googleBoundaryRef.current) googleBoundaryRef.current.setMap(null);
      googleZoningRef.current.forEach((z) => z.setMap(null));
      googleZoningRef.current = [];
      if (googleTrafficRef.current) googleTrafficRef.current.setMap(null);
      Object.values(googleMarkersRef.current).forEach((m) => m.setMap(null));
      googleMarkersRef.current = {};
      googleMapRef.current = null;
    };
  }, [activeEngine, isDark]);

  // Cập nhật MapType cho Google Maps SDK
  useEffect(() => {
    if (activeEngine !== 'sdk' || !googleMapRef.current) return;
    const mapTypeIds: Record<GoogleMapType, google.maps.MapTypeId> = {
      roadmap: google.maps.MapTypeId.ROADMAP,
      satellite: google.maps.MapTypeId.SATELLITE,
      hybrid: google.maps.MapTypeId.HYBRID,
      terrain: google.maps.MapTypeId.TERRAIN,
    };
    googleMapRef.current.setMapTypeId(mapTypeIds[mapType]);
  }, [activeEngine, mapType]);

  // ─── 3. ENGINE 2: DIRECT GOOGLE MAPS TILES (LEAFLET ENGINE) ───
  useEffect(() => {
    if (activeEngine !== 'tiles' || !containerRef.current) return;

    // Dọn dẹp map cũ nếu đã tồn tại
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center: [DIEN_BIEN_CENTER.lat, DIEN_BIEN_CENTER.lng],
      zoom: DIEN_BIEN_DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });
    leafletMapRef.current = map;

    // Theo dõi tọa độ chuột
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Lựa chọn Tile Server chính xác của Google Maps:
    // lyrs=y: Google Hybrid (Vệ tinh có nhãn)
    // lyrs=m: Google Roadmap (Đường sá giao thông)
    // lyrs=s: Google Satellite (Vệ tinh thuần)
    // lyrs=p: Google Terrain (Địa hình Tây Bắc)
    const googleTileUrls: Record<GoogleMapType, string> = {
      hybrid: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      roadmap: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      satellite: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      terrain: 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    };

    const tileLayer = L.tileLayer(googleTileUrls[mapType], {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
      attribution: '&copy; Google Maps',
      className: isDark && (mapType === 'roadmap' || mapType === 'terrain') ? 'google-map-dark-tiles' : '',
    }).addTo(map);
    leafletTileLayerRef.current = tileLayer;

    // ── Ranh giới Tỉnh Điện Biên ──
    if (showBoundary) {
      const boundary = L.polygon(DIEN_BIEN_PROVINCE_BOUNDARY, {
        color: '#00668c',
        weight: 2.5,
        opacity: 0.9,
        dashArray: '6, 6',
        fillColor: '#00668c',
        fillOpacity: 0.04,
      }).addTo(map);
      leafletBoundaryRef.current = boundary;
    }

    // ── Các vùng quy hoạch ──
    if (showZoning) {
      leafletZoningRef.current = DIEN_BIEN_ZONING_AREAS.map((zone) => {
        const poly = L.polygon(zone.coordinates, {
          color: zone.color,
          weight: 1.8,
          opacity: 0.85,
          fillColor: zone.color,
          fillOpacity: zone.fillOpacity,
        }).addTo(map);

        poly.bindTooltip(
          `<div style="font-weight: 700; font-size: 11px;">${zone.name}</div><div style="font-size: 10px; color: #cbd5e1;">${zone.description}</div>`,
          { sticky: true, className: 'leaflet-custom-tooltip' }
        );

        return poly;
      });
    }

    // ── Markers các dự án ──
    leafletMarkersRef.current = {};
    projects.forEach((p) => {
      const coords = getProjectCoordinates(p.id, p.location);
      const isSelected = selectedProject?.id === p.id;

      const color =
        p.slaStatus === 'dang_tham_dinh'
          ? '#f59e0b'
          : p.slaStatus === 'da_tham_dinh'
          ? '#10b981'
          : p.slaStatus === 'qua_han'
          ? '#f43f5e'
          : '#0284c7';

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div style="position: relative; width: 34px; height: 42px; transform: translate(-50%, -100%); cursor: pointer;">
            ${
              isSelected
                ? `<span style="position: absolute; top: 12px; left: 12px; width: 20px; height: 20px; border-radius: 9999px; background: ${color}; opacity: 0.45; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>`
                : ''
            }
            <svg width="34" height="42" viewBox="0 0 34 42" fill="none" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5)); transform: ${
              isSelected ? 'scale(1.2)' : 'scale(1)'
            }; transition: transform 0.2s;">
              <path d="M17 0C7.61 0 0 7.61 0 17C0 27.2 14.62 39.8 15.24 40.34C16.27 41.22 17.73 41.22 18.76 40.34C19.38 39.8 34 27.2 34 17C34 7.61 26.39 0 17 0Z" fill="${color}"/>
              <circle cx="17" cy="17" r="8" fill="#ffffff"/>
              <circle cx="17" cy="17" r="4.5" fill="${color}"/>
            </svg>
          </div>
        `,
        iconSize: [34, 42],
        iconAnchor: [17, 42],
      });

      const marker = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(map);

      // Popup thông tin
      const popupHtml = `
        <div style="font-family: inherit; padding: 2px; min-width: 220px; max-width: 270px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 10px; font-weight: 700; color: #0284c7; font-family: monospace;">${p.code}</span>
            <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${
              p.slaStatus === 'dang_tham_dinh'
                ? '#fef3c7; color: #b45309'
                : p.slaStatus === 'da_tham_dinh'
                ? '#d1fae5; color: #065f46'
                : '#ffe4e6; color: #9f1239'
            }; font-weight: 600;">
              ${
                p.slaStatus === 'dang_tham_dinh'
                  ? 'Đang thẩm định'
                  : p.slaStatus === 'da_tham_dinh'
                  ? 'Đã có kết quả'
                  : 'Quá hạn SLA'
              }
            </span>
          </div>
          <h4 style="font-size: 12px; font-weight: bold; margin: 4px 0 6px 0; color: #0f172a; line-height: 1.35;">${
            p.name
          }</h4>
          <p style="font-size: 11px; margin: 2px 0; color: #475569;"><strong>Chủ đầu tư:</strong> ${
            p.investorName
          }</p>
          <p style="font-size: 11px; margin: 2px 0; color: #475569;"><strong>TMĐT:</strong> <span style="color: #059669; font-weight: bold;">${formatCurrency(
            p.totalInvestment
          )}</span></p>
          <p style="font-size: 10px; margin: 2px 0; color: #64748b;"><strong>Chuyên viên:</strong> ${p.assignee}</p>
          <div style="margin-top: 8px;">
            <button id="popup-btn-open-${p.id}" style="width: 100%; background: #0284c7; color: #fff; border: none; padding: 6px 10px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>Mở Hồ sơ Thẩm định</span>
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        offset: [0, -36],
        className: 'leaflet-custom-popup',
      });

      marker.on('click', () => {
        onSelectProject(p);
      });

      marker.on('popupopen', () => {
        const btn = document.getElementById(`popup-btn-open-${p.id}`);
        if (btn) {
          btn.onclick = () => onOpenDetail(p);
        }
      });

      leafletMarkersRef.current[p.id] = marker;
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [activeEngine, isDark]);

  // Cập nhật TileLayer khi đổi MapType trên Leaflet
  useEffect(() => {
    if (activeEngine !== 'tiles' || !leafletMapRef.current || !leafletTileLayerRef.current) return;
    const googleTileUrls: Record<GoogleMapType, string> = {
      hybrid: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      roadmap: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      satellite: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      terrain: 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    };
    leafletTileLayerRef.current.setUrl(googleTileUrls[mapType]);
  }, [activeEngine, mapType]);

  // ─── 4. BAY TỚI DỰ ÁN ĐƯỢC CHỌN (FLY TO SELECTED PROJECT) ───
  useEffect(() => {
    if (!selectedProject) return;
    const coords = getProjectCoordinates(selectedProject.id, selectedProject.location);

    if (activeEngine === 'sdk' && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: coords.lat, lng: coords.lng });
      googleMapRef.current.setZoom(14);
      const marker = googleMarkersRef.current[selectedProject.id];
      if (marker && googleInfoWindowRef.current) {
        google.maps.event.trigger(marker, 'click');
      }
    } else if (activeEngine === 'tiles' && leafletMapRef.current) {
      leafletMapRef.current.flyTo([coords.lat, coords.lng], 14, {
        duration: 1.2,
      });
      const marker = leafletMarkersRef.current[selectedProject.id];
      if (marker) {
        marker.openPopup();
      }
    }
  }, [selectedProject, activeEngine]);

  // ─── CÁC THAO TÁC ĐIỀU HƯỚNG BẢN ĐỒ ───
  const handleZoomIn = () => {
    if (activeEngine === 'sdk' && googleMapRef.current) {
      googleMapRef.current.setZoom((googleMapRef.current.getZoom() || 11) + 1);
    } else if (activeEngine === 'tiles' && leafletMapRef.current) {
      leafletMapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (activeEngine === 'sdk' && googleMapRef.current) {
      googleMapRef.current.setZoom((googleMapRef.current.getZoom() || 11) - 1);
    } else if (activeEngine === 'tiles' && leafletMapRef.current) {
      leafletMapRef.current.zoomOut();
    }
  };

  const handleRecenter = () => {
    if (activeEngine === 'sdk' && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: DIEN_BIEN_CENTER.lat, lng: DIEN_BIEN_CENTER.lng });
      googleMapRef.current.setZoom(DIEN_BIEN_DEFAULT_ZOOM);
    } else if (activeEngine === 'tiles' && leafletMapRef.current) {
      leafletMapRef.current.flyTo([DIEN_BIEN_CENTER.lat, DIEN_BIEN_CENTER.lng], DIEN_BIEN_DEFAULT_ZOOM);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current?.parentElement) return;
    if (!document.fullscreenElement) {
      containerRef.current.parentElement.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  return (
    <div className={`relative w-full h-full overflow-hidden select-none ${className || ''}`}>
      {/* Khung chứa bản đồ thực tế */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full z-0 bg-slate-950" />

      {/* ─── THANH THAO TÁC NỔI GÓC TRÊN BÊN PHẢI (FLOATING MAP CONTROLS) ─── */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        {/* Nút Zoom & Định vị */}
        <div className="flex flex-col rounded-xl border border-slate-700/80 bg-slate-900/90 backdrop-blur-md shadow-xl overflow-hidden divide-y divide-slate-800 text-white">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Phóng to"
            className="p-2 hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Thu nhỏ"
            className="p-2 hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="Định vị về trung tâm Điện Biên"
            className="p-2 hover:bg-slate-800 transition-colors flex items-center justify-center text-primary-400 cursor-pointer"
          >
            <Navigation size={16} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toàn màn hình"
            className="p-2 hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* La bàn Bắc Nam */}
        <div className="w-9 h-9 rounded-xl border border-slate-700/80 bg-slate-900/90 backdrop-blur-md shadow-xl flex items-center justify-center text-rose-500">
          <Compass size={18} />
        </div>
      </div>

      {/* ─── THANH TRẠNG THÁI TỌA ĐỘ VÀ NGUỒN DỮ LIỆU DƯỚI CHÂN BẢN ĐỒ ─── */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 backdrop-blur-md text-white text-3xs font-mono shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {mouseCoords
              ? `${mouseCoords.lat.toFixed(5)}°N, ${mouseCoords.lng.toFixed(5)}°E`
              : '21.38830°N, 103.02050°E'}
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-300">VN-2000 Điện Biên</span>
        </div>
      </div>

      {/* ─── HUY HIỆU BẢN ĐỒ THẬT GOOGLE MAPS GÓC DƯỚI BÊN PHẢI ─── */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2">
        <div className="px-2.5 py-1 rounded-md bg-slate-900/85 border border-slate-700/70 backdrop-blur-md text-slate-300 text-3xs shadow-md flex items-center gap-1.5">
          <span className="font-semibold text-white">Google Maps</span>
          <span>•</span>
          <span>{activeEngine === 'sdk' ? 'Maps JS SDK' : 'Direct Real Satellite'}</span>
        </div>
      </div>
    </div>
  );
}
