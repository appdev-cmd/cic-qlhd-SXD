import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Box,
  Camera,
  Download,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  MessageSquareWarning,
  RotateCcw,
  Ruler,
  Scissors,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useFilterState } from '../hooks/useFilterState';
import { projectService } from '../services/projectService';
import type { Project } from '../types/project';
import { cn, formatDateTime, formatNumber } from '../lib/utils';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { EntityLink } from '../components/ui/EntityLink';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { GridToolbar, GridSearchInput } from '../components/ui/grid/GridToolbar';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { AuditHistoryTab } from '../components/appraisal/AuditHistoryTab';
import {
  bimService,
  importIfc,
  csvBlob,
  saveBlob,
  type Model,
  type ElementRow,
  type QuantityRow,
  type Note,
  type HistoryRow,
} from '../features/bim/services';
import type { BimViewerRef, BimSelectedElement, BimMeasureMode } from '../features/bim/viewer/types';
import { disciplineLabels, getIfcLabel } from '../features/bim/lib/ifcLabels';

const Viewer = lazy(() => import('../features/bim/components/BimViewer').then((m) => ({ default: m.BimViewer })));
const SuiteWorkspace = lazy(() => import('../features/bim-suite/SxdBimWorkspace').then(m => ({default:m.SxdBimWorkspace})));
const field =
  'w-full rounded-lg border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 p-2 text-sm text-ink dark:text-slate-100';
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Không thể hoàn thành thao tác BIM.');
const disciplines = ['TOAN_THE', 'KIEN_TRUC', 'KET_CAU', 'MEP', 'DIEN', 'CAP_THOAT_NUOC', 'PCCC', 'HA_TANG', 'KHAC'];

export function BimPage() {
  const { mode } = useAuth();
  const [projectId, setProjectId] = useFilterState('bim-project', '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const onSearch = useCallback((value: string) => setSearch(value), []);
  useEffect(() => {
    if(mode!=='cloud')return;
    let alive=true;
    supabase.rpc('sxd_bim_catalog').then(({data,error})=>{
      if(alive&&!error&&data?.length)setProjectId((current:string)=>data.some((p:{target_project_id:string})=>p.target_project_id===current)?current:data[0].target_project_id);
    });
    return()=>{alive=false;};
  },[mode]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      projectService
        .list({ search, limit: 100 })
        .then((page) => {
          if (alive) {
            setProjects(page.items);
            setError('');
          }
        })
        .catch((e) => {
          if (alive) setError(messageOf(e));
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search]);
  useEffect(() => {
    let alive = true;
    setSelected(null);
    if (projectId)
      projectService
        .getById(projectId)
        .then((p) => {
          if (alive) setSelected(p);
        })
        .catch((e) => {
          if (alive) setError(messageOf(e));
        });
    return () => {
      alive = false;
    };
  }, [projectId]);
  const options = [...(selected && !projects.some((p) => p.id === selected.id) ? [selected] : []), ...projects];
  return (
    <div className="space-y-4 text-ink dark:text-slate-100">
      <PageHeader
        title="Mô hình BIM"
        description="Không gian mô hình, cấu kiện và phối hợp thẩm định"
        icon={<Box size={24} />}
      />
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-4">
        <label className="text-sm font-semibold" id="bim-project-label">
          Dự án
        </label>
        <div className="w-full max-w-xl" aria-labelledby="bim-project-label">
          <SearchableSelect
            value={projectId}
            onChange={setProjectId}
            options={options.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))}
            onSearchChange={onSearch}
            placeholder="Tìm và chọn dự án để mở BIM…"
          />
        </div>
        {selected && <EntityLink type="project" id={selected.id} name={selected.name} />}
        <span className="text-xs text-ink-muted dark:text-slate-400">Tối đa 100 kết quả mỗi lần tìm</span>
      </section>
      {error && (
        <p role="alert" className="text-danger-700 dark:text-danger-300">
          {error}
        </p>
      )}
      {selected ? (
        mode==='cloud' ? <ErrorBoundary><Suspense fallback={<p role="status">Đang tải toàn bộ phân hệ BIM…</p>}><SuiteWorkspace key={selected.id} projectId={selected.id} projectName={selected.name}/><details className="mt-4 rounded-xl border border-border bg-surface p-4 dark:border-slate-800 dark:bg-slate-900"><summary className="cursor-pointer font-semibold text-ink dark:text-slate-100">Lịch sử và giải trình AI</summary><AuditHistoryTab projectId={selected.id}/></details></Suspense></ErrorBoundary> : <BimWorkspace key={selected.id} project={selected} />
      ) : (
        <div className="rounded-xl border border-dashed border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-12 text-center">
          <Box size={40} className="mx-auto mb-3 text-primary-600 dark:text-primary-300" />
          <h2 className="font-bold">Chọn dự án để bắt đầu</h2>
          <p className="mt-2 text-sm text-ink-muted dark:text-slate-400">
            Nhập mô hình IFC/IFCZIP, xem 3D, đo đạc và kiểm tra thông tin thiết kế.
          </p>
        </div>
      )}
    </div>
  );
}

export function BimWorkspace({ project }: { project: Project }) {
  const { mode, profile } = useAuth();
  const { theme } = useTheme();
  const canWrite =
    mode === 'demo' || ['officer', 'head_of_department', 'director', 'admin'].includes(profile?.role || '');
  const [models, setModels] = useState<Model[]>([]);
  const [activeId, setActiveId] = useState('');
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [upload, setUpload] = useState(false);
  const [archive, setArchive] = useState<Model | null>(null);
  const [tab, setTab] = useFilterState<'elements' | 'quantities' | 'views' | 'issues' | 'history'>(
    'bim-tab',
    'elements',
  );
  const [filters, setFilters] = useFilterState('bim-elements-' + project.id, { search: '', category: '', storey: '' });
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ElementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [quantities, setQuantities] = useState<QuantityRow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<{ items: HistoryRow[]; total: number }>({ items: [], total: 0 });
  const [historyOffset, setHistoryOffset] = useState(0);
  const [selected, setSelected] = useState<BimSelectedElement | null>(null);
  const [attributes, setAttributes] = useState<Record<string, unknown> | null>(null);
  const [measure, setMeasure] = useState<BimMeasureMode>(null);
  const [ghost, setGhost] = useState(false);
  const [clip, setClip] = useState(false);
  const [clipPercent, setClipPercent] = useState(50);
  const [draft, setDraft] = useState<Partial<Note> | null>(null);
  const [noteRevision, setNoteRevision] = useState(0);
  const viewer = useRef<BimViewerRef>(null);
  const scene = useRef<HTMLDivElement>(null);
  const active = models.find((m) => m.id === activeId);
  const ready = models.filter((m) => m.status === 'ready');
  const visibleModels = ready.filter((m) => visibleIds.includes(m.id));
  const loaded = loadedIds.includes(activeId);
  const act = async (action: () => Promise<unknown>) => {
    try {
      setError('');
      await action();
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const refresh = useCallback(async () => {
    const list = await bimService.models(project.id);
    setModels(list);
    const first = list.find((m) => m.status === 'ready');
    setActiveId((old) => (list.some((m) => m.id === old && m.status === 'ready') ? old : first?.id || ''));
    setVisibleIds((old) => {
      const ids = old.filter((id) => list.some((m) => m.id === id && m.status === 'ready'));
      return ids.length ? ids : first ? [first.id] : [];
    });
  }, [project.id]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    bimService
      .models(project.id)
      .then((list) => {
        if (!alive) return;
        setModels(list);
        const first = list.find((m) => m.status === 'ready');
        setActiveId(first?.id || '');
        setVisibleIds(first ? [first.id] : []);
      })
      .catch((e) => {
        if (alive) setError(messageOf(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [project.id]);
  useEffect(() => {
    setOffset(0);
    setSelected(null);
    setAttributes(null);
    setClip(false);
    setGhost(false);
  }, [activeId]);
  useEffect(() => {
    if (!activeId) {
      setRows([]);
      setTotal(0);
      setQuantities([]);
      setNotes([]);
      return;
    }
    let alive = true;
    Promise.all([bimService.summary(activeId), bimService.notes(activeId)])
      .then(([q, n]) => {
        if (alive) {
          setQuantities(q);
          setNotes(n);
        }
      })
      .catch((e) => {
        if (alive) setError(messageOf(e));
      });
    return () => {
      alive = false;
    };
  }, [activeId, noteRevision]);
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        bimService
          .elements(activeId, { ...filters, offset }, controller.signal)
          .then((p) => {
            setRows(p.items);
            setTotal(p.total);
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(messageOf(e));
          }),
      250,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeId, filters, offset]);
  useEffect(() => {
    if (tab !== 'history') return;
    let alive = true;
    bimService
      .history(project.id, historyOffset)
      .then((data) => {
        if (alive) setHistory(data);
      })
      .catch((e) => {
        if (alive) setError(messageOf(e));
      });
    return () => {
      alive = false;
    };
  }, [project.id, tab, historyOffset, noteRevision, models]);
  useEffect(() => {
    let alive = true;
    setAttributes(null);
    if (selected)
      viewer.current
        ?.getItemAttributes(selected.modelId, selected.expressId)
        .then((data) => {
          if (alive) setAttributes(data);
        })
        .catch((e) => {
          if (alive) setError(messageOf(e));
        });
    return () => {
      alive = false;
    };
  }, [selected]);
  useEffect(() => {
    if (!clip || !loaded) {
      viewer.current?.setClipPlanes([]);
      return;
    }
    const bounds = viewer.current?.getSceneBox();
    if (bounds)
      viewer.current?.setClipPlanes([
        { normal: [0, -1, 0], constant: bounds.min[1] + ((bounds.max[1] - bounds.min[1]) * clipPercent) / 100 },
      ]);
  }, [clip, clipPercent, loaded]);
  const focus = (row: ElementRow) =>
    act(async () => {
      if (!loaded) throw Error('Bật mô hình đang chọn và chờ tải xong trước khi định vị.');
      const ids = await viewer.current!.getLocalIdsByGuids(activeId, [row.global_id]);
      if (!ids.length) throw Error('Cấu kiện này không có hình học trong mô hình.');
      await viewer.current!.flyToElement(activeId, ids[0]);
      setSelected({
        modelId: activeId,
        expressId: ids[0],
        guid: row.global_id,
        name: row.ten_cau_kien || '',
        category: row.loai_cau_kien,
      });
    });
  const columns: DataTableColumn<ElementRow>[] = [
    {
      id: 'name',
      header: 'Cấu kiện',
      cell: (r) => (
        <button
          type="button"
          className="text-left font-semibold text-primary-700 dark:text-primary-300"
          onClick={() => void focus(r)}
        >
          {r.ten_cau_kien || getIfcLabel(r.loai_cau_kien)}
        </button>
      ),
      sortValue: (r) => r.ten_cau_kien,
      width: 280,
    },
    { id: 'category', header: 'Loại', cell: (r) => getIfcLabel(r.loai_cau_kien), sortValue: (r) => r.loai_cau_kien },
    {
      id: 'storey',
      header: 'Tầng / phân đoạn',
      cell: (r) => r.phan_doan_tang || 'Chưa khai báo',
      sortValue: (r) => r.phan_doan_tang,
    },
    { id: 'material', header: 'Vật liệu', cell: (r) => r.vat_lieu || 'Chưa khai báo', sortValue: (r) => r.vat_lieu },
    {
      id: 'volume',
      header: 'Thể tích (m³)',
      cell: (r) => formatNumber(r.the_tich_be_tong, 3),
      sortValue: (r) => r.the_tich_be_tong,
      align: 'right',
    },
    {
      id: 'source',
      header: 'Nguồn khối lượng',
      cell: (r) =>
        r.nguon_khoi_luong === 'hinh_hoc'
          ? 'Ước tính hình học'
          : r.nguon_khoi_luong === 'qto'
            ? 'Qto từ IFC'
            : r.nguon_khoi_luong === 'pset'
              ? 'Thuộc tính Pset'
              : 'Chưa có',
      sortValue: (r) => r.nguon_khoi_luong,
    },
  ];
  const changeFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
  };
  return (
    <div className="space-y-4 text-ink dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <span>
            <strong>{formatNumber(ready.length, 0)}</strong> mô hình sẵn sàng
          </span>
          <span>
            <strong>
              {formatNumber(
                ready.reduce((n, m) => n + m.element_count, 0),
                0,
              )}
            </strong>{' '}
            cấu kiện
          </span>
          <span className="text-ink-muted dark:text-slate-400">{visibleModels.length} mô hình đang bật</span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void act(refresh)} leftIcon={<RotateCcw size={14} />}>
            Tải lại
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setUpload(true)} leftIcon={<Upload size={14} />}>
              Nhập IFC
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900 p-3 text-sm text-danger-800 dark:text-danger-200"
        >
          {error}
          <button type="button" onClick={() => setError('')}>
            Đóng
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-success-700 dark:text-success-300">
          {notice}
        </p>
      )}
      <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside
          className="max-h-[650px] space-y-2 overflow-y-auto rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-3"
          aria-label="Danh sách mô hình BIM"
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Layers size={16} /> Mô hình & phiên bản
          </h2>
          {loading && (
            <p role="status" className="text-sm">
              Đang tải mô hình…
            </p>
          )}
          {!loading && !models.length && (
            <p className="text-sm text-ink-muted dark:text-slate-400">
              Chưa có mô hình. Nhập tệp IFC của dự án để bắt đầu.
            </p>
          )}
          {models.map((m) => (
            <div
              key={m.id}
              className={cn(
                'rounded-lg border p-3',
                m.id === activeId
                  ? 'border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-slate-800'
                  : 'border-border dark:border-slate-800 bg-surface dark:bg-slate-900',
              )}
            >
              <button
                type="button"
                className="w-full break-words text-left text-xs font-bold"
                disabled={m.status !== 'ready'}
                onClick={() => {
                  setActiveId(m.id);
                  setVisibleIds((ids) => (ids.includes(m.id) ? ids : [...ids, m.id]));
                }}
              >
                {m.file_name}
              </button>
              <p className="mt-1 text-2xs text-ink-muted dark:text-slate-400">
                {disciplineLabels[m.discipline]} · v{m.phien_ban} · {formatNumber(m.element_count, 0)} cấu kiện
              </p>
              <p className="mt-1 text-2xs text-ink-muted dark:text-slate-400">{formatDateTime(m.created_at)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {m.status === 'ready' ? (
                  <Tooltip content={visibleIds.includes(m.id) ? 'Ẩn mô hình' : 'Hiện mô hình'}>
                    <button
                      type="button"
                      aria-label={`${visibleIds.includes(m.id) ? 'Ẩn' : 'Hiện'} ${m.file_name}`}
                      onClick={() =>
                        setVisibleIds((ids) => (ids.includes(m.id) ? ids.filter((id) => id !== m.id) : [...ids, m.id]))
                      }
                      className="rounded p-1 text-primary-700 dark:text-primary-300"
                    >
                      {visibleIds.includes(m.id) ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </Tooltip>
                ) : (
                  <span className="text-2xs text-warning-800 dark:text-warning-200">Nhập chưa hoàn tất</span>
                )}
                {m.status === 'ready' && (
                  <Tooltip content="Tải tệp IFC gốc">
                    <button
                      type="button"
                      aria-label={`Tải ${m.file_name}`}
                      className="rounded p-1 text-primary-700 dark:text-primary-300"
                      onClick={() => void act(() => bimService.download(m, 'ifc'))}
                    >
                      <Download size={16} />
                    </button>
                  </Tooltip>
                )}
                {canWrite && (
                  <Tooltip content="Lưu trữ mô hình">
                    <button
                      type="button"
                      aria-label={`Lưu trữ ${m.file_name}`}
                      className="rounded p-1 text-ink-muted dark:text-slate-400"
                      onClick={() => setArchive(m)}
                    >
                      <Archive size={16} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          ))}
        </aside>
        <section
          ref={scene}
          className="relative min-w-0 overflow-hidden rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900"
        >
          <div
            className="flex flex-wrap gap-2 border-b border-border dark:border-slate-800 p-2"
            aria-label="Công cụ mô hình"
          >
            <Tool label="Khớp mô hình" disabled={!loadedIds.length} onClick={() => viewer.current?.fitToModel()}>
              <Maximize2 size={16} />
            </Tool>
            <Tool label="Góc nhìn mặc định" disabled={!loadedIds.length} onClick={() => viewer.current?.setView('iso')}>
              <Box size={16} />
            </Tool>
            <Tool label="Mặt bằng" disabled={!loadedIds.length} onClick={() => viewer.current?.setView('top')}>
              <Layers size={16} />
            </Tool>
            <Tool
              label="Đo khoảng cách"
              active={measure === 'distance'}
              disabled={!loadedIds.length}
              onClick={() => setMeasure(measure === 'distance' ? null : 'distance')}
            >
              <Ruler size={16} />
            </Tool>
            <Tool
              label="Đo diện tích"
              active={measure === 'area'}
              disabled={!loadedIds.length}
              onClick={() => setMeasure(measure === 'area' ? null : 'area')}
            >
              m²
            </Tool>
            <Tool label="Mặt cắt ngang" active={clip} disabled={!loaded} onClick={() => setClip((v) => !v)}>
              <Scissors size={16} />
            </Tool>
            <Tool
              label="Xuyên thấu"
              active={ghost}
              disabled={!loaded}
              onClick={() =>
                void act(async () => {
                  await viewer.current?.setGhostMode(!ghost);
                  setGhost(!ghost);
                })
              }
            >
              <Eye size={16} />
            </Tool>
            <Tool
              label="Hiện lại toàn bộ"
              disabled={!loadedIds.length}
              onClick={() =>
                void act(async () => {
                  await viewer.current?.showAll();
                  viewer.current?.clearMeasurements();
                  setMeasure(null);
                  setClip(false);
                  await viewer.current?.setGhostMode(false);
                  setGhost(false);
                })
              }
            >
              <RotateCcw size={16} />
            </Tool>
            <Tool
              label="Tải ảnh khung nhìn"
              disabled={!loadedIds.length}
              onClick={() =>
                void act(async () => {
                  const url = viewer.current?.captureScreenshot();
                  if (url) saveBlob(await (await fetch(url)).blob(), 'bim-view.png');
                })
              }
            >
              <Camera size={16} />
            </Tool>
            <Tool
              label="Toàn màn hình"
              onClick={() =>
                void act(async () => {
                  if (document.fullscreenElement) await document.exitFullscreen();
                  else await scene.current?.requestFullscreen();
                })
              }
            >
              <Maximize2 size={16} />
            </Tool>
            {canWrite && (
              <>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={!loaded}
                  onClick={() =>
                    setDraft({
                      kind: 'view',
                      name: '',
                      description: '',
                      status: 'open',
                      viewpoint: viewer.current?.getViewpoint() || null,
                    })
                  }
                >
                  Lưu góc nhìn
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={!loaded}
                  leftIcon={<MessageSquareWarning size={14} />}
                  onClick={() =>
                    setDraft({
                      kind: 'issue',
                      name: '',
                      description: '',
                      status: 'open',
                      viewpoint: viewer.current?.getViewpoint() || null,
                    })
                  }
                >
                  Vướng mắc
                </Button>
              </>
            )}
          </div>
          {clip && (
            <label className="flex items-center gap-3 px-3 py-2 text-xs">
              Cao độ mặt cắt{' '}
              <input
                aria-label="Cao độ mặt cắt"
                type="range"
                min={0}
                max={100}
                value={clipPercent}
                onChange={(e) => setClipPercent(Number(e.target.value))}
              />
              {clipPercent}%
            </label>
          )}
          <div className="h-[540px] min-h-0" data-testid="bim-viewer">
            <ErrorBoundary>
              <Suspense
                fallback={
                  <p role="status" className="p-8">
                    Đang tải trình xem BIM 3D…
                  </p>
                }
              >
                <Viewer
                  ref={viewer}
                  models={visibleModels}
                  activeModel={active}
                  measureMode={measure}
                  darkBackground={theme === 'dark'}
                  onElementSelected={setSelected}
                  onModelsLoaded={setLoadedIds}
                  className="h-full w-full"
                />
              </Suspense>
            </ErrorBoundary>
          </div>
          {selected && (
            <div className="max-h-52 overflow-auto border-t border-border dark:border-slate-800 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{selected.name || getIfcLabel(selected.category || '')}</strong>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() =>
                    void act(() => viewer.current!.isolateElements(selected.modelId, [selected.expressId]))
                  }
                >
                  Cô lập
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => void act(() => viewer.current!.hideElements(selected.modelId, [selected.expressId]))}
                >
                  Ẩn
                </Button>
                <button type="button" onClick={() => setSelected(null)} className="text-xs">
                  Đóng thuộc tính
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-2xs text-ink-secondary dark:text-slate-300">
                {attributes ? JSON.stringify(attributes, null, 2) : 'Đang đọc thuộc tính IFC…'}
              </pre>
            </div>
          )}
        </section>
      </div>
      <div
        className="flex flex-wrap gap-2 border-b border-border dark:border-slate-800"
        role="tablist"
        aria-label="Dữ liệu BIM"
      >
        {(
          [
            ['elements', 'Cấu kiện'],
            ['quantities', 'Khối lượng & chất lượng'],
            ['views', 'Góc nhìn'],
            ['issues', 'Vướng mắc'],
            ['history', 'Lịch sử'],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === id}
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-semibold',
              tab === id
                ? 'border-primary-500 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-ink-muted dark:text-slate-400',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'elements' && (
        <div className="space-y-3">
          <GridToolbar
            search={
              <GridSearchInput
                value={filters.search}
                onChange={(v) => changeFilter('search', v)}
                placeholder="Tìm tên cấu kiện, GlobalId…"
              />
            }
            classification={
              <SearchableSelect
                className="min-w-48"
                value={filters.category}
                onChange={(v) => changeFilter('category', v)}
                options={[
                  { value: '', label: 'Tất cả loại cấu kiện' },
                  ...[...new Set(quantities.map((q) => q.category))].map((c) => ({ value: c, label: getIfcLabel(c) })),
                ]}
              />
            }
            period={
              <SearchableSelect
                className="min-w-40"
                value={filters.storey}
                onChange={(v) => changeFilter('storey', v)}
                options={[
                  { value: '', label: 'Tất cả tầng / phân đoạn' },
                  ...[...new Set(quantities.map((q) => q.storey).filter(Boolean))].map((s) => ({ value: s, label: s })),
                ]}
              />
            }
            onReset={() => {
              setFilters({ search: '', category: '', storey: '' });
              setOffset(0);
            }}
            count={<span className="text-xs">{formatNumber(total, 0)} cấu kiện</span>}
          />
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(r) => r.express_id}
            storageKey="bim-elements"
            rowOffset={offset}
            showRowNumbers
            caption="Danh sách cấu kiện BIM"
            emptyMessage="Chọn mô hình sẵn sàng hoặc thay đổi bộ lọc."
          />
          <Pager offset={offset} total={total} size={100} onChange={setOffset} />
          <p className="text-xs text-ink-muted dark:text-slate-400">
            Sắp xếp trong trang hiện tại · Bấm tên cấu kiện để định vị trong mô hình 3D.
          </p>
        </div>
      )}
      {tab === 'quantities' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-muted dark:text-slate-400">
              Khối lượng tổng hợp theo loại và tầng. Giá trị thiếu hiển thị “—”; khối lượng ước tính hình học cần đối
              chiếu hồ sơ thiết kế.
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={!quantities.length}
              onClick={() =>
                saveBlob(
                  csvBlob([
                    ['Loại', 'Tầng', 'Số lượng', 'Thể tích m3', 'Diện tích m2', 'Chiều dài m', 'Thiếu thể tích'],
                    ...quantities.map((q) => [
                      getIfcLabel(q.category),
                      q.storey,
                      q.count,
                      q.volume,
                      q.area,
                      q.length,
                      q.missing_volume,
                    ]),
                  ]),
                  'bim-quantities.csv',
                )
              }
            >
              Xuất CSV
            </Button>
          </div>
          <DataTable
            rows={quantities}
            columns={quantityColumns}
            getRowId={(r) => r.category + ':' + r.storey}
            storageKey="bim-quantities"
            caption="Khối lượng BIM theo loại và tầng"
            emptyMessage="Chưa có dữ liệu khối lượng."
          />
        </div>
      )}
      {(tab === 'views' || tab === 'issues') && (
        <DataTable
          rows={notes.filter((n) => n.kind === (tab === 'views' ? 'view' : 'issue'))}
          columns={[
            {
              id: 'name',
              header: 'Nội dung',
              cell: (n) => (
                <div>
                  <strong>{n.name}</strong>
                  <p className="text-xs text-ink-muted dark:text-slate-400">{n.description}</p>
                </div>
              ),
              sortValue: (n) => n.name,
              width: 350,
            },
            {
              id: 'status',
              header: 'Trạng thái',
              cell: (n) => (n.kind === 'view' ? 'Góc nhìn đã lưu' : n.status === 'resolved' ? 'Đã xử lý' : 'Đang mở'),
              sortValue: (n) => n.status,
            },
            { id: 'date', header: 'Cập nhật', cell: (n) => formatDateTime(n.updatedAt), sortValue: (n) => n.updatedAt },
            {
              id: 'actions',
              header: 'Thao tác',
              cell: (n) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={!loaded || !n.viewpoint}
                    onClick={() => void act(() => viewer.current!.setViewpoint(n.viewpoint!))}
                  >
                    Mở góc nhìn
                  </Button>
                  {canWrite && (
                    <Button size="xs" variant="secondary" onClick={() => setDraft(n)}>
                      Sửa
                    </Button>
                  )}
                </div>
              ),
              width: 260,
            },
          ]}
          storageKey={'bim-' + tab}
          caption={tab === 'views' ? 'Góc nhìn BIM' : 'Vướng mắc BIM'}
          emptyMessage="Chưa có dữ liệu. Lưu góc nhìn hoặc ghi nhận vướng mắc từ khung 3D."
        />
      )}
      {tab === 'history' && (
        <div className="space-y-3">
          <DataTable
            rows={history.items}
            columns={historyColumns}
            storageKey="bim-history"
            caption="Nhật ký BIM"
            emptyMessage="Chưa có thao tác BIM."
          />
          <Pager offset={historyOffset} total={history.total} size={50} onChange={setHistoryOffset} />
          <details className="rounded-xl border border-border dark:border-slate-800 p-4">
            <summary className="cursor-pointer font-semibold">Lịch sử hồ sơ và giải trình AI của dự án</summary>
            <AuditHistoryTab projectId={project.id} />
          </details>
        </div>
      )}
      {upload && (
        <ImportModal
          project={project}
          models={ready}
          onClose={() => setUpload(false)}
          onDone={async (m) => {
            await refresh();
            setActiveId(m.id);
            setVisibleIds((ids) => [...new Set([...ids, m.id])]);
            setUpload(false);
            setNotice('Đã nhập mô hình và kiểm tra dữ liệu thành công.');
          }}
        />
      )}
      {draft && active && (
        <NoteModal
          initial={draft}
          model={active}
          onClose={() => setDraft(null)}
          onDone={() => {
            setDraft(null);
            setNoteRevision((v) => v + 1);
            setNotice('Đã lưu nội dung BIM.');
          }}
        />
      )}
      {archive && (
        <Modal
          heading="Lưu trữ mô hình"
          size="sm"
          onClose={() => setArchive(null)}
          footer={
            <Button
              variant="danger"
              onClick={() =>
                void act(async () => {
                  await bimService.archive(archive);
                  setArchive(null);
                  await refresh();
                })
              }
            >
              Lưu trữ
            </Button>
          }
        >
          <p className="text-sm">
            Lưu trữ mô hình <strong>{archive.file_name}</strong> khỏi danh sách đang sử dụng?
          </p>
        </Modal>
      )}
    </div>
  );
}

function Tool({
  label,
  active,
  children,
  onClick,
  disabled,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs disabled:opacity-40',
          active
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-200'
            : 'border-border dark:border-slate-700 bg-surface dark:bg-slate-800 text-ink dark:text-slate-200',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
function Pager({
  offset,
  total,
  size,
  onChange,
}: {
  offset: number;
  total: number;
  size: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <Button size="xs" variant="secondary" disabled={!offset} onClick={() => onChange(Math.max(0, offset - size))}>
        Trang trước
      </Button>
      <span>
        {total ? offset + 1 : 0}–{Math.min(offset + size, total)} / {formatNumber(total, 0)}
      </span>
      <Button size="xs" variant="secondary" disabled={offset + size >= total} onClick={() => onChange(offset + size)}>
        Trang sau
      </Button>
    </div>
  );
}
const quantityColumns: DataTableColumn<QuantityRow>[] = [
  {
    id: 'category',
    header: 'Loại cấu kiện',
    cell: (r) => getIfcLabel(r.category),
    sortValue: (r) => r.category,
    width: 250,
  },
  { id: 'storey', header: 'Tầng / phân đoạn', cell: (r) => r.storey || 'Chưa khai báo', sortValue: (r) => r.storey },
  ...(
    [
      ['count', 'Số lượng'],
      ['volume', 'Thể tích (m³)'],
      ['area', 'Diện tích (m²)'],
      ['length', 'Chiều dài (m)'],
      ['missing_volume', 'Thiếu thể tích'],
    ] as const
  ).map(([key, label]) => ({
    id: key,
    header: label,
    cell: (r: QuantityRow) => formatNumber(r[key], key === 'count' || key === 'missing_volume' ? 0 : 3),
    sortValue: (r: QuantityRow) => r[key],
    align: 'right' as const,
  })),
];
const historyColumns: DataTableColumn<HistoryRow>[] = [
  { id: 'date', header: 'Thời gian', cell: (r) => formatDateTime(r.at), sortValue: (r) => r.at, width: 180 },
  { id: 'model', header: 'Mô hình', cell: (r) => r.modelName, sortValue: (r) => r.modelName, width: 250 },
  { id: 'actor', header: 'Người thực hiện', cell: (r) => r.actor, sortValue: (r) => r.actor },
  { id: 'action', header: 'Thao tác', cell: (r) => r.action, sortValue: (r) => r.action },
  { id: 'detail', header: 'Nội dung', cell: (r) => r.detail, sortValue: (r) => r.detail, width: 350 },
];

function ImportModal({
  project,
  models,
  onClose,
  onDone,
}: {
  project: Project;
  models: Model[];
  onClose: () => void;
  onDone: (m: Model) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [discipline, setDiscipline] = useState('TOAN_THE');
  const [previous, setPrevious] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const dirty =
    JSON.stringify({ file: file?.name, discipline, previous }) !==
    JSON.stringify({ file: undefined, discipline: 'TOAN_THE', previous: '' });
  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    try {
      const model = await importIfc(project.id, file, discipline, previous, setProgress, controller.current.signal);
      await onDone(model);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      heading="Nhập mô hình IFC"
      size="md"
      dirty={dirty || busy}
      onClose={onClose}
      closeOnBackdrop={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Đóng
          </Button>
          {busy ? (
            <Button variant="danger" onClick={() => controller.current?.abort()}>
              Hủy xử lý
            </Button>
          ) : (
            <Button disabled={!file} onClick={() => void run()}>
              Nhập mô hình
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          <EntityLink type="project" id={project.id} name={project.name} />
        </p>
        <label className="block space-y-2 text-sm font-semibold">
          Tệp IFC / IFCZIP (tối đa 200 MB)
          <input
            aria-label="Tệp IFC"
            type="file"
            accept=".ifc,.ifczip"
            disabled={busy}
            className={field}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <div className="space-y-2">
          <span className="text-sm font-semibold">Bộ môn</span>
          <SearchableSelect
            value={discipline}
            onChange={setDiscipline}
            disabled={busy}
            options={disciplines.map((id) => ({
              value: id,
              label: disciplineLabels[id as keyof typeof disciplineLabels] || id,
            }))}
          />
        </div>
        <div className="space-y-2">
          <span className="text-sm font-semibold">Phiên bản trước</span>
          <SearchableSelect
            value={previous}
            onChange={setPrevious}
            disabled={busy}
            options={[
              { value: '', label: 'Mô hình mới' },
              ...models.map((m) => ({ value: m.id, label: `${m.file_name} · v${m.phien_ban}` })),
            ]}
          />
        </div>
        <p className="text-xs text-ink-muted dark:text-slate-400">
          IFC được chuyển đổi trong trình duyệt. Khối lượng từ hình học được đánh dấu ước tính để đối chiếu với hồ sơ.
        </p>
        {progress && (
          <p role="status" className="text-sm text-primary-700 dark:text-primary-300">
            {progress}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
function NoteModal({
  initial,
  model,
  onClose,
  onDone,
}: {
  initial: Partial<Note>;
  model: Model;
  onClose: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const save = async () => {
    setBusy(true);
    try {
      await bimService.saveNote(model.id, draft);
      onDone();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      heading={draft.kind === 'view' ? 'Lưu góc nhìn BIM' : 'Ghi nhận vướng mắc BIM'}
      size="md"
      dirty={dirty || busy}
      onClose={onClose}
      footer={
        <Button disabled={!draft.name?.trim() || busy} loading={busy} onClick={() => void save()}>
          Lưu
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-2 text-sm">
          Tên nội dung
          <input
            autoFocus
            aria-label="Tên nội dung BIM"
            maxLength={300}
            className={field}
            value={draft.name || ''}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>
        <label className="block space-y-2 text-sm">
          Mô tả
          <textarea
            aria-label="Mô tả BIM"
            maxLength={5000}
            className={field}
            rows={4}
            value={draft.description || ''}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </label>
        {draft.kind === 'issue' && (
          <SearchableSelect
            value={draft.status}
            onChange={(v) => setDraft((d) => ({ ...d, status: v as Note['status'] }))}
            options={[
              { value: 'open', label: 'Đang mở' },
              { value: 'resolved', label: 'Đã xử lý' },
            ]}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
