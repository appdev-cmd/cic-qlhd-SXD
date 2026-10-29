import { formatDate as sxdFormatDate } from '@/lib/utils';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Upload keys for authoring-tool add-ins (Revit, ArchiCAD, Tekla) of one project. A key is shown once; the database
// keeps its SHA-256 only. The add-in calls the bim-ingest Edge Function (supabase/functions/bim-ingest).
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { supabaseUrl } from '@/features/bim-suite/adapters/supabase';
import { BimCheckService } from '../../services/BimCheckService';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const field = 'doc-input mt-1 block text-xs';
const endpoint = () => `${String(supabaseUrl ?? '').replace(/\/$/, '')}/functions/v1/bim-ingest`;

export const BimAddinTokens: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { addToast } = useToast();
  const cache = useQueryClient();
  const [form, setForm] = useState({ name: '', days: 90 });
  const [created, setCreated] = useState<string | null>(null);
  const key = ['bim-addin-tokens', projectId];
  const tokens = useQuery({ queryKey: key, queryFn: () => BimCheckService.tokens(projectId), retry: false });
  const create = async () => {
    try {
      setCreated(await BimCheckService.createToken(projectId, form.name.trim(), form.days));
      setForm((f) => ({ ...f, name: '' }));
      void cache.invalidateQueries({ queryKey: key });
    } catch (e) {
      addToast({ type: 'error', title: 'Không tạo được khóa', message: errorText(e) });
    }
  };
  const revoke = async (id: string) => {
    try {
      await BimCheckService.revokeToken(id);
      void cache.invalidateQueries({ queryKey: key });
      addToast({ type: 'success', message: 'Đã thu hồi khóa.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    }
  };
  const [now] = useState(() => Date.now());

  return (
    <section className="space-y-3 text-xs" aria-labelledby="bim-addin">
      <h3 id="bim-addin" className="flex items-center gap-1.5 text-sm font-bold text-txt-primary">
        <KeyRound className="h-4 w-4" aria-hidden /> Khóa tải mô hình từ add-in (Revit, ArchiCAD, Tekla)
      </h3>
      {tokens.error ? (
        <p role="alert" className="text-rose-700">
          {errorText(tokens.error)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block font-semibold">
              Tên khóa
              <BimInput
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Revit đơn vị tư vấn A"
                className={`${field} w-56`}
              />
            </label>
            <label className="block font-semibold">
              Hiệu lực (ngày)
              <BimInput
                type="number"
                min={1}
                max={365}
                value={form.days}
                onChange={(e) => setForm({ ...form, days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                className={`${field} w-24`}
              />
            </label>
            <button
              type="button"
              disabled={!form.name.trim()}
              onClick={() => void create()}
              className="doc-button doc-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Tạo khóa
            </button>
          </div>
          {created && (
            <div
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-amber-900 dark:bg-amber-50"
            >
              <p className="font-semibold">
                Sao chép khóa ngay. Khóa không hiện lại sau khi đóng thông báo này; hệ thống chỉ lưu mã băm.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-white px-1.5 py-0.5 font-mono text-2xs text-slate-900">
                  {created}
                </code>
                <button
                  type="button"
                  className="doc-button py-1"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(created)
                      .then(() => addToast({ type: 'success', message: 'Đã sao chép khóa.' }))
                  }
                >
                  <Copy className="h-3 w-3" aria-hidden /> Sao chép
                </button>
                <button type="button" className="doc-button py-1" onClick={() => setCreated(null)}>
                  Đã lưu, đóng
                </button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <BimTable className="w-full text-xs">
              <thead className="text-left text-txt-secondary">
                <tr>
                  <th className="py-1">Tên</th>
                  <th>Tiền tố</th>
                  <th>Hết hạn</th>
                  <th className="text-right">Lần dùng</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(tokens.data ?? []).map((t) => {
                  const active = !t.thu_hoi_luc && new Date(t.het_han).getTime() > now;
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className="py-1">{t.ten}</td>
                      <td className="font-mono">{t.tien_to}…</td>
                      <td>{sxdFormatDate(new Date(t.het_han))}</td>
                      <td className="text-right font-mono">
                        {t.so_lan_dung}
                        {t.lan_dung_cuoi ? (
                          <span className="block text-2xs text-txt-muted">
                            {formatDateTime(new Date(t.lan_dung_cuoi))}
                          </span>
                        ) : null}
                      </td>
                      <td>{t.thu_hoi_luc ? 'Đã thu hồi' : active ? 'Đang dùng' : 'Hết hạn'}</td>
                      <td className="text-right">
                        {active && (
                          <button
                            type="button"
                            onClick={() => void revoke(t.id)}
                            className="doc-button py-0.5 text-rose-700"
                          >
                            Thu hồi
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!(tokens.data ?? []).length && (
                  <tr>
                    <td colSpan={6} className="py-2 text-txt-muted">
                      Dự án chưa có khóa nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </BimTable>
          </div>
          <details className="rounded-xl bg-bg-subtle p-2">
            <summary className="cursor-pointer font-semibold">Cách add-in gửi mô hình</summary>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>
                POST <code className="font-mono">{endpoint()}</code>, header{' '}
                <code className="font-mono">Authorization: Bearer bimk_…</code>, thân{' '}
                <code className="font-mono">
                  {'{"action":"init","file_name":"KT.ifc","file_size":123,"sha256":"…"}'}
                </code>
                .
              </li>
              <li>
                PUT tệp lên <code className="font-mono">upload_url</code> trả về.
              </li>
              <li>
                POST{' '}
                <code className="font-mono">
                  {
                    '{"action":"complete","path":"…","file_name":"KT.ifc","file_size":123,"sha256":"…","discipline":"KIEN_TRUC","previous_model_id":null}'
                  }
                </code>{' '}
                → nhận <code className="font-mono">model_id</code>.
              </li>
              <li>
                POST <code className="font-mono">{'{"action":"status","model_id":"…"}'}</code> để theo dõi chuyển đổi và
                điểm xác minh IFC.
              </li>
            </ol>
            <p className="mt-1 text-txt-muted">
              Mô hình vào vùng WIP của CDE trong Hồ sơ tài liệu như khi tải lên thủ công; trùng tệp (cùng SHA-256) bị từ
              chối.
            </p>
          </details>
        </>
      )}
    </section>
  );
};
