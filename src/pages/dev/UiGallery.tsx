import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FolderKanban,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Card,
  CardHeader,
  EmptyState,
  FormField,
  FormSection,
  IconButton,
  KpiTile,
  Modal,
  PageHeader,
  PaginationBar,
  PalettePicker,
  ProgressBar,
  SearchableSelect,
  SectionHeader,
  Skeleton,
  SkeletonText,
  Stepper,
  Tabs,
  Timeline,
  NumberInput,
  DateInput,
  confirm,
  toast,
} from '../../components/ui';
import { SlaBadge, SLA_STATES } from '../../components/appraisal/SlaBadge';
import { useTheme, type Theme } from '../../context/ThemeContext';
import type { SlaStateId } from '../../types/appraisal';
import { formatCurrency } from '../../lib/utils';

const SLA_SAMPLES: { state: SlaStateId; days: number | null }[] = [
  { state: 'on_track', days: 12 },
  { state: 'due_soon', days: 2 },
  { state: 'due_soon', days: 0 },
  { state: 'overdue', days: -43 },
  { state: 'paused', days: null },
  { state: 'supplement_overdue', days: null },
  { state: 'completed', days: null },
  { state: 'closed', days: null },
];

const TABLE_ROWS = [
  {
    id: 'r1',
    code: 'DA-2026-DB-0189',
    name: 'Trung tâm Hội nghị và Triển lãm Văn hóa các dân tộc',
    amount: 412_500_000_000,
    sla: -43,
  },
  {
    id: 'r2',
    code: 'DA-2026-DB-0193',
    name: 'Trường PT Dân tộc nội trú THCS & THPT Điện Biên Đông',
    amount: 186_000_000_000,
    sla: 2,
  },
  { id: 'r3', code: 'DA-2026-DB-0201', name: 'Đường liên huyện Mường Chà - Nậm Pồ', amount: 958_300_000_000, sla: 12 },
];

const STEPS = [
  { id: 'intake', label: 'Tiếp nhận', caption: '02/10/2026' },
  { id: 'valid', label: 'Kiểm tra hợp lệ', caption: '≤05 NLV', help: 'Khoản 3 Điều 36 NĐ 217/2026' },
  { id: 'review', label: 'Thẩm định', caption: 'Hạn 28/10/2026' },
  { id: 'draft', label: 'Dự thảo' },
  { id: 'approve', label: 'Rà soát' },
  { id: 'issue', label: 'Ban hành' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} size="sm" />
      <Card padding="lg">{children}</Card>
    </section>
  );
}

/** Trang duyệt bộ component nền (chỉ dùng khi phát triển / demo). */
export function UiGallery() {
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<'all' | 'mine' | 'review' | 'overdue'>('all');
  const [step, setStep] = useState('review');
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState({ name: '', amount: 0, date: '', group: '' });
  const [page, setPage] = useState(1);
  const dirty = JSON.stringify(draft) !== JSON.stringify({ name: '', amount: 0, date: '', group: '' });

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <PageHeader
        title="Bộ component giao diện"
        description="Chuẩn thiết kế dùng chung — đồng bộ cic-hud. Đổi bộ màu và chế độ nền để kiểm tra."
        icon={<FolderKanban className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Phát triển' }, { label: 'Component' }]}
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => window.location.reload()}
          >
            Tải lại
          </Button>
        }
      />

      <Section title="Bộ màu và chế độ nền">
        <div className="grid gap-6 md:grid-cols-2">
          <PalettePicker defaultOpen />
          <div className="space-y-3">
            <Tabs<Theme>
              variant="pills"
              ariaLabel="Chế độ nền"
              value={theme}
              onChange={setTheme}
              items={[
                { id: 'light', label: 'Sáng' },
                { id: 'nature', label: 'Bảo vệ mắt' },
                { id: 'dark', label: 'Tối' },
              ]}
            />
            <div className="grid grid-cols-5 gap-2">
              {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => (
                <div key={n} className="space-y-1 text-center">
                  <div
                    className="h-10 rounded-lg border border-black/5 dark:border-white/10"
                    style={{ backgroundColor: `rgb(var(--color-primary-${n}))` }}
                  />
                  <span className="font-mono text-2xs text-ink-muted dark:text-slate-400">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Nút bấm">
        <div className="flex flex-wrap items-center gap-3">
          <Button leftIcon={<Plus className="h-4 w-4" />}>Tạo lần nộp hồ sơ</Button>
          <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />}>
            Xuất Excel
          </Button>
          <Button variant="outline">Trả lại</Button>
          <Button variant="ghost">Bỏ qua</Button>
          <Button variant="success" leftIcon={<CheckCircle2 className="h-4 w-4" />}>
            Duyệt
          </Button>
          <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />}>
            Thu hồi
          </Button>
          <Button loading loadingText="Đang lưu…">
            Lưu
          </Button>
          <Button disabled>Chưa đủ điều kiện</Button>
          <IconButton aria-label="Tìm kiếm" tooltip="Tìm kiếm (Ctrl+K)" icon={<Search className="h-4 w-4" />} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
            <Button key={size} size={size} variant="secondary">
              Cỡ {size}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Nhãn trạng thái và hạn xử lý">
        <div className="flex flex-wrap gap-2">
          {(['default', 'primary', 'success', 'warning', 'danger', 'info', 'neutral', 'outline'] as const).map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SLA_SAMPLES.map((s, i) => (
            <SlaBadge
              key={i}
              sla={{ state: s.state, label: SLA_STATES[s.state].label, remainingWorkingDays: s.days }}
              dueDate="2026-10-28"
            />
          ))}
        </div>
        <div className="mt-3">
          <SlaBadge
            variant="full"
            sla={{ state: 'overdue', label: 'Quá hạn', remainingWorkingDays: -43 }}
            dueDate="2026-08-27"
          />
        </div>
      </Section>

      <Section title="Tab và thanh tiến trình">
        <Tabs
          ariaLabel="Góc nhìn danh sách"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'all', label: 'Tất cả', count: 28 },
            { id: 'mine', label: 'Của tôi', count: 6 },
            { id: 'review', label: 'Chờ tôi xử lý', count: 3 },
            { id: 'overdue', label: 'Quá hạn', count: 10 },
          ]}
        />
        <div className="mt-6">
          <Stepper steps={STEPS} current={step} onSelect={setStep} />
        </div>
        <div className="mt-6">
          <Stepper steps={STEPS} current="review" blockedAt="review" />
        </div>
      </Section>

      <Section title="Chỉ số (KPI)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Đang xử lý"
            value={18}
            icon={<Clock className="h-5 w-5" />}
            trend={12}
            trendGood="down"
            onClick={() => toast.info('Mở danh sách hồ sơ đang xử lý')}
          />
          <KpiTile
            label="Tỷ lệ đúng hạn"
            value="86%"
            tone="success"
            icon={<CheckCircle2 className="h-5 w-5" />}
            trend={4}
          />
          <KpiTile
            label="Quá hạn"
            value={3}
            tone="danger"
            icon={<AlertTriangle className="h-5 w-5" />}
            trend={-25}
            trendGood="down"
          />
          <KpiTile
            label="Đã ban hành"
            value={41}
            tone="info"
            icon={<FileCheck className="h-5 w-5" />}
            hint="trong quý"
          />
        </div>
      </Section>

      <Section title="Thẻ, tiến độ, trạng thái rỗng, đang tải">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader
              title="Hồ sơ DA-2026-DB-0189"
              subtitle="Thẩm định BCNCKT · Lần 02"
              icon={<FileCheck className="h-5 w-5" />}
            />
            <div className="mt-4 space-y-3">
              <ProgressBar value={72} showLabel label="Hoàn thành phiếu thẩm định" />
              <ProgressBar value={35} color="amber" />
            </div>
          </Card>
          <Card>
            <SkeletonText lines={3} />
            <div className="mt-4 flex gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <Skeleton variant="rounded" height={40} className="flex-1" />
            </div>
          </Card>
        </div>
        <div className="mt-4">
          <EmptyState
            variant="search"
            title="Không có hồ sơ phù hợp"
            description="Thử bỏ bớt bộ lọc hoặc tìm theo mã hồ sơ, tên dự án."
            actionLabel="Xóa bộ lọc"
            onAction={() => toast.success('Đã xóa bộ lọc')}
          />
        </div>
      </Section>

      <Section title="Thông báo, xác nhận, hộp thoại">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => toast.success('Đã lưu hồ sơ', { description: 'Lần nộp 02 · revision 7' })}
          >
            Toast thành công
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.error('Không lưu được', { description: 'Hồ sơ đã được người khác cập nhật.' })}
          >
            Toast lỗi
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.warning('Sắp đến hạn', { description: 'Còn 2 ngày làm việc.' })}
          >
            Toast cảnh báo
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                title: 'Thu hồi giấy phép 012/2026/GPXD?',
                description: 'Thao tác ghi vào sổ giấy phép và không hoàn tác được.',
                confirmLabel: 'Thu hồi',
                tone: 'danger',
              });
              if (ok) toast.success('Đã thu hồi giấy phép');
            }}
          >
            Hộp xác nhận
          </Button>
          <Button onClick={() => setModal(true)}>Mở hộp thoại có form</Button>
        </div>
      </Section>

      <Section title="Lịch sử xử lý">
        <Timeline
          items={[
            {
              id: '1',
              title: 'Tiếp nhận hồ sơ',
              at: '2026-10-02T08:15:00',
              actor: 'Nguyễn Văn A · Một cửa',
              tone: 'info',
            },
            {
              id: '2',
              title: 'Yêu cầu bổ sung (Mẫu 15)',
              at: '2026-10-06T14:30:00',
              actor: 'Trần Thị B · Chuyên viên',
              tone: 'warning',
              description: 'Thiếu văn bản thỏa thuận đấu nối hạ tầng.',
            },
            {
              id: '3',
              title: 'Trưởng phòng đã rà soát',
              at: '2026-10-20T09:00:00',
              actor: 'Lê Văn C · Trưởng phòng QLXD',
              tone: 'success',
            },
          ]}
        />
      </Section>

      <Section title="Bảng dữ liệu (DataTable)">
        <DataTable
          storageKey="dev-ui-table"
          rows={TABLE_ROWS}
          showRowNumbers
          columnChooser
          showDensityToggle
          onRowClick={(row) => toast.info('Mở hồ sơ ' + row.code)}
          rowLabel={(row) => row.code}
          columns={[
            {
              id: 'code',
              header: 'Mã hồ sơ',
              width: 170,
              sortValue: (r) => r.code,
              cell: (r) => <span className="font-mono">{r.code}</span>,
            },
            { id: 'name', header: 'Dự án', width: 360, sortValue: (r) => r.name, cell: (r) => r.name },
            {
              id: 'amount',
              header: 'Tổng mức đầu tư',
              align: 'right',
              width: 190,
              sortValue: (r) => r.amount,
              cell: (r) => <span className="font-mono tabular-nums">{formatCurrency(r.amount)}</span>,
            },
            {
              id: 'sla',
              header: 'Hạn xử lý',
              width: 150,
              tooltip: 'NLV = ngày làm việc',
              sortValue: (r) => r.sla,
              cell: (r) => (
                <SlaBadge
                  sla={{
                    state: r.sla < 0 ? 'overdue' : r.sla <= 3 ? 'due_soon' : 'on_track',
                    label: '',
                    remainingWorkingDays: r.sla,
                  }}
                />
              ),
            },
          ]}
        />
      </Section>

      <PaginationBar page={page} totalPages={6} total={283} pageSize={50} onPageChange={setPage} />

      {modal && (
        <Modal
          heading="Tạo lần nộp hồ sơ"
          description="Thử Esc / bấm nền mờ khi đã nhập để xem chặn mất dữ liệu."
          onClose={() => {
            setModal(false);
            setDraft({ name: '', amount: 0, date: '', group: '' });
          }}
          dirty={dirty}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>
                Hủy
              </Button>
              <Button
                onClick={() => {
                  setModal(false);
                  toast.success('Đã tạo lần nộp');
                }}
              >
                Lưu
              </Button>
            </>
          }
        >
          <FormSection title="Thông tin chung" columns={2}>
            <FormField label="Tên dự án" required htmlFor="ui-name" hint="Theo quyết định chủ trương đầu tư">
              <input
                id="ui-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded-xl border border-border dark:border-slate-600 bg-surface dark:bg-slate-900 px-3 py-2 text-sm text-ink dark:text-slate-100"
              />
            </FormField>
            <FormField label="Nhóm dự án" required>
              <SearchableSelect
                value={draft.group}
                onChange={(group) => setDraft({ ...draft, group })}
                placeholder="Chọn nhóm"
                options={[
                  { value: 'QG', label: 'Quan trọng quốc gia' },
                  { value: 'A', label: 'Nhóm A' },
                  { value: 'B', label: 'Nhóm B' },
                  { value: 'C', label: 'Nhóm C' },
                ]}
              />
            </FormField>
            <FormField label="Tổng mức đầu tư" required>
              <NumberInput value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} suffix="VNĐ" />
            </FormField>
            <FormField label="Ngày tiếp nhận">
              <DateInput value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
            </FormField>
          </FormSection>
        </Modal>
      )}
    </div>
  );
}
