import React,{useEffect,useState} from 'react';
import {useAuth} from '../../context/AuthContext';
import {appraisalService} from '../../services/appraisalService';
import type {Health} from '../../types/appraisal';
import {ModelConnection} from './ModelConnection';
import {DossierGrid} from './DossierGrid';
import {AiEvaluation} from './AiEvaluation';
export function RuntimeSettings(){
  const {profile,mode}=useAuth();const [health,setHealth]=useState<Health|null>(null);const [error,setError]=useState('');
  useEffect(()=>{appraisalService.health().then(setHealth).catch(e=>setError(e.message));},[]);
  const roles=[{id:'officer',name:'Chuyên viên',scope:'Tiếp nhận, nộp tài liệu, kiểm tra AI, ghi ý kiến và trình rà soát.'},{id:'head_of_department',name:'Trưởng phòng',scope:'Phân công, xác nhận hạn nội bộ, trả xử lý và hoàn tất rà soát.'},{id:'director',name:'Lãnh đạo Sở',scope:'Rà soát nội bộ trong phạm vi phòng/tỉnh đã cấp. Chưa tích hợp ký số.'},{id:'admin',name:'Quản trị',scope:'Quản trị dữ liệu thử nghiệm; không thay lãnh đạo phê duyệt nghiệp vụ.'}];
  return <div className="space-y-5 text-ink dark:text-ink"><h1 className="text-2xl font-bold">Cài đặt hệ thống</h1><section className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-5 space-y-2"><h2 className="font-semibold">Phiên làm việc</h2><p>{profile?.full_name||'Chuyên viên mẫu'} · {profile?.department||'Cục bộ'}</p><p className="text-sm text-ink-muted dark:text-ink-muted">Nguồn dữ liệu: {mode==='cloud'?'Supabase cloud thử nghiệm':'Kho demo cục bộ'} · OCR: {health?.ocrAvailable?'Có bộ máy OCR':'Chưa có bộ máy OCR; dùng PDF có lớp chữ, DOCX hoặc TXT'}</p></section>
    {error&&<p className="text-red-700 dark:text-red-300" role="alert">{error}</p>}
    <ModelConnection health={health} onRefresh={async()=>setHealth(await appraisalService.health())}/>
    <AiEvaluation/>
    <DossierGrid storageKey="role-matrix" rows={roles} columns={[{label:'Vai trò',value:r=>r.name,width:180},{label:'Phạm vi thao tác',value:r=>r.scope,width:650}]}/>
    <section className="rounded-xl border border-border dark:border-border bg-surface dark:bg-surface p-5 space-y-2 text-sm"><h2 className="font-semibold">Phạm vi bản demo</h2><p>Đăng nhập nhanh 4 vai trò; dự án và ba nghiệp vụ; tài liệu, rà soát AI, lịch sử, phiếu xử lý và dự thảo A4.</p><p className="text-ink-muted dark:text-ink-muted">Email SMTP, domain/production, chữ ký số, cổng dịch vụ công và lớp quy hoạch chính thức thuộc giai đoạn vận hành chính thức. Các thao tác hoàn tất hiện chỉ là rà soát nội bộ.</p></section>
  </div>;
}
