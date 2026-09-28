import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiRequest, type Page } from '../../services/apiClient';
import { EntityLink } from '../ui/EntityLink';
import { DossierGrid } from './DossierGrid';
import { useFilterState } from '../../hooks/useFilterState';
import { useTheme, PRIMARY_COLORS } from '../../context/ThemeContext';
import { useEntityPanel } from '../../hooks/useEntityPanel';
import { Tooltip } from '../ui/Tooltip';
import { Compass, Map as MapIcon, MapPinned, Satellite } from 'lucide-react';
import { GridSearchInput } from '../ui/grid/GridToolbar';

type Point = {
  id: string;
  title: string;
  code: string;
  lat: number | null;
  lng: number | null;
  location_district: string;
};
type BaseLayer = 'offline' | 'esri-street' | 'esri-satellite';
type TileState = 'loading' | 'ready' | 'unavailable';

const mapPoints = (items: Point[]) =>
  items.flatMap((point): { project: Point; position: L.LatLngTuple }[] => {
    if (point.lat == null || point.lng == null) return [];
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? [{ project: point, position: [lat, lng] }]
      : [];
  });

const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri — Sources: Esri, DeLorme, HERE, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), MapmyIndia, TomTom';
const ESRI_IMAGERY_ATTRIBUTION = 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export function ProjectMap() {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const backgroundLayerRef = useRef<L.Layer | null>(null);
  const projectLayerRef = useRef<L.LayerGroup | null>(null);
  const { primaryColor } = useTheme();
  const { open } = useEntityPanel();
  const openEntity = useRef(open);
  openEntity.current = open;
  const [data, setData] = useState<Page<Point> | null>(null);
  const [search, setSearch] = useFilterState('map-search', '');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [tiles, setTiles] = useState<TileState>('loading');
  const [mapVersion, setMapVersion] = useState(0);
  const [base, setBase] = useFilterState<BaseLayer>('map-base-v2', 'esri-street');
  const [fallbackNotice, setFallbackNotice] = useState('');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      apiRequest<Page<Point>>('/projects?' + new URLSearchParams({ search, offset: String(offset), limit: '50' }))
        .then((result) => {
          if (active) {
            setData(result);
            setError('');
          }
        })
        .catch((cause) => {
          if (active) setError(cause.message);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, offset]);

  const projectsOnMap = useMemo(() => mapPoints(data?.items ?? []), [data]);
  const coordinates = useMemo(() => projectsOnMap.map((item) => item.position), [projectsOnMap]);

  // Create the Leaflet map once; base-layer changes should preserve zoom and map state.
  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, { zoomControl: false, preferCanvas: true }).setView([21.3883, 103.0205], 9);
    mapRef.current = map;
    L.control.zoom({ position: 'topleft' }).addTo(map);
    projectLayerRef.current = L.layerGroup().addTo(map);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(host.current);
    const resizeTimer = setTimeout(() => map.invalidateSize(), 80);
    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      backgroundLayerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      backgroundLayerRef.current = null;
      projectLayerRef.current = null;
    };
  }, []);

  // Replace only the background layer and fall back to the bundled offline geography on failure.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let active = true;
    let loaded = false;
    let tileErrors = 0;
    let timeout: ReturnType<typeof setTimeout>;
    backgroundLayerRef.current?.remove();
    backgroundLayerRef.current = null;
    setTiles('loading');

    const markReady = () => {
      loaded = true;
      clearTimeout(timeout);
      if (active) setTiles('ready');
    };
    const fallbackOffline = () => {
      if (!active || base === 'offline') return;
      clearTimeout(timeout);
      setFallbackNotice('Không tải được nền Esri; đã chuyển sang bản đồ địa lý ngoại tuyến.');
      setBase('offline');
    };

    if (base === 'offline') {
      fetch('/maps/regional-context.geojson')
        .then((response) => {
          if (!response.ok) throw new Error('Không tải được dữ liệu nền ngoại tuyến.');
          return response.json();
        })
        .then((geojson) => {
          if (!active) return;
          const layer = L.geoJSON(geojson, {
            style: (feature) => {
              const isVietnam = feature?.properties?.code === 'VNM';
              return {
                color: isVietnam ? '#0e7490' : '#64748b',
                weight: isVietnam ? 2 : 1,
                opacity: isVietnam ? 0.95 : 0.55,
                fillColor: isVietnam ? '#38bdf8' : '#94a3b8',
                fillOpacity: isVietnam ? 0.22 : 0.12,
              };
            },
            interactive: false,
            attribution: 'Nền khái quát: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain)',
          })
            .addTo(map)
            .bringToBack();
          backgroundLayerRef.current = layer;
          markReady();
        })
        .catch(() => {
          if (active) setTiles('unavailable');
        });
    } else {
      const imagery = base === 'esri-satellite';
      const attribution = imagery ? ESRI_IMAGERY_ATTRIBUTION : ESRI_ATTRIBUTION;
      const url = imagery
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
      const layer = L.tileLayer(url, { attribution, maxZoom: 19, crossOrigin: true });
      backgroundLayerRef.current = layer;
      layer.on('tileload', markReady);
      layer.on('tileerror', () => {
        tileErrors += 1;
        if (tileErrors >= 3) fallbackOffline();
      });
      layer.addTo(map);
      timeout = setTimeout(() => {
        if (!loaded) fallbackOffline();
      }, 6000);
    }

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [base, mapVersion, setBase]);

  // Update markers independently so searching does not rebuild the basemap.
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = projectLayerRef.current;
    if (!map || !layerGroup) return;
    layerGroup.clearLayers();
    const markerColor = PRIMARY_COLORS.find((color) => color.id === primaryColor)?.hex ?? '#00668c';

    projectsOnMap.forEach(({ project, position }) => {
      const details = document.createElement('div');
      details.className = 'project-map-popup';
      const title = document.createElement('strong');
      title.textContent = project.title;
      details.append(title);
      const code = document.createElement('div');
      code.textContent = project.code;
      details.append(code);
      if (project.location_district) {
        const location = document.createElement('div');
        location.textContent = project.location_district;
        details.append(location);
      }
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'project-map-popup-action';
      action.textContent = 'Mở hồ sơ dự án';
      action.addEventListener('click', () => openEntity.current('project', { id: project.id, name: project.title }));
      details.append(action);

      L.circleMarker(position, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: markerColor,
        fillOpacity: 0.95,
      })
        .bindPopup(details, { maxWidth: 280 })
        .addTo(layerGroup);
    });

    if (coordinates.length > 1) map.fitBounds(coordinates, { padding: [42, 42], maxZoom: 12 });
    else if (coordinates.length === 1) map.setView(coordinates[0], 12);
  }, [projectsOnMap, coordinates, primaryColor]);

  const button =
    'inline-flex items-center justify-center rounded-lg border border-border dark:border-border bg-surface dark:bg-slate-800 text-ink-secondary dark:text-ink-secondary transition-colors';
  const selectedButton =
    'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-slate-700 dark:text-primary-300';

  const fitProjects = () => {
    const map = mapRef.current;
    if (!map || coordinates.length === 0) return;
    if (coordinates.length === 1) map.setView(coordinates[0], 12);
    else map.fitBounds(coordinates, { padding: [42, 42], maxZoom: 12 });
  };

  return (
    <div className="space-y-4 text-ink dark:text-ink">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bản đồ dự án</h1>
          <p className="mt-1 max-w-5xl text-sm text-ink-muted dark:text-ink-muted">
            Vị trí lấy từ tọa độ đang lưu trong hệ thống. Chưa có lớp quy hoạch được cơ quan có thẩm quyền xác nhận; bản
            đồ này không kết luận phù hợp quy hoạch.
          </p>
        </div>
        <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800 dark:border-slate-700 dark:bg-slate-800 dark:text-primary-300">
          {data?.total ?? 0} dự án
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <GridSearchInput
          className="flex-1 sm:w-auto"
          label="Tìm dự án trên bản đồ"
          placeholder="Tìm tên, mã dự án, địa bàn…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setOffset(0);
          }}
        />
        <div
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-subtle p-1 dark:border-border dark:bg-slate-800"
          aria-label="Kiểu nền bản đồ"
        >
          <Tooltip content="Nền địa lý ngoại tuyến, dùng được khi không có Internet" placement="top">
            <button
              type="button"
              aria-label="Nền ngoại tuyến"
              aria-pressed={base === 'offline'}
              onClick={() => {
                setFallbackNotice('');
                setBase('offline');
              }}
              className={`${button} h-9 w-10 ${base === 'offline' ? selectedButton : 'border-transparent bg-transparent hover:bg-surface dark:hover:bg-slate-700'}`}
            >
              <MapIcon size={17} />
            </button>
          </Tooltip>
          <Tooltip content="Đường phố Esri, có nhãn địa danh" placement="top">
            <button
              type="button"
              aria-label="Đường phố Esri"
              aria-pressed={base === 'esri-street'}
              onClick={() => {
                setFallbackNotice('');
                setBase('esri-street');
              }}
              className={`${button} h-9 w-10 ${base === 'esri-street' ? selectedButton : 'border-transparent bg-transparent hover:bg-surface dark:hover:bg-slate-700'}`}
            >
              <MapPinned size={17} />
            </button>
          </Tooltip>
          <Tooltip content="Ảnh vệ tinh Esri" placement="top">
            <button
              type="button"
              aria-label="Ảnh vệ tinh Esri"
              aria-pressed={base === 'esri-satellite'}
              onClick={() => {
                setFallbackNotice('');
                setBase('esri-satellite');
              }}
              className={`${button} h-9 w-10 ${base === 'esri-satellite' ? selectedButton : 'border-transparent bg-transparent hover:bg-surface dark:hover:bg-slate-700'}`}
            >
              <Satellite size={17} />
            </button>
          </Tooltip>
        </div>
      </div>

      {(fallbackNotice || tiles === 'unavailable') && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-slate-800 dark:text-amber-200"
        >
          <span>{fallbackNotice || 'Không tải được dữ liệu nền. Có thể tiếp tục xem vị trí và danh sách dự án.'}</span>
          <button
            type="button"
            className={`${button} px-3 py-1.5`}
            onClick={() => {
              setFallbackNotice('');
              setMapVersion((version) => version + 1);
            }}
          >
            Thử tải lại nền
          </button>
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-border bg-sky-50 dark:border-slate-700 dark:bg-slate-900">
        <div ref={host} className="project-map-canvas z-0" aria-label="Bản đồ vị trí dự án" />
        <Tooltip content="Căn khung bản đồ vào các dự án đang hiển thị" placement="left">
          <button
            type="button"
            aria-label="Căn bản đồ vào các dự án"
            className={`${button} absolute right-3 top-3 z-[500] h-10 w-10 bg-surface shadow-md dark:bg-slate-800`}
            onClick={fitProjects}
          >
            <Compass size={17} />
          </button>
        </Tooltip>
        {tiles === 'loading' && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-full border border-border bg-surface/95 px-3 py-1 text-xs text-ink-secondary shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-ink-secondary">
            Đang tải nền bản đồ…
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted dark:text-ink-muted">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border-2 border-white bg-primary-600 shadow-sm dark:border-slate-900" />
          <span>{coordinates.length} vị trí có tọa độ trong trang này</span>
          {data && data.items.length > coordinates.length && (
            <span>· {data.items.length - coordinates.length} dự án chưa có tọa độ</span>
          )}
        </div>
        {base === 'offline' && <span>Nền tham khảo Natural Earth · không phải địa giới hoặc quy hoạch chính thức</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <DossierGrid
        storageKey="map-projects"
        rows={data?.items || []}
        columns={[
          {
            label: 'Dự án',
            value: (row) => row.title,
            width: 400,
            render: (row) => <EntityLink type="project" id={row.id} name={row.title} />,
          },
          { label: 'Mã', value: (row) => row.code },
          { label: 'Địa điểm', value: (row) => row.location_district, width: 260 },
          {
            label: 'Tọa độ',
            value: (row) => (row.lat != null && row.lng != null ? `${row.lat}, ${row.lng}` : 'Chưa có tọa độ'),
          },
        ]}
      />
      <div className="flex gap-3">
        <button
          type="button"
          className={`${button} px-3 py-2 text-sm`}
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Trang trước
        </button>
        <button
          type="button"
          className={`${button} px-3 py-2 text-sm`}
          disabled={offset + 50 >= (data?.total || 0)}
          onClick={() => setOffset(offset + 50)}
        >
          Trang sau
        </button>
      </div>
    </div>
  );
}
