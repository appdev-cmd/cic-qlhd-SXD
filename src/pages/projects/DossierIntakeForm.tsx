import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Save, Scale, Timer } from 'lucide-react';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { NumberInput } from '../../components/ui/NumberInput';
import { DateInput } from '../../components/ui/DateInput';
import { useCreateDossier, useHolidays, useOrganizations, useStaff } from '../../hooks/useData';
import { useUnsavedChangesGuard, isFormDirty } from '../../hooks/useGuards';
import { useEntityPanel, useCurrentPanel } from '../../hooks/useEntityPanel';
import { useSlidePanel } from '../../context/SlidePanelContext';
import { useCurrentUser } from '../../context/CurrentUserContext';
import { AUTHORITY_LABELS, determineJurisdiction } from '../../lib/jurisdiction';
import { buildHolidaySet, computeDeadline, todayIso } from '../../lib/sla';
import { DOSSIER_CHECKLISTS, missingRequiredDocs } from '../../lib/dossierChecklist';
import { INVESTMENT_FORM_LABELS, PROCEDURE_TYPE_LABELS, PROJECT_FIELDS } from '../../lib/projectClassification';
import { getProjectCoordinates } from '../../lib/gisData';
import { cn, formatDate } from '../../lib/utils';
import type { InvestmentForm, ProcedureType, Project } from '../../types/domain';

export const DIEN_BIEN_AREAS = [
  'TP. Điện Biên Phủ',
  'TX. Mường Lay',
  'Huyện Điện Biên',
  'Huyện Điện Biên Đông',
  'Huyện Mường Ảng',
  'Huyện Mường Chà',
  'Huyện Mường Nhé',
  'Huyện Nậm Pồ',
  'Huyện Tủa Chùa',
  'Huyện Tuần Giáo',
];

interface FormState {
  name: string;
  investorId: string;
  investmentForm: InvestmentForm;
  procedureType: ProcedureType;
  projectGroup: Project['projectGroup'];
  buildingGrade: Project['buildingGrade'];
  field: string;
  location: string;
  totalInvestment: number;
  submissionDate: string;
  assigneeStaffId: string;
  isAppendixIV: boolean;
  decidedByCommune: boolean;
  submittedDocuments: string[];
}

const initialState = (): FormState => ({
  name: '',
  investorId: '',
  investmentForm: 'dau_tu_cong',
  procedureType: 'tham_dinh_bcnckt',
  projectGroup: 'B',
  buildingGrade: 'II',
  field: 'Dân dụng',
  location: '',
  totalInvestment: 0,
  submissionDate: todayIso(),
  assigneeStaffId: '',
  isAppendixIV: false,
  decidedByCommune: false,
  submittedDocuments: [],
});

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-2xs font-semibold text-ink-secondary">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-3xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function DossierIntakeForm() {
  const [initial] = useState(initialState);
  const [form, setForm] = useState<FormState>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const { data: investors = [] } = useOrganizations({ type: 'investor' });
  const { data: staff = [] } = useStaff();
  const { data: holidays = [] } = useHolidays();
  const { currentUser } = useCurrentUser();
  const createDossier = useCreateDossier();
  const { open } = useEntityPanel();
  const { closePanel } = useSlidePanel();
  const { panelId } = useCurrentPanel();

  const isDirty = isFormDirty(form, initial);
  useUnsavedChangesGuard(isDirty && !createDossier.isSuccess);

  const jurisdiction = useMemo(
    () =>
      determineJurisdiction({
        procedureType: form.procedureType,
        projectGroup: form.projectGroup,
        buildingGrade: form.buildingGrade,
        investmentForm: form.investmentForm,
        decidedByCommune: form.decidedByCommune,
        isAppendixIV: form.isAppendixIV,
      }),
    [form.procedureType, form.projectGroup, form.buildingGrade, form.investmentForm, form.decidedByCommune, form.isAppendixIV]
  );

  const deadline = useMemo(
    () =>
      computeDeadline({
        receivedDate: form.submissionDate || todayIso(),
        procedureType: form.procedureType,
        projectGroup: form.projectGroup,
        buildingGrade: form.buildingGrade,
        holidays: buildHolidaySet(holidays),
      }),
    [form.submissionDate, form.procedureType, form.projectGroup, form.buildingGrade, holidays]
  );

  const checklist = DOSSIER_CHECKLISTS[form.procedureType];
  const missing = missingRequiredDocs(form.procedureType, form.submittedDocuments);

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.name.trim().length < 10) errors.name = 'Nhập tên dự án (tối thiểu 10 ký tự)';
  if (!form.investorId) errors.investorId = 'Chọn chủ đầu tư';
  if (!form.location) errors.location = 'Chọn địa bàn';
  if (form.procedureType === 'tham_dinh_bcnckt' && form.totalInvestment <= 0) errors.totalInvestment = 'Nhập tổng mức đầu tư';
  if (!form.submissionDate) errors.submissionDate = 'Nhập ngày tiếp nhận';
  const hasErrors = Object.keys(errors).length > 0;

  const investor = investors.find((o) => o.id === form.investorId);
  const assignee = staff.find((s) => s.id === form.assigneeStaffId);

  const handleSubmit = async () => {
    setShowErrors(true);
    if (hasErrors) return;
    const coords = getProjectCoordinates(`new-${form.name}`, form.location);
    const project = await createDossier.mutateAsync({
      name: form.name.trim(),
      investorId: form.investorId,
      investorName: investor?.name ?? '',
      investmentForm: form.investmentForm,
      procedureType: form.procedureType,
      projectGroup: form.projectGroup,
      buildingGrade: form.buildingGrade,
      field: form.field,
      location: form.location,
      totalInvestment: form.totalInvestment,
      submissionDate: form.submissionDate,
      deadlineDate: deadline.deadline,
      assigneeStaffId: assignee?.id,
      assigneeName: assignee?.fullName,
      department: assignee?.department ?? currentUser?.department ?? 'Phòng Quản lý Xây dựng',
      isAppendixIV: form.isAppendixIV,
      decidedByCommune: form.decidedByCommune,
      submittedDocuments: form.submittedDocuments,
      lat: coords.lat,
      lng: coords.lng,
    });
    if (panelId) closePanel(panelId);
    open('project', { id: project.id, label: project.name, subtitle: `Mã: ${project.code} • ${project.investorName}` });
  };

  const err = (k: keyof FormState) =>
    showErrors && errors[k] ? <span className="text-3xs text-rose-600 dark:text-rose-400">{errors[k]}</span> : null;

  const inputCls =
    'w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-ink outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:bg-slate-900 dark:border-slate-700';

  return (
    <div className="space-y-4 text-xs pb-16">
      {/* A. Thông tin dự án */}
      <section className="p-4 rounded-xl border border-border bg-surface space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="font-bold text-ink">A. Thông tin dự án & thủ tục</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Field label="Tên dự án / công trình" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="VD: Xây dựng Trường THCS xã Thanh Nưa, huyện Điện Biên"
                className={inputCls}
              />
              {err('name')}
            </Field>
          </div>
          <Field label="Loại thủ tục" required>
            <SearchableSelect
              value={form.procedureType}
              onChange={(v) => set('procedureType', v as ProcedureType)}
              options={Object.entries(PROCEDURE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Hình thức đầu tư" required>
            <SearchableSelect
              value={form.investmentForm}
              onChange={(v) => set('investmentForm', v as InvestmentForm)}
              options={Object.entries(INVESTMENT_FORM_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Chủ đầu tư" required>
            <SearchableSelect
              value={form.investorId}
              onChange={(v) => set('investorId', v)}
              placeholder="Chọn chủ đầu tư / Ban QLDA (gõ: bqlda, cdt...)"
              options={investors.map((o) => ({ value: o.id, label: o.name, sublabel: `${o.code} • MST ${o.taxCode}` }))}
            />
            {err('investorId')}
          </Field>
          <Field label="Địa bàn xây dựng" required>
            <SearchableSelect
              value={form.location}
              onChange={(v) => set('location', v)}
              placeholder="Chọn địa bàn"
              options={DIEN_BIEN_AREAS.map((a) => ({ value: a, label: a }))}
            />
            {err('location')}
          </Field>
          <Field label="Nhóm dự án" required>
            <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-subtle border border-border dark:bg-slate-800 dark:border-slate-700">
              {(['QG', 'A', 'B', 'C'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('projectGroup', g)}
                  className={cn(
                    'py-1 rounded-md font-semibold',
                    form.projectGroup === g ? 'bg-surface text-primary-600 shadow-xs dark:bg-slate-900 dark:text-primary-400' : 'text-ink-muted'
                  )}
                >
                  {g === 'QG' ? 'QTQG' : `Nhóm ${g}`}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Cấp công trình (cấp cao nhất)" required>
            <div className="grid grid-cols-5 gap-1 p-0.5 rounded-lg bg-subtle border border-border dark:bg-slate-800 dark:border-slate-700">
              {(['DB', 'I', 'II', 'III', 'IV'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('buildingGrade', g)}
                  className={cn(
                    'py-1 rounded-md font-semibold',
                    form.buildingGrade === g ? 'bg-surface text-primary-600 shadow-xs dark:bg-slate-900 dark:text-primary-400' : 'text-ink-muted'
                  )}
                >
                  {g === 'DB' ? 'Đặc biệt' : g}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Lĩnh vực công trình">
            <SearchableSelect value={form.field} onChange={(v) => set('field', v)} options={PROJECT_FIELDS.map((f) => ({ value: f, label: f }))} />
          </Field>
          <Field label="Tổng mức đầu tư" required={form.procedureType === 'tham_dinh_bcnckt'}>
            <NumberInput value={form.totalInvestment} onChange={(v) => set('totalInvestment', v)} suffix="VNĐ" />
            {err('totalInvestment')}
          </Field>
          <Field label="Ngày tiếp nhận hồ sơ" required>
            <DateInput value={form.submissionDate} onChange={(v) => set('submissionDate', v)} />
            {err('submissionDate')}
          </Field>
          <Field label="Chuyên viên thụ lý" hint="Có thể phân công sau (Trưởng phòng)">
            <SearchableSelect
              value={form.assigneeStaffId}
              onChange={(v) => set('assigneeStaffId', v)}
              placeholder="Chưa phân công"
              options={[
                { value: '', label: 'Chưa phân công' },
                ...staff.filter((s) => s.role === 'officer').map((s) => ({ value: s.id, label: s.fullName, sublabel: s.department })),
              ]}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isAppendixIV} onChange={(e) => set('isAppendixIV', e.target.checked)} className="accent-primary-600" />
            <span>Có công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng (Phụ lục IV)</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.decidedByCommune}
              onChange={(e) => set('decidedByCommune', e.target.checked)}
              className="accent-primary-600"
            />
            <span>Dự án do UBND cấp xã quyết định đầu tư</span>
          </label>
        </div>
      </section>

      {/* B. Thẩm quyền & thời hạn */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className={cn(
            'p-4 rounded-xl border space-y-1.5',
            jurisdiction.isSoXayDung
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
              : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
          )}
        >
          <h4 className="font-bold flex items-center gap-1.5 text-ink">
            <Scale size={14} /> Cơ quan có thẩm quyền (gợi ý)
          </h4>
          <p className="font-semibold text-ink">{AUTHORITY_LABELS[jurisdiction.authority]}</p>
          <p className="text-2xs text-ink-secondary">{jurisdiction.reason}</p>
          <p className="text-3xs text-ink-muted">Căn cứ: {jurisdiction.citation}</p>
          {!jurisdiction.isSoXayDung && (
            <p className="text-2xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <AlertTriangle size={12} /> Hồ sơ không thuộc thẩm quyền Sở — cân nhắc hướng dẫn chủ đầu tư / trả hồ sơ.
            </p>
          )}
        </div>
        <div className="p-4 rounded-xl border border-border bg-surface space-y-1.5 dark:border-slate-800 dark:bg-slate-900">
          <h4 className="font-bold flex items-center gap-1.5 text-ink">
            <Timer size={14} /> Thời hạn giải quyết dự kiến
          </h4>
          <p className="text-ink">
            <strong className="text-primary-600 dark:text-primary-400 text-sm">{deadline.workingDays} ngày làm việc</strong> — hạn trả kết quả{' '}
            <strong>{formatDate(deadline.deadline)}</strong>
          </p>
          <p className="text-2xs text-ink-secondary">
            Tính từ ngày nhận đủ hồ sơ hợp lệ, đã trừ thứ Bảy, Chủ nhật và ngày lễ, Tết. Hạn chính thức được tính lại khi xác nhận hồ sơ hợp lệ.
          </p>
          <p className="text-3xs text-ink-muted">
            Căn cứ: {deadline.rule?.citation ?? 'Quy định chung'}
            {deadline.rule?.needsConfirmation && ' (cần pháp chế xác nhận)'}
          </p>
        </div>
      </section>

      {/* C. Thành phần hồ sơ */}
      <section className="p-4 rounded-xl border border-border bg-surface space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-bold text-ink">C. Thành phần hồ sơ đã nộp</h4>
          {missing.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={13} /> Đủ thành phần bắt buộc
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-amber-600 dark:text-amber-400">
              <Info size={13} /> Còn thiếu {missing.length} thành phần bắt buộc
            </span>
          )}
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {checklist.map((item) => {
            const checked = form.submittedDocuments.includes(item.code);
            return (
              <li key={item.code}>
                <label
                  className={cn(
                    'flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                    checked
                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
                      : 'border-border bg-subtle dark:border-slate-700 dark:bg-slate-800'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      set(
                        'submittedDocuments',
                        e.target.checked
                          ? [...form.submittedDocuments, item.code]
                          : form.submittedDocuments.filter((c) => c !== item.code)
                      )
                    }
                    className="mt-0.5 accent-emerald-600"
                  />
                  <span className="text-2xs text-ink">
                    <span className="font-mono text-3xs text-ink-muted mr-1">{item.code}</span>
                    {item.label}
                    {item.required && <span className="text-rose-500 ml-0.5">*</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-3xs text-ink-muted">
          Hồ sơ thiếu thành phần vẫn được tiếp nhận; chuyên viên dùng thao tác "Yêu cầu bổ sung" (chỉ 01 lần) trong 05 ngày làm việc.
        </p>
      </section>

      {/* Thanh thao tác cố định cuối panel */}
      <div className="sticky bottom-0 -mx-5 px-5 py-3 border-t border-border bg-surface flex items-center justify-between gap-3 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-2xs text-ink-muted">
          {createDossier.error ? (
            <span className="text-rose-600 dark:text-rose-400">{(createDossier.error as Error).message}</span>
          ) : showErrors && hasErrors ? (
            <span className="text-rose-600 dark:text-rose-400">Vui lòng hoàn thiện các trường bắt buộc (*)</span>
          ) : isDirty ? (
            'Có thay đổi chưa lưu'
          ) : (
            'Điền thông tin để tiếp nhận hồ sơ'
          )}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createDossier.isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-semibold shadow-sm disabled:opacity-60"
        >
          {createDossier.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Tiếp nhận hồ sơ
        </button>
      </div>
    </div>
  );
}
