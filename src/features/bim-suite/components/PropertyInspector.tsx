import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/PropertyInspector.tsx
// Bảng thông số kỹ thuật, vật liệu & bóc tách khối lượng cấu kiện BIM (CV 3219 Mục 14)
// Tìm trong thuộc tính (không phân biệt dấu), ghim một cấu kiện để so sánh cạnh nhau với cấu kiện đang chọn,
// và "chọn tương tự" (cùng loại / vật liệu / tầng / kiểu) qua callback onSelectSimilar.

import React, { useState } from 'react';
import {
  Info,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  AlertTriangle,
  Copy,
  Check,
  Cuboid,
  Layers,
  Loader2,
  Palette,
  Tag,
  Search,
  Pin,
  PinOff,
  GitCompare,
  X,
  MousePointerClick,
} from 'lucide-react';
import { BimElementLinks } from './BimElementLinks';
import { BimElement, BimPropertyGroup } from '@/features/bim-suite/types/bim.types';
import { getIfcLabel } from '../lib/ifcLabels';
import {
  buildSelectSimilar,
  compareElements,
  filterPropertyGroup,
  formatPropertyValue,
  propertyMatcher,
  SIMILAR_FIELD_LABEL,
  type PropertyMatcher,
  type SelectSimilarCriteria,
  type SimilarField,
} from '../lib/propertyTools';

interface PropertyInspectorProps {
  element: BimElement | null;
  /** Thuộc tính đọc trực tiếp từ mô hình 3D khi CSDL chưa có cấu kiện */
  fallbackAttributes?: Record<string, unknown> | null;
  isLoading?: boolean;
  onOpenAcceptance?: (guid: string) => void;
  onCreateIssue?: (element: BimElement) => void;
  /** Bật mục "Hồ sơ liên kết" khi có projectId */
  projectId?: string;
  modelId?: string;
  canEdit?: boolean;
  currentUserName?: string;
  className?: string;
  /** "Chọn tương tự": bên gọi lọc cấu kiện theo `criteria.conditions` và chọn trên khung 3D */
  onSelectSimilar?: (criteria: SelectSimilarCriteria) => void;
  /** Cấu kiện để so sánh (ưu tiên hơn cấu kiện đã ghim trong bảng) */
  compareWith?: BimElement | null;
}

const formatNumberVN = (val: number | null | undefined, unit = ''): string => {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  const formatted = formatNumber(val, 3);
  return unit ? `${formatted} ${unit}` : formatted;
};

const formatValue = formatPropertyValue;

const Section: React.FC<{
  id: string;
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, icon, open, onToggle, badge, children }) => (
  <div className="pt-3 first:pt-0">
    <button
      onClick={() => onToggle(id)}
      className="w-full flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200 mb-2"
    >
      <span className="flex items-center gap-2 text-left">
        {icon}
        {title}
        {badge}
      </span>
      {open ? (
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      ) : (
        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
      )}
    </button>
    {open && children}
  </div>
);

const KeyValueList: React.FC<{ values: BimPropertyGroup; match?: PropertyMatcher | null }> = ({ values, match }) => (
  <div className="space-y-0.5 text-xs">
    {Object.entries(values)
      .filter(([k, v]) => !match || match(k, v))
      .map(([k, v]) => (
        <div
          key={k}
          className="flex justify-between gap-3 py-1 border-b border-slate-100 dark:border-slate-700 last:border-0"
        >
          <span className="text-slate-500 dark:text-slate-400 break-words min-w-0">{k}</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium text-right break-words min-w-0 max-w-[60%]">
            {formatValue(v)}
          </span>
        </div>
      ))}
  </div>
);

/** Danh sách các Pset/Qto, mỗi bộ thu gọn được */
const PropertyGroups: React.FC<{ groups: Record<string, BimPropertyGroup>; match?: PropertyMatcher | null }> = ({
  groups,
  match,
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const shown = Object.entries(groups)
    .map(([name, values]) => [name, filterPropertyGroup(name, values, match ?? null) as BimPropertyGroup] as const)
    .filter(([, values]) => !match || Object.keys(values).length > 0);
  if (match && shown.length === 0) return <p className="text-2xs text-slate-400 italic">Không có thuộc tính khớp.</p>;
  return (
    <div className="space-y-1.5">
      {shown.map(([name, values]) => {
        const isOpen = match ? true : (open[name] ?? true);
        return (
          <div
            key={name}
            className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900"
          >
            <button
              onClick={() => setOpen((p) => ({ ...p, [name]: !isOpen }))}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-2xs font-semibold text-slate-600 dark:text-slate-300"
            >
              <span className="truncate font-mono">{name}</span>
              <span className="flex items-center gap-1 text-slate-400 shrink-0">
                {Object.keys(values).length}
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </span>
            </button>
            {isOpen && (
              <div className="px-2.5 pb-1.5">
                <KeyValueList values={values} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  element,
  fallbackAttributes,
  isLoading,
  onOpenAcceptance,
  onCreateIssue,
  projectId,
  modelId,
  canEdit = false,
  currentUserName,
  className = '',
  onSelectSimilar,
  compareWith,
}) => {
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [pinned, setPinned] = useState<BimElement | null>(null);
  const [diffOnly, setDiffOnly] = useState(true);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarFields, setSimilarFields] = useState<SimilarField[]>(['loai_cau_kien', 'phan_doan_tang']);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    khoi_luong: true,
    vi_tri: true,
    psets: true,
    qto: false,
    kieu: false,
    ho_so: true,
  });
  const toggle = (id: string) => setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  const match = propertyMatcher(query);
  const isOpen = (id: string) => (match ? true : !!openSections[id]);

  if (isLoading) {
    return (
      <div
        className={`p-6 flex items-center justify-center gap-2 text-sm text-slate-400 bg-white dark:bg-slate-800 rounded-2xl ${className}`}
      >
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải thông tin cấu kiện...
      </div>
    );
  }

  if (!element && fallbackAttributes) {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-2xl flex flex-col overflow-hidden ${className}`}>
        <div className="p-3 m-3 mb-0 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-2xs text-amber-700 dark:text-amber-300">
          Cấu kiện chưa có trong CSDL (mô hình chưa được bóc tách). Đang hiển thị thuộc tính gốc đọc từ mô hình BIM;
          chuyển đổi lại mô hình để có khối lượng, vật liệu và bộ thuộc tính.
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <KeyValueList
            values={Object.fromEntries(Object.entries(fallbackAttributes).map(([k, v]) => [k.replace(/^_/, ''), v]))}
          />
        </div>
      </div>
    );
  }

  if (!element) {
    return (
      <div
        className={`p-6 text-center text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${className}`}
      >
        <Cuboid className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm font-medium">Chưa chọn cấu kiện</p>
        <p className="text-xs mt-1 text-slate-400 dark:text-slate-500">
          Nhấp chuột vào cấu kiện trên mô hình BIM hoặc giữ Shift + kéo chuột trái để quét chọn nhiều cấu kiện cùng lúc.
        </p>
      </div>
    );
  }

  const props = element.thuoc_tinh || {};
  // Dữ liệu cũ (trước khi nâng cấp worker) lưu thuộc tính dạng phẳng
  const isStructured = ['psets', 'qto', 'kieu', 'thong_tin', 'phan_loai'].some((k) => k in props);
  const psets: Record<string, BimPropertyGroup> = isStructured
    ? Object.fromEntries(
        Object.entries(props.psets || {}).filter(
          ([name]) => !props.hud_chuan || !name.startsWith('HUD_') || name === 'HUD_ThamChieuGoc',
        ),
      )
    : Object.keys(props).length
      ? { 'Thuộc tính': props as BimPropertyGroup }
      : {};
  const qtos = isStructured ? props.qto || {} : {};

  const copyGuid = () => {
    if (!element.global_id) return;
    navigator.clipboard.writeText(element.global_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pinnedHere = !!pinned && pinned.id === element.id && pinned.express_id === element.express_id;
  const compareTarget =
    compareWith && compareWith.id !== element.id ? compareWith : pinned && !pinnedHere ? pinned : null;
  const compareRows = compareTarget ? compareElements(compareTarget, element).filter((r) => !diffOnly || !r.same) : [];

  const quantities = [
    { label: 'Thể tích', value: element.the_tich_be_tong, unit: 'm³' },
    { label: 'Diện tích', value: element.dien_tich, unit: 'm²' },
    { label: 'Chiều dài', value: element.chieu_dai, unit: 'm' },
    { label: 'Trọng lượng', value: element.trong_luong, unit: 'kg' },
    { label: 'Diện tích ván khuôn', value: element.dien_tich_van_khuon, unit: 'm²' },
  ].filter((q) => q.value !== null && q.value !== undefined);

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 truncate">
            {props.hud_chuan
              ? String(props.hud_chuan.gia_tri.ten_cau_kien).split(' · ')[0]
              : getIfcLabel(element.loai_cau_kien)}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-slate-400 dark:text-slate-500">ID: #{element.express_id}</span>
            <button
              type="button"
              onClick={() => setPinned(pinnedHere ? null : element)}
              className={`p-1 rounded transition-colors ${pinnedHere ? 'text-amber-600 bg-amber-100 dark:bg-amber-900' : 'text-slate-400 hover:text-amber-600 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              data-tooltip={pinnedHere ? 'Bỏ ghim' : 'Ghim cấu kiện này để so sánh với cấu kiện chọn tiếp theo'}
              aria-label={pinnedHere ? 'Bỏ ghim so sánh' : 'Ghim để so sánh'}
            >
              {pinnedHere ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          </span>
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-2 line-clamp-2">
          {element.ten_cau_kien || `Cấu kiện #${element.express_id}`}
        </h3>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span className="truncate">GUID: {element.global_id}</span>
          <button
            onClick={copyGuid}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
            data-tooltip="Sao chép IFC GUID"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="relative mt-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <BimInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trong thuộc tính (VD: chiu luc, Pset, bê tông)"
            aria-label="Tìm trong thuộc tính"
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-slate-800 dark:text-slate-100 placeholder-slate-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Xóa từ khóa"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm divide-y divide-slate-100 dark:divide-slate-700/60">
        {compareTarget && (
          <div className="pb-3" data-testid="bim-compare">
            <div className="flex items-center gap-2 mb-2">
              <GitCompare className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">So sánh hai cấu kiện</span>
              <span className="flex-1" />
              <label className="flex items-center gap-1 text-2xs text-slate-500">
                <BimInput
                  type="checkbox"
                  className="accent-amber-600"
                  checked={diffOnly}
                  onChange={(e) => setDiffOnly(e.target.checked)}
                />
                Chỉ hiện khác nhau
              </label>
              {!compareWith && (
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  className="p-0.5 text-slate-400 hover:text-slate-600"
                  data-tooltip="Đóng so sánh"
                  aria-label="Đóng so sánh"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
              <BimTable className="w-full text-2xs">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                  <tr>
                    <th className="text-left font-medium px-2 py-1">Thuộc tính</th>
                    <th
                      className="text-left font-medium px-2 py-1 truncate max-w-[120px]"
                      data-tooltip={compareTarget.ten_cau_kien || ''}
                    >
                      Ghim: {compareTarget.ten_cau_kien || `#${compareTarget.express_id}`}
                    </th>
                    <th
                      className="text-left font-medium px-2 py-1 truncate max-w-[120px]"
                      data-tooltip={element.ten_cau_kien || ''}
                    >
                      Đang chọn: {element.ten_cau_kien || `#${element.express_id}`}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-center text-slate-400 italic">
                        {diffOnly ? 'Hai cấu kiện giống nhau ở mọi thuộc tính.' : 'Không có thuộc tính.'}
                      </td>
                    </tr>
                  )}
                  {compareRows.map((r) => (
                    <tr
                      key={`${r.group}|${r.key}`}
                      className={`border-t border-slate-100 dark:border-slate-700 ${r.same ? '' : 'bg-amber-50/70 dark:bg-amber-950'}`}
                    >
                      <td className="px-2 py-1 text-slate-500 align-top">
                        <span className="block text-3xs uppercase tracking-wide text-slate-400">{r.group}</span>
                        {r.key}
                      </td>
                      <td className="px-2 py-1 text-slate-800 dark:text-slate-200 align-top break-words">{r.a}</td>
                      <td className="px-2 py-1 text-slate-800 dark:text-slate-200 align-top break-words">{r.b}</td>
                    </tr>
                  ))}
                </tbody>
              </BimTable>
            </div>
          </div>
        )}
        {pinnedHere && !compareWith && (
          <p className="pb-3 text-2xs text-amber-700 dark:text-amber-300">
            Đã ghim cấu kiện này. Chọn một cấu kiện khác để so sánh cạnh nhau.
          </p>
        )}
        {/* 1. Khối lượng */}
        <Section
          id="khoi_luong"
          title="Khối lượng bóc tách"
          icon={<Cuboid className="w-4 h-4 text-primary-600 dark:text-primary-400" />}
          open={isOpen('khoi_luong')}
          onToggle={toggle}
          badge={
            element.nguon_khoi_luong === 'hinh_hoc' ? (
              <span
                className="text-2xs font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                data-tooltip="Mô hình không xuất Base Quantities; khối lượng được tính từ hình học mô hình"
              >
                Ước tính hình học
              </span>
            ) : element.nguon_khoi_luong === 'qto' ? (
              <span className="text-2xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                Từ mô hình (Qto)
              </span>
            ) : null
          }
        >
          {quantities.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Mô hình không có thông tin khối lượng cho cấu kiện này.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-700 text-xs">
              {quantities.map((q) => (
                <div key={q.label}>
                  <span className="text-slate-400 dark:text-slate-500 block">{q.label}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                    {formatNumberVN(q.value, q.unit)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2. Vị trí, vật liệu, thông tin chung */}
        <Section
          id="vi_tri"
          title="Vị trí, vật liệu & phân loại"
          icon={<Info className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
          open={isOpen('vi_tri')}
          onToggle={toggle}
        >
          <KeyValueList
            match={match}
            values={{
              'Vị trí (tầng / phân đoạn)': element.phan_doan_tang || 'Chưa gán',
              'Vật liệu': element.vat_lieu || null,
              'Lớp IFC': element.loai_cau_kien,
              ...(props.kieu?.ten ? { 'Kiểu (Type)': props.kieu.ten } : {}),
              ...(props.phan_loai?.length ? { 'Mã phân loại': props.phan_loai.join('; ') } : {}),
              ...(props.thong_tin || {}),
            }}
          />
          {element.vat_lieu && (
            <div className="flex flex-wrap gap-1 mt-2">
              {element.vat_lieu.split('; ').map((m) => (
                <span
                  key={m}
                  className="flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300"
                >
                  <Palette className="w-3 h-3" /> {m}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Liên kết: tài liệu (Hồ sơ tài liệu), nhiệm vụ và biên bản nghiệm thu */}
        {projectId && element.global_id && (
          <Section
            id="ho_so"
            title="Liên kết"
            icon={<ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            open={isOpen('ho_so')}
            onToggle={toggle}
          >
            <BimElementLinks
              projectId={projectId}
              modelId={modelId}
              guid={element.global_id}
              canEdit={canEdit}
              currentUserName={currentUserName}
              onOpenAcceptance={() => onOpenAcceptance?.(element.global_id)}
            />
          </Section>
        )}

        {/* 3. Bộ thuộc tính kỹ thuật */}
        {Object.keys(psets).length > 0 && (
          <Section
            id="psets"
            title={`Thông số kỹ thuật (${Object.keys(psets).length} bộ)`}
            icon={<Layers className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
            open={isOpen('psets')}
            onToggle={toggle}
          >
            <PropertyGroups groups={psets} match={match} />
          </Section>
        )}

        {/* 4. Bảng khối lượng gốc (Qto) */}
        {Object.keys(qtos).length > 0 && (
          <Section
            id="qto"
            title="Bảng khối lượng gốc (Qto)"
            icon={<Cuboid className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
            open={isOpen('qto')}
            onToggle={toggle}
          >
            <PropertyGroups groups={qtos} match={match} />
          </Section>
        )}

        {/* 5. Thuộc tính kế thừa từ kiểu */}
        {props.kieu?.psets && Object.keys(props.kieu.psets).length > 0 && (
          <Section
            id="kieu"
            title={`Thuộc tính kiểu: ${props.kieu.ten || getIfcLabel(props.kieu.loai)}`}
            icon={<Tag className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
            open={isOpen('kieu')}
            onToggle={toggle}
          >
            <PropertyGroups groups={props.kieu.psets} match={match} />
          </Section>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 flex flex-col gap-2">
        {onSelectSimilar && (
          <div className="rounded-xl border border-primary-200 dark:border-primary-900 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectSimilar(buildSelectSimilar(element, similarFields, modelId))}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-primary-700 dark:text-primary-300 font-medium text-xs hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-l-xl"
                data-tooltip={buildSelectSimilar(element, similarFields, modelId).label}
              >
                <MousePointerClick className="w-4 h-4" /> Chọn tương tự
              </button>
              <button
                type="button"
                onClick={() => setSimilarOpen((o) => !o)}
                className="px-2 py-2 text-slate-400 hover:text-primary-600"
                aria-label="Tiêu chí chọn tương tự"
                aria-expanded={similarOpen}
              >
                {similarOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
            {similarOpen && (
              <div className="px-3 pb-2 grid grid-cols-2 gap-1 text-2xs text-slate-600 dark:text-slate-300">
                {(Object.keys(SIMILAR_FIELD_LABEL) as SimilarField[]).map((f) => (
                  <label key={f} className="flex items-center gap-1.5">
                    <BimInput
                      type="checkbox"
                      className="accent-primary-600"
                      checked={f === 'loai_cau_kien' || similarFields.includes(f)}
                      disabled={f === 'loai_cau_kien'}
                      onChange={(e) =>
                        setSimilarFields((prev) => (e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)))
                      }
                    />
                    {SIMILAR_FIELD_LABEL[f]}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {onOpenAcceptance && (
          <button
            onClick={() => onOpenAcceptance(element.global_id)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-xs shadow-sm transition-colors dark:bg-emerald-600"
          >
            <ClipboardCheck className="w-4 h-4" />
            Tra cứu Hồ sơ Nghiệm thu (BBNT)
          </button>
        )}
        {onCreateIssue && (
          <button
            onClick={() => onCreateIssue(element)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs transition-colors"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Báo cáo Vướng mắc / Sai sót cấu kiện
          </button>
        )}
      </div>
    </div>
  );
};
