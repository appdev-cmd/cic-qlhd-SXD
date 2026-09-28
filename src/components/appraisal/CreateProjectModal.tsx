import React, { useEffect, useState } from 'react';
import { ReviewModal } from './ReviewModal';
import { SearchableSelect } from '../ui/SearchableSelect';
import { NumberInput } from '../ui/NumberInput';
import { apiRequest } from '../../services/apiClient';
import { mapProject } from '../../services/projectService';
import type { Project } from '../../types/project';

const initial = {
  code: '',
  title: '',
  field: 'Dân dụng',
  group_type: 'B',
  grade: 'II',
  investment_cost: 0,
  investor_id: '',
  location: 'Điện Biên',
};
const input =
  'w-full mt-1 rounded-lg border border-border dark:border-border bg-surface dark:bg-surface p-2 text-ink dark:text-ink';
export function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [investors, setInvestors] = useState<{ value: string; label: string }[]>([]);
  const [selected, setSelected] = useState<{ value: string; label: string } | null>(null);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      apiRequest<{ id: string; name: string }[]>('/organizations/options?search=' + encodeURIComponent(search))
        .then((rows) => {
          if (current) setInvestors(rows.map((r) => ({ value: r.id, label: r.name })));
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search]);
  const options = selected && !investors.some((o) => o.value === selected.value) ? [selected, ...investors] : investors;
  return (
    <ReviewModal
      heading="Tiếp nhận dự án"
      dirty={JSON.stringify(form) !== JSON.stringify(initial)}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-ink dark:text-ink"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const project = await apiRequest<Record<string, unknown>>('/projects', {
              method: 'POST',
              body: JSON.stringify({ ...form, investor_id: form.investor_id || null }),
            });
            onCreated(mapProject(project));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Mã dự án
          <input
            required
            minLength={3}
            maxLength={100}
            className={input}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label>
          Tên dự án
          <input
            required
            minLength={3}
            maxLength={500}
            className={input}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          Lĩnh vực
          <input
            required
            minLength={2}
            maxLength={100}
            className={input}
            value={form.field}
            onChange={(e) => setForm({ ...form, field: e.target.value })}
          />
        </label>
        <label>
          Địa điểm
          <input
            required
            minLength={2}
            maxLength={300}
            className={input}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
        <div>
          Nhóm dự án
          <SearchableSelect
            value={form.group_type}
            onChange={(group_type) => setForm({ ...form, group_type })}
            options={['A', 'B', 'C', 'QG'].map((value) => ({
              value,
              label: value === 'QG' ? 'Quan trọng quốc gia' : 'Nhóm ' + value,
            }))}
          />
        </div>
        <div>
          Cấp công trình
          <SearchableSelect
            value={form.grade}
            onChange={(grade) => setForm({ ...form, grade })}
            options={['I', 'II', 'III', 'IV', 'DB'].map((value) => ({
              value,
              label: value === 'DB' ? 'Đặc biệt' : 'Cấp ' + value,
            }))}
          />
        </div>
        <div>
          Chủ đầu tư
          <SearchableSelect
            value={form.investor_id}
            onChange={(investor_id) => {
              setForm({ ...form, investor_id });
              setSelected(options.find((o) => o.value === investor_id) || null);
            }}
            onSearchChange={setSearch}
            options={[{ value: '', label: 'Chưa xác định' }, ...options]}
          />
        </div>
        <div>
          Tổng mức đầu tư
          <NumberInput
            value={form.investment_cost}
            onChange={(investment_cost) => setForm({ ...form, investment_cost })}
            suffix="VNĐ"
          />
        </div>
        <p className="md:col-span-2 text-xs text-ink-muted dark:text-ink-muted">
          Tỉnh và phòng thụ lý được gán theo tài khoản. Sau khi lưu, tiếp nhận hồ sơ tại tab nghiệp vụ của dự án.
        </p>
        {error && (
          <p role="alert" className="md:col-span-2 text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded-lg bg-primary-500 dark:bg-primary-500 text-white dark:text-white p-3 disabled:opacity-50"
        >
          {busy ? 'Đang lưu…' : 'Tạo dự án'}
        </button>
      </form>
    </ReviewModal>
  );
}
