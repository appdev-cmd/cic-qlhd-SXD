"use client";

import React, { useState, useMemo } from 'react';
import { SlidePanelHeader } from '@/components/ui/SlidePanelHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/NumberInput';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { FilePlus2, Building2, MapPin, DollarSign, Layers } from 'lucide-react';
import { api } from '@/lib/api';

interface CreateDossierPanelProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const initialForm = {
  projectName: '',
  investor: '',
  location: '',
  investmentType: 'PUBLIC',
  projectGroup: 'GROUP_C',
  constructionGrade: 'GRADE_III',
  constructionType: 'Dân dụng',
  totalInvestment: 0,
  fundingSource: 'Ngân sách Nhà nước',
  dossierType: 'APPRAISAL_BCNCKT',
  notes: '',
};

export const CreateDossierPanel: React.FC<CreateDossierPanelProps> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tính isDirty bằng so sánh sâu dữ liệu theo chuẩn ERP
  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(initialForm);
  }, [formData]);

  // Kích hoạt Guard bảo vệ thay đổi chưa lưu
  const { handleGuardClose, handleSaveClose } = useUnsavedChangesGuard(isDirty, {
    title: 'Hủy tiếp nhận hồ sơ?',
    message: 'Thông tin hồ sơ dự án bạn vừa điền chưa được lưu vào hệ thống. Bạn có chắc muốn hủy bỏ?',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectName || !formData.investor) {
      setErrorMsg('Vui lòng nhập đầy đủ Tên dự án và Chủ đầu tư.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Chuẩn bị payload theo CreateDossierDto của NestJS
      const payload = {
        type: formData.dossierType,
        notes: formData.notes || `Hồ sơ tiếp nhận trực tiếp: ${formData.projectName}`,
        project: {
          name: formData.projectName,
          investor: formData.investor,
          location: formData.location || 'Tỉnh Điện Biên',
          investmentType: formData.investmentType,
          projectGroup: formData.projectGroup,
          constructionGrade: formData.constructionGrade,
          constructionType: formData.constructionType,
          totalInvestment: Number(formData.totalInvestment) || 0,
          fundingSource: formData.fundingSource,
        },
      };

      await api.createDossier(payload);
      handleSaveClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể tạo hồ sơ. Vui lòng kiểm tra lại kết nối API.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
      <SlidePanelHeader
        title="Tiếp nhận hồ sơ mới"
        subtitle="Sở Xây dựng tỉnh Điện Biên — Thủ tục thẩm định NĐ 217/2026/NĐ-CP"
        icon={<FilePlus2 className="h-5 w-5" />}
        onClose={handleGuardClose}
      />

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Loại thủ tục tiếp nhận */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Loại thủ tục đề nghị thẩm định / cấp phép <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-colors ${
                  formData.dossierType === 'APPRAISAL_BCNCKT'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dossierType"
                    checked={formData.dossierType === 'APPRAISAL_BCNCKT'}
                    onChange={() => setFormData({ ...formData, dossierType: 'APPRAISAL_BCNCKT' })}
                    className="text-blue-600"
                  />
                  <span className="font-semibold text-sm">Thẩm định BCNCKT</span>
                </div>
                <span className="text-xs text-slate-500 mt-1 pl-5">Mẫu số 01 — Dự án đầu tư xây dựng</span>
              </label>

              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-colors ${
                  formData.dossierType === 'PERMIT_GPXD'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dossierType"
                    checked={formData.dossierType === 'PERMIT_GPXD'}
                    onChange={() => setFormData({ ...formData, dossierType: 'PERMIT_GPXD' })}
                    className="text-blue-600"
                  />
                  <span className="font-semibold text-sm">Cấp Giấy phép XD</span>
                </div>
                <span className="text-xs text-slate-500 mt-1 pl-5">Công trình Cấp I, Cấp II thuộc thẩm quyền Sở</span>
              </label>
            </div>
          </div>

          {/* Thông tin dự án */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              Thông tin dự án xây dựng
            </h3>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Tên công trình / dự án <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.projectName}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                placeholder="Ví dụ: Xây dựng Trường THPT Thành phố Điện Biên Phủ"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Chủ đầu tư / Cơ quan đề nghị <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.investor}
                  onChange={(e) => setFormData({ ...formData, investor: e.target.value })}
                  placeholder="Ban QLDA chuyên ngành / Doanh nghiệp"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Địa điểm xây dựng
                </label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Xã/Phường, Huyện/TP, Tỉnh Điện Biên"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Nguồn vốn</label>
                <select
                  value={formData.investmentType}
                  onChange={(e) => setFormData({ ...formData, investmentType: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="PUBLIC">Đầu tư công</option>
                  <option value="BUSINESS">Vốn doanh nghiệp</option>
                  <option value="PPP">Đối tác công tư (PPP)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Nhóm dự án</label>
                <select
                  value={formData.projectGroup}
                  onChange={(e) => setFormData({ ...formData, projectGroup: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="GROUP_A">Nhóm A (SLA 30 ngày)</option>
                  <option value="GROUP_B">Nhóm B (SLA 20 ngày)</option>
                  <option value="GROUP_C">Nhóm C (SLA 15 ngày)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Cấp công trình</label>
                <select
                  value={formData.constructionGrade}
                  onChange={(e) => setFormData({ ...formData, constructionGrade: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="GRADE_I">Cấp I</option>
                  <option value="GRADE_II">Cấp II</option>
                  <option value="GRADE_III">Cấp III</option>
                  <option value="GRADE_IV">Cấp IV</option>
                </select>
              </div>
            </div>

            {/* Ô nhập tiền Tổng mức đầu tư dùng NumberInput chuẩn ERP */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Tổng mức đầu tư (TMĐT dự kiến)</span>
                <span className="text-[11px] text-blue-600 font-semibold">Tự động định dạng VNĐ</span>
              </label>
              <NumberInput
                value={formData.totalInvestment}
                onChange={(val) => setFormData({ ...formData, totalInvestment: val })}
                placeholder="Nhập số tiền TMĐT..."
                suffix="VNĐ"
                showFormattedHint
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Ghi chú tiếp nhận & Thành phần hồ sơ ban đầu
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Ghi nhận thành phần hồ sơ nộp, giấy tờ pháp lý kèm theo..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <Button type="button" variant="outline" onClick={handleGuardClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
          >
            {isSubmitting ? 'Đang thụ lý...' : 'Xác nhận tiếp nhận'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateDossierPanel;
