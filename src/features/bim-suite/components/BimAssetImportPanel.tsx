import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Asset register from the model: preview MEP equipment elements (IFC class, manufacturer, model, serial, system,
// floor/space) → select → import without duplicates; report of MEP elements without an asset; CSV export/import with
// minimal COBie columns; COBie 2.4 (reduced) .xlsx export; sync floors/spaces from IFC.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileUp, Layers, Loader2, Upload } from 'lucide-react';
import { useAuth } from '../adapters/context';
import { FacilityOpsService, type CsvImportResult, type IfcAssetCandidate } from '../services/FacilityOpsService';
import type { FacilityAsset } from '../services/facilityAssetService';
import type { BimModel } from '../types/bim.types';
import { useFacilityFloors, useFacilitySpaces } from '../hooks/useFacilityOps';
import { assetsToCobieCsv, csvToAssetRows, downloadBlob, missingAssetsCsv } from '../lib/facilityCsv';
import { getIfcLabel } from '../lib/ifcLabels';
import { buildCobieWorkbook } from '../lib/cobieWorkbook';
import { XLSX_MIME } from '../lib/xlsxWrite';

const OPTIONAL_CLASSES = [
  { id: 'IFCAIRTERMINAL', label: 'Miệng gió' },
  { id: 'IFCFIRESUPPRESSIONTERMINAL', label: 'Đầu phun chữa cháy' },
  { id: 'IFCLIGHTFIXTURE', label: 'Đèn' },
  { id: 'IFCSANITARYTERMINAL', label: 'Thiết bị vệ sinh' },
  { id: 'IFCTRANSPORTELEMENT', label: 'Thang máy' },
];
const DEFAULT_CLASSES = [
  'IFCUNITARYEQUIPMENT',
  'IFCELECTRICDISTRIBUTIONBOARD',
  'IFCCHILLER',
  'IFCTANK',
  'IFCFAN',
  'IFCPUMP',
  'IFCBOILER',
  'IFCCOOLINGTOWER',
  'IFCAIRTOAIRHEATRECOVERY',
  'IFCCOMPRESSOR',
  'IFCCONDENSER',
  'IFCEVAPORATOR',
  'IFCHEATEXCHANGER',
  'IFCHUMIDIFIER',
  'IFCELECTRICGENERATOR',
  'IFCTRANSFORMER',
  'IFCELECTRICMOTOR',
  'IFCENGINE',
  'IFCSWITCHINGDEVICE',
  'IFCPROTECTIVEDEVICE',
  'IFCCONTROLLER',
  'IFCALARM',
  'IFCSENSOR',
  'IFCVALVE',
  'IFCFLOWMETER',
  'IFCSOLARDEVICE',
  'IFCBURNER',
  'IFCMEDICALDEVICE',
];
const MATCH_LABELS: Record<string, string> = {
  guid: 'Đã có tài sản',
  guid_other_model: 'GUID đã gắn ở phiên bản khác',
  code: 'Trùng mã tài sản',
};
const key = (row: Pick<IfcAssetCandidate, 'model_id' | 'global_id'>) => `${row.model_id}:${row.global_id}`;
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const primary =
  'rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50';
const chip = (active: boolean) =>
  `rounded-full border px-2 py-1 ${active ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200' : 'border-border text-txt-muted dark:border-slate-600'}`;
const fileSlug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'du-an';

interface Props {
  projectId: string;
  projectName?: string;
  canWrite?: boolean;
  models: BimModel[];
  assets: FacilityAsset[];
  onLocateGuid?: (guid: string) => void;
}

export const BimAssetImportPanel: React.FC<Props> = ({
  projectId,
  projectName,
  canWrite,
  models,
  assets,
  onLocateGuid,
}) => {
  const cache = useQueryClient();
  const { currentUser } = useAuth();
  const floors = useFacilityFloors(projectId);
  const spaces = useFacilitySpaces(projectId);
  const [model, setModel] = useState<string>('');
  const [extra, setExtra] = useState<string[]>([]);
  const [view, setView] = useState<'new' | 'existing' | 'all'>('new');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [csv, setCsv] = useState<{
    name: string;
    rows: Record<string, string | number | null>[];
    unknown: string[];
    check?: CsvImportResult;
  } | null>(null);
  const classes = useMemo(() => [...DEFAULT_CLASSES, ...extra], [extra]);
  const preview = useQuery({
    queryKey: ['facility-ifc-candidates', projectId, model || 'all', classes.join(',')],
    queryFn: () => FacilityOpsService.ifcCandidates(projectId, model || null, classes),
    enabled: !!projectId,
    staleTime: 30000,
  });
  const rows = useMemo(() => preview.data || [], [preview.data]);
  const fresh = useMemo(() => rows.filter((row) => !row.match), [rows]);
  const shown = view === 'new' ? fresh : view === 'existing' ? rows.filter((row) => row.match) : rows;
  const slug = fileSlug(projectName || projectId);

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ tone: 'ok', text: await task() });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Thao tác không thành công' });
    } finally {
      setBusy(null);
    }
  };
  const refreshAssets = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['bim-facility-assets', projectId] }),
      cache.invalidateQueries({ queryKey: ['facility-ifc-candidates', projectId] }),
      cache.invalidateQueries({ queryKey: ['facility-floors', projectId] }),
      cache.invalidateQueries({ queryKey: ['facility-spaces', projectId] }),
    ]);
  };
  const importSelected = () =>
    run('import', async () => {
      const items = fresh
        .filter((row) => selected.has(key(row)))
        .map((row) => ({
          model_id: row.model_id,
          global_id: row.global_id,
          asset_code: row.suggested_code,
          category: row.suggested_category,
        }));
      if (!items.length) throw new Error('Chọn ít nhất một cấu kiện chưa có tài sản.');
      const result = await FacilityOpsService.importIfc(projectId, items);
      setSelected(new Set());
      await refreshAssets();
      return `Đã thêm ${result.them_moi} tài sản; bỏ qua ${result.bo_qua.length}.${
        result.bo_qua.length ? ` Lý do: ${[...new Set(result.bo_qua.map((s) => s.ly_do))].slice(0, 3).join('; ')}.` : ''
      }`;
    });
  const readCsv = async (file: File) => {
    setMessage(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Tệp CSV tối đa 5 MB.');
      const parsed = csvToAssetRows(await file.text());
      if (!parsed.rows.length) throw new Error('Tệp không có dòng dữ liệu.');
      const check = await FacilityOpsService.importCsv(projectId, parsed.rows, `Nhập sổ tài sản từ ${file.name}`, true);
      setCsv({ name: file.name, rows: parsed.rows, unknown: parsed.unknownColumns, check });
    } catch (e) {
      setCsv(null);
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Không đọc được tệp CSV' });
    }
  };
  const toggleAll = (on: boolean) => setSelected(on ? new Set(fresh.map(key)) : new Set());
  const exportCobie = () =>
    run('cobie', async () => {
      const plans = await FacilityOpsService.plans(projectId);
      const bytes = await buildCobieWorkbook({
        projectId,
        projectName: projectName || projectId,
        createdBy: currentUser?.email || currentUser?.name || 'BuildSIA',
        createdOn: new Date().toISOString().slice(0, 19),
        assets,
        floors: floors.data ?? [],
        spaces: spaces.data ?? [],
        plans,
      });
      downloadBlob(`COBie_${slug}.xlsx`, bytes as BlobPart, XLSX_MIME);
      return `Đã xuất COBie: ${assets.length} thành phần, ${plans.length} công việc bảo trì (7 sheet: Facility, Floor, Space, Type, Component, System, Job).`;
    });

  return (
    <section aria-label="Sổ tài sản từ mô hình" className="space-y-3 text-xs text-txt-secondary dark:text-slate-200">
      <header className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-primary-600" />
        <h3 className="font-semibold text-txt-primary dark:text-white">Sổ tài sản từ mô hình IFC</h3>
        <span className="flex-1" />
        {canWrite && (
          <button
            type="button"
            disabled={!!busy}
            className={btn}
            onClick={() =>
              void run('sync', async () => {
                const result = await FacilityOpsService.syncLocations(projectId);
                await refreshAssets();
                return `Đồng bộ ${result.tang} tầng, ${result.khong_gian} không gian; cập nhật vị trí ${result.tai_san} tài sản.`;
              })
            }
          >
            {busy === 'sync' ? 'Đang đồng bộ…' : 'Đồng bộ tầng/không gian'}
          </button>
        )}
      </header>
      <p className="text-2xs text-txt-muted">
        {floors.data?.length ?? 0} tầng · {spaces.data?.length ?? 0} không gian lấy từ IfcBuildingStorey/IfcSpace. Nhập
        theo mô hình + GUID: cấu kiện đã có tài sản luôn bị bỏ qua.
      </p>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? 'text-rose-600' : 'text-emerald-700'}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <BimSelect
          aria-label="Mô hình nguồn"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setSelected(new Set());
          }}
          className="rounded-lg border border-border bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="">Mọi mô hình</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.file_name}
            </option>
          ))}
        </BimSelect>
        {OPTIONAL_CLASSES.map((item) => (
          <label key={item.id} className="flex items-center gap-1">
            <BimInput
              type="checkbox"
              checked={extra.includes(item.id)}
              onChange={(e) => {
                setExtra(e.target.checked ? [...extra, item.id] : extra.filter((x) => x !== item.id));
                setSelected(new Set());
              }}
            />
            {item.label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Lọc kết quả xem trước">
        {(
          [
            ['new', `Chưa có tài sản (${fresh.length})`],
            ['existing', `Đã có (${rows.length - fresh.length})`],
            ['all', `Tất cả (${rows.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={chip(view === id)}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          disabled={!fresh.length}
          className={btn}
          onClick={() => downloadBlob(`Cau-kien-MEP-chua-co-tai-san_${slug}.csv`, missingAssetsCsv(fresh))}
        >
          <Download className="h-3 w-3" />
          Báo cáo chưa có tài sản
        </button>
      </div>
      {preview.isLoading ? (
        <p className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang đọc cấu kiện thiết bị…
        </p>
      ) : preview.error ? (
        <p role="alert" className="text-rose-600">
          {preview.error.message}
        </p>
      ) : !shown.length ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-txt-muted">
          {rows.length
            ? 'Không có cấu kiện trong nhóm này.'
            : 'Không tìm thấy cấu kiện thiết bị MEP trong các mô hình đang có.'}
        </p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border border-border dark:border-slate-700">
          <BimTable className="w-full table-fixed text-2xs">
            <thead className="sticky top-0 bg-bg-subtle text-left text-2xs uppercase text-txt-muted dark:bg-slate-900">
              <tr>
                <th className="w-7 p-1">
                  {canWrite && view !== 'existing' && (
                    <BimInput
                      type="checkbox"
                      aria-label="Chọn tất cả cấu kiện chưa có tài sản"
                      checked={!!fresh.length && selected.size === fresh.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  )}
                </th>
                <th className="p-1">Cấu kiện</th>
                <th className="w-[22%] p-1">Hệ thống</th>
                <th className="w-[20%] p-1">Vị trí</th>
                <th className="w-[22%] p-1">Hãng · model · serial</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 500).map((row) => (
                <tr key={key(row)} className="border-t border-border align-top dark:border-slate-700">
                  <td className="p-1">
                    {!row.match && canWrite && (
                      <BimInput
                        type="checkbox"
                        aria-label={`Chọn ${row.name}`}
                        checked={selected.has(key(row))}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(key(row));
                          else next.delete(key(row));
                          setSelected(next);
                        }}
                      />
                    )}
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      className="block text-left font-semibold text-txt-primary hover:text-primary-600 dark:text-white"
                      onClick={() => onLocateGuid?.(row.global_id)}
                    >
                      {row.name}
                    </button>
                    <span className="block text-2xs text-txt-muted">
                      {getIfcLabel(row.ifc_class)} · {row.suggested_category} · mã{' '}
                      {row.existing_asset_code || row.suggested_code}
                    </span>
                    {row.match && <span className="block text-2xs text-amber-700">{MATCH_LABELS[row.match]}</span>}
                  </td>
                  <td className="p-1">{row.system_name || '—'}</td>
                  <td className="p-1">
                    {row.floor_label || '—'}
                    {row.space_name ? ` · ${row.space_name}` : ''}
                  </td>
                  <td className="p-1">
                    {[row.manufacturer, row.model_label, row.serial_number].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </BimTable>
          {shown.length > 500 && (
            <p className="p-2 text-2xs text-txt-muted">
              Hiển thị 500/{shown.length} dòng; lọc theo mô hình để xem hết.
            </p>
          )}
        </div>
      )}
      {canWrite && (
        <button
          type="button"
          disabled={!!busy || !selected.size}
          className={`${primary} w-full py-2`}
          onClick={() => void importSelected()}
        >
          {busy === 'import' ? 'Đang nhập…' : `Nhập ${selected.size} tài sản vào sổ`}
        </button>
      )}

      <div className="space-y-2 rounded-xl border border-border p-3 dark:border-slate-700">
        <p className="font-semibold text-txt-primary dark:text-white">Bàn giao theo COBie</p>
        <p className="text-2xs text-txt-muted">
          CSV một bảng để nhập lại; bảng tính 7 sheet theo COBie 2.4 rút gọn để chuyển sang phần mềm quản lý vận hành
          (chưa có Contact, Zone, Document, Attribute).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!assets.length}
            className={btn}
            onClick={() => downloadBlob(`So-tai-san_${slug}.csv`, assetsToCobieCsv(assets, floors.data, spaces.data))}
          >
            <Download className="h-3 w-3" />
            Xuất {assets.length} tài sản (.csv)
          </button>
          <button
            type="button"
            disabled={!assets.length || busy === 'cobie'}
            className={btn}
            onClick={() => void exportCobie()}
          >
            <FileSpreadsheet className="h-3 w-3" />
            Xuất COBie (.xlsx)
          </button>
          {canWrite && (
            <label className={`${btn} cursor-pointer`}>
              <FileUp className="h-3 w-3" />
              Chọn tệp CSV để nhập
              <BimInput
                aria-label="Tệp CSV sổ tài sản"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void readCsv(file);
                }}
              />
            </label>
          )}
        </div>
        {csv && (
          <div className="space-y-1">
            <p>
              {csv.name}: {csv.rows.length} dòng · kiểm tra: {csv.check?.them_moi ?? 0} thêm mới,{' '}
              {csv.check?.cap_nhat ?? 0} cập nhật{csv.unknown.length ? ` · bỏ qua cột ${csv.unknown.join(', ')}` : ''}.
            </p>
            {csv.check?.loi.length ? (
              <ul role="alert" className="max-h-32 overflow-auto text-rose-600">
                {csv.check.loi.map((error) => (
                  <li key={error.dong}>
                    Dòng {error.dong + 1}
                    {error.ma ? ` (${error.ma})` : ''}: {error.loi}
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                className={`${primary} inline-flex items-center gap-1`}
                onClick={() =>
                  void run('csv', async () => {
                    const result = await FacilityOpsService.importCsv(
                      projectId,
                      csv.rows,
                      `Nhập sổ tài sản từ ${csv.name}`,
                      false,
                    );
                    if (!result.da_ghi)
                      throw new Error(
                        `Không ghi được: ${result.loi
                          .map((e) => `dòng ${e.dong + 1}: ${e.loi}`)
                          .slice(0, 3)
                          .join('; ')}`,
                      );
                    setCsv(null);
                    await refreshAssets();
                    return `Đã nhập CSV: ${result.them_moi} thêm mới, ${result.cap_nhat} cập nhật.`;
                  })
                }
              >
                <Upload className="h-3 w-3" />
                Ghi vào sổ tài sản
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
