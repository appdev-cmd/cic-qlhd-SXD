import React, { useEffect, useState } from 'react';
import { ReviewModal } from './ReviewModal';
import { SearchableSelect } from '../ui/SearchableSelect';
import { DateInput } from '../ui/DateInput';
import { NumberInput } from '../ui/NumberInput';
import { apiRequest, type Page } from '../../services/apiClient';
import { DossierGrid } from './DossierGrid';
import { formatDateTime } from '../../lib/utils';
type Row = { id: string; [key: string]: any };
const button =
  'rounded-lg border border-border dark:border-border bg-surface dark:bg-surface text-ink dark:text-ink p-2 text-sm disabled:opacity-50';
export const fieldLabels: Record<string, string> = {
  code: 'Mã',
  name: 'Tên',
  full_name: 'Họ và tên',
  type: 'Loại tổ chức',
  address: 'Địa chỉ',
  tax_code: 'Mã số thuế',
  legal_rep: 'Đại diện pháp luật',
  phone: 'Điện thoại',
  email: 'Email',
  cert_number: 'Số chứng chỉ',
  cert_grade: 'Hạng chứng chỉ',
  cert_authority: 'Cơ quan cấp',
  cert_expiry: 'Ngày hết hạn',
  status: 'Trạng thái',
  id_card: 'Số giấy tờ định danh',
  specialties: 'Lĩnh vực hành nghề (mỗi dòng một lĩnh vực)',
  org_id: 'Đơn vị công tác',
  org_name: 'Đơn vị công tác',
  unit: 'Đơn vị tính',
  standard_price: 'Giá công bố',
  market_price: 'Giá thị trường',
  region: 'Địa bàn',
  period: 'Kỳ công bố',
  supplier: 'Nhà cung cấp',
  revision: 'Phiên bản',
  province_code: 'Địa phương',
  created_at: 'Ngày tạo',
  updated_at: 'Ngày cập nhật',
};
const fields: Record<string, string[]> = {
  organizations: [
    'code',
    'name',
    'type',
    'address',
    'tax_code',
    'legal_rep',
    'phone',
    'email',
    'cert_number',
    'cert_grade',
    'cert_expiry',
    'status',
  ],
  personnel: [
    'code',
    'full_name',
    'id_card',
    'cert_number',
    'cert_authority',
    'cert_grade',
    'cert_expiry',
    'specialties',
    'org_id',
    'email',
    'phone',
    'status',
  ],
  material_prices: ['code', 'name', 'unit', 'standard_price', 'market_price', 'region', 'period', 'supplier'],
};
const required: Record<string, string[]> = {
  organizations: ['code', 'name', 'type', 'address', 'status'],
  personnel: ['full_name', 'cert_number', 'cert_authority', 'cert_grade', 'cert_expiry', 'specialties', 'status'],
  material_prices: ['code', 'name', 'unit', 'standard_price', 'market_price', 'region', 'period'],
};
const statuses = [
  ['hieu_luc', 'Còn hiệu lực'],
  ['sap_het_han', 'Sắp hết hạn'],
  ['het_han', 'Hết hạn'],
  ['tam_dung', 'Tạm dừng'],
  ['active', 'Hoạt động'],
  ['suspended', 'Tạm dừng hoạt động'],
  ['thu_hoi', 'Thu hồi'],
];
const types = [
  ['investor', 'Chủ đầu tư'],
  ['consultant_design', 'Tư vấn thiết kế'],
  ['consultant_audit', 'Tư vấn thẩm tra'],
  ['contractor', 'Nhà thầu'],
  ['supervisor', 'Tư vấn giám sát'],
];

export function CatalogEditor({
  kind,
  row,
  onClose,
  onSaved,
}: {
  kind: string;
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      fields[kind].map((k) => [
        k,
        k === 'specialties'
          ? (row?.[k] || []).join('\n')
          : (row?.[k] ?? (k === 'status' ? 'hieu_luc' : k === 'type' ? 'investor' : k === 'cert_grade' ? 'III' : '')),
      ]),
    ),
  );
  const [initial] = useState(JSON.stringify(draft));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [orgSearch, setOrgSearch] = useState(''),
    [orgs, setOrgs] = useState<Row[]>([]);
  useEffect(() => {
    if (kind !== 'personnel') return;
    let live = true;
    const timer = setTimeout(
      () =>
        apiRequest<Page<Row>>('/catalog/organizations?limit=50&search=' + encodeURIComponent(orgSearch))
          .then((p) => {
            if (live) setOrgs(p.items);
          })
          .catch((e) => {
            if (live) setError(e.message);
          }),
      200,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, orgSearch]);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const values = { ...draft };
      if (kind === 'personnel') {
        values.specialties = draft.specialties
          .split('\n')
          .map((s: string) => s.trim())
          .filter(Boolean);
        if (row && !values.id_card) delete values.id_card;
      }
      await apiRequest('/catalog/' + kind + (row ? '/' + row.id : ''), {
        method: row ? 'PATCH' : 'POST',
        body: JSON.stringify({ revision: row?.revision || 1, values }),
      });
      window.dispatchEvent(new Event('appraisal:changed'));
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ReviewModal
      heading={row ? 'Cập nhật danh mục' : 'Thêm bản ghi danh mục'}
      dirty={busy || JSON.stringify(draft) !== initial}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="text-sm text-ink-muted dark:text-ink-muted">
          Dữ liệu được lưu vào phạm vi tỉnh của tài khoản. Các thay đổi có nhật ký và kiểm soát phiên bản.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields[kind].map((key) => {
            const set = (v: any) => setDraft((p) => ({ ...p, [key]: v }));
            let options: { value: string; label: string }[] | null = null;
            if (key === 'type') options = types.map(([value, label]) => ({ value, label }));
            if (key === 'status')
              options = statuses
                .filter(([v]) =>
                  kind === 'personnel'
                    ? ['hieu_luc', 'sap_het_han', 'het_han', 'thu_hoi'].includes(v)
                    : v !== 'thu_hoi',
                )
                .map(([value, label]) => ({ value, label }));
            if (key === 'cert_grade')
              options = (kind === 'personnel' ? ['I', 'II', 'III'] : ['I', 'II', 'III', 'Chưa xếp hạng']).map(
                (value) => ({ value, label: value }),
              );
            if (key === 'org_id')
              options = [
                { value: '', label: 'Chưa gắn đơn vị' },
                ...(row?.org_id && !orgs.some((o) => o.id === row.org_id)
                  ? [{ value: row.org_id, label: row.org_name }]
                  : []),
                ...orgs.map((o) => ({ value: o.id, label: o.name })),
              ];
            return (
              <label key={key} className="block text-sm">
                {fieldLabels[key]}
                {required[kind].includes(key) || (key === 'id_card' && !row) ? ' *' : ''}
                {key === 'id_card' && row && (
                  <span className="text-xs text-ink-muted dark:text-ink-muted"> (để trống để giữ nguyên)</span>
                )}
                {options ? (
                  <SearchableSelect
                    value={draft[key]}
                    disabled={busy}
                    options={options}
                    onChange={set}
                    onSearchChange={key === 'org_id' ? setOrgSearch : undefined}
                  />
                ) : key === 'cert_expiry' ? (
                  <DateInput value={draft[key]} disabled={busy} onChange={set} />
                ) : key.endsWith('_price') ? (
                  <NumberInput value={draft[key]} disabled={busy} onChange={set} suffix="VNĐ" />
                ) : key === 'specialties' ? (
                  <textarea
                    disabled={busy}
                    required
                    rows={3}
                    value={draft[key]}
                    onChange={(e) => set(e.target.value)}
                    className={button + ' mt-1 w-full'}
                  />
                ) : (
                  <input
                    disabled={busy}
                    required={required[kind].includes(key) || (key === 'id_card' && !row)}
                    maxLength={1000}
                    type={key === 'email' ? 'email' : 'text'}
                    value={draft[key]}
                    onChange={(e) => set(e.target.value)}
                    className={button + ' mt-1 w-full'}
                  />
                )}
              </label>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className={button + ' !bg-primary-500 dark:!bg-primary-500 !text-white dark:!text-white'}
        >
          {busy ? 'Đang lưu…' : 'Lưu danh mục'}
        </button>
      </form>
    </ReviewModal>
  );
}

export function CatalogHistory({ kind, row, onClose }: { kind: string; row: Row; onClose: () => void }) {
  const [items, setItems] = useState<Row[]>([]),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true);
    apiRequest<{ items: Row[] }>(`/catalog/${kind}/${row.id}/history?offset=${offset}`)
      .then((x) => {
        if (live) setItems(x.items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [kind, row.id, offset]);
  return (
    <ReviewModal heading="Lịch sử danh mục" onClose={onClose}>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <DossierGrid
        storageKey="catalog-history"
        rows={items}
        columns={[
          { label: 'Thời điểm', value: (r) => r.created_at, render: (r) => formatDateTime(r.created_at) },
          { label: 'Người thực hiện', value: (r) => r.actor },
          {
            label: 'Thao tác',
            value: (r) =>
              ({ insert: 'Tạo mới', update: 'Cập nhật', delete: 'Xóa' })[String(r.action).toLowerCase()] || 'Thay đổi',
          },
          {
            label: 'Nội dung thay đổi',
            value: (r) => (r.changed_fields || []).map((x: string) => fieldLabels[x] || 'Thông tin bổ sung').join(', '),
            width: 320,
          },
        ]}
      />
      <div className="flex gap-3 mt-4">
        <button disabled={busy || !offset} className={button} onClick={() => setOffset((n) => n - 50)}>
          Trang trước
        </button>
        <button disabled={busy || items.length < 50} className={button} onClick={() => setOffset((n) => n + 50)}>
          Trang sau
        </button>
      </div>
    </ReviewModal>
  );
}
