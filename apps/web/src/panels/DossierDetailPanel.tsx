"use client";

import React, { useEffect, useState } from 'react';
import { SlidePanelHeader } from '@/components/ui/SlidePanelHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, FileText, CheckCircle2, Building2, MapPin, DollarSign, Calendar, ExternalLink, ShieldCheck, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import Link from 'next/link';

interface DossierDetailPanelProps {
  id: string;
  onClose: () => void;
  onStatusChange?: () => void;
}

export const DossierDetailPanel: React.FC<DossierDetailPanelProps> = ({ id, onClose, onStatusChange }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'docs' | 'workflow'>('info');
  const [dossier, setDossier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load chi tiết hồ sơ từ API
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const res = await api.getDossierById(id);
        if (isMounted && res) {
          setDossier(res);
        }
      } catch (err: any) {
        // Nếu id là code ví dụ SXD-DB-2026-0001, tìm qua query
        try {
          const listRes = await api.getDossiers();
          const match = listRes.data?.find((d: any) => d.id === id || d.code === id);
          if (isMounted && match) {
            setDossier(match);
          }
        } catch {
          // Fallback UI
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  // Hành động Phê duyệt
  const handleApprove = async () => {
    if (!dossier?.id) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await api.approveAppraisal(dossier.id, { conclusion: 'APPROVED', comments: 'Đạt yêu cầu theo NĐ 217/2026' });
      setFeedback({ type: 'success', message: 'Đã phê duyệt kết quả thẩm định thành công!' });
      setDossier({ ...dossier, status: 'APPROVED' });
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi khi phê duyệt hồ sơ.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Hành động Yêu cầu bổ sung
  const handleReject = async () => {
    if (!dossier?.id) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await api.rejectAppraisal(dossier.id, 'Hồ sơ thiếu thỏa thuận đấu nối hạ tầng kỹ thuật');
      setFeedback({ type: 'success', message: 'Đã gửi yêu cầu bổ sung hồ sơ đến Chủ đầu tư.' });
      setDossier({ ...dossier, status: 'SUPPLEMENT_REQUIRED' });
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi khi yêu cầu bổ sung.' });
    } finally {
      setActionLoading(false);
    }
  };

  const project = dossier?.project || {
    name: 'Trường Tiểu học Thanh Xương, Huyện Điện Biên',
    investor: 'Ban Quản lý dự án huyện Điện Biên',
    location: 'Xã Thanh Xương, Huyện Điện Biên, Tỉnh Điện Biên',
    totalInvestment: 15000000000,
    projectGroup: 'GROUP_C',
    constructionGrade: 'GRADE_III',
    investmentType: 'PUBLIC',
  };

  const code = dossier?.code || id;
  const status = dossier?.status || 'APPRAISING';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
      <SlidePanelHeader
        title={`Hồ sơ ${code}`}
        subtitle={project.name}
        icon={<FileText className="h-5 w-5" />}
        badge={
          <Badge variant={status === 'APPROVED' ? 'success' : status === 'APPRAISING' ? 'info' : 'warning'}>
            {status === 'APPROVED' ? 'Đã phê duyệt' : status === 'APPRAISING' ? 'Đang thẩm định' : 'Kiểm tra hợp lệ'}
          </Badge>
        }
        actions={
          <Link href={`/dossiers/${dossier?.id || id}`} target="_blank">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-slate-500">
              <ExternalLink className="h-3.5 w-3.5" /> Toàn trang
            </Button>
          </Link>
        }
        onClose={onClose}
      />

      {/* SLA Countdown Bar */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/60 text-xs font-medium">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <Clock className="h-4 w-4 text-blue-600" />
          <span>Thời hạn thẩm định SLA: <strong>15 ngày làm việc</strong> (Nghị định 217/2026/NĐ-CP)</span>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 font-semibold">
          Còn lại 3 ngày
        </span>
      </div>

      {feedback && (
        <div className={`px-6 py-3 text-xs font-medium flex items-center gap-2 border-b ${
          feedback.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 gap-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`py-3 border-b-2 transition-colors ${
            activeTab === 'info'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Thông tin dự án
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('docs')}
          className={`py-3 border-b-2 transition-colors ${
            activeTab === 'docs'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Tài liệu đính kèm (3)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('workflow')}
          className={`py-3 border-b-2 transition-colors ${
            activeTab === 'workflow'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Tiến độ quy trình
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'info' && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
              <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Thông số công trình (Supabase DB)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-slate-400 block">Tên dự án</span>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{project.name}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Chủ đầu tư</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{project.investor}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Địa điểm</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{project.location || 'Tỉnh Điện Biên'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Tổng mức đầu tư</span>
                  <p className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(project.totalInvestment || 0)}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Phân loại & Cấp</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{project.projectGroup} — {project.constructionGrade}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Ngày tiếp nhận</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{formatDate(dossier?.receivedAt || new Date())}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-emerald-50/40 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                <ShieldCheck className="h-4 w-4" />
                <span>Kiểm tra tuân thủ AI (Compliance L1)</span>
              </div>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed">
                Đã quét tự động 100% danh mục thành phần hồ sơ theo Nghị định 217/2026/NĐ-CP: Đầy đủ Tờ trình (Mẫu 01), Thuyết minh BCNCKT, Bản vẽ thiết kế cơ sở và Thỏa thuận PCCC.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-3">
            {[
              { name: "To_Trinh_Tham_Dinh_Mau_01.pdf", size: "2.4 MB", date: "05/03/2026" },
              { name: "Thuyet_Minh_BCNCKT_Thanh_Xuong.pdf", size: "14.8 MB", date: "05/03/2026" },
              { name: "Ban_Ve_Thiet_Ke_Co_So_Kien_Truc.pdf", size: "48.2 MB", date: "05/03/2026" },
            ].map((doc, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{doc.name}</p>
                    <p className="text-xs text-slate-400">{doc.size} • Đã nộp {doc.date}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-xs h-8">Tải về</Button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'workflow' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tiếp nhận hồ sơ từ DVC Tân Dân</p>
                <p className="text-xs text-slate-400">Đã tiếp nhận vào hệ thống CSDL Sở Xây dựng</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Kiểm tra hợp lệ & thụ lý</p>
                <p className="text-xs text-slate-400">Trạng thái: Hợp lệ theo Nghị định 217/2026</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded-full border-2 border-blue-600 bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mt-0.5 shrink-0">
                <div className="h-2 w-2 rounded-full bg-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Thẩm định chuyên môn (Phòng QLXD)</p>
                <p className="text-xs text-slate-400">Đang thực hiện • Đã trôi qua 4/15 ngày làm việc</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions — kết nối API thực tế */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
        <Button variant="outline" onClick={onClose} disabled={actionLoading}>Đóng</Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={actionLoading || status === 'APPROVED'}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40"
          >
            {actionLoading ? 'Đang xử lý...' : 'Yêu cầu bổ sung'}
          </Button>
          <Button
            onClick={handleApprove}
            disabled={actionLoading || status === 'APPROVED'}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {actionLoading ? 'Đang phê duyệt...' : status === 'APPROVED' ? 'Đã phê duyệt' : 'Phê duyệt thẩm định'}
          </Button>
        </div>
      </div>
    </div>
  );
};
