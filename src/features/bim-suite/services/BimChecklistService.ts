// Field checklists (ACC Forms): templates and sheets; signing a sheet records the LOD 500 field verification.
import { supabase } from '@/features/bim-suite/adapters/supabase';
import { legacyDb } from '../lib/bimDb';
import type { ChecklistAnswer, ChecklistItem } from '../lib/checklistForm';

type DbError = { message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export type FieldMethod = 'quet_laser' | 'toan_dac' | 'do_thu_cong' | 'nghiem_thu';
export interface ChecklistTemplate {
  id: string;
  project_id: string | null;
  ten: string;
  loai_ifc: string[];
  muc: ChecklistItem[];
  phuong_phap: FieldMethod | null;
  dung_sai_mm: number | null;
  can_cu: string | null;
  la_demo: boolean;
}
export interface ChecklistSheet {
  id: string;
  project_id: string;
  model_id: string;
  global_ids: string[];
  mau_id: string | null;
  tieu_de: string;
  ket_qua_muc: ChecklistAnswer[];
  ket_luan: 'dat' | 'sai_lech' | null;
  sai_so_mm: number | null;
  dung_sai_mm: number | null;
  ngay: string | null;
  don_vi: string | null;
  phuong_phap: FieldMethod | null;
  bien_ban: string | null;
  anh: string[];
  ghi_chu: string | null;
  trang_thai: 'nhap' | 'da_ky';
  la_demo: boolean;
  ky_luc: string | null;
  created_at: string;
}
export type SheetDraft = Omit<ChecklistSheet, 'id' | 'project_id' | 'trang_thai' | 'la_demo' | 'ky_luc' | 'created_at'>;

export const BimChecklistService = {
  async templates(projectId: string): Promise<ChecklistTemplate[]> {
    const { data, error } = await legacyDb
      .from('bim_checklist_mau')
      .select('*')
      .or(`project_id.is.null,project_id.eq.${projectId}`)
      .order('ten');
    if (error) fail(error, 'Lỗi tải mẫu checklist');
    return (data ?? []) as ChecklistTemplate[];
  },
  async sheets(projectId: string): Promise<ChecklistSheet[]> {
    const { data, error } = await legacyDb
      .from('bim_checklist_phieu')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) fail(error, 'Lỗi tải phiếu checklist');
    return (data ?? []) as ChecklistSheet[];
  },
  async save(id: string | null, draft: SheetDraft): Promise<ChecklistSheet> {
    const { data, error } = await legacyDb.rpc('bim_checklist_luu', { p_id: id, p_row: draft });
    if (error) fail(error, 'Không lưu được phiếu');
    return data as ChecklistSheet;
  },
  async sign(id: string): Promise<ChecklistSheet> {
    const { data, error } = await legacyDb.rpc('bim_checklist_ky', { p_id: id });
    if (error) fail(error, 'Không ký được phiếu');
    return data as ChecklistSheet;
  },
  async remove(id: string): Promise<void> {
    const { error } = await legacyDb.rpc('bim_checklist_xoa', { p_id: id });
    if (error) fail(error, 'Không xóa được phiếu');
  },
  /** Stores a field photo under field/{project}/ in the private bim-models bucket; returns its storage path. */
  async uploadPhoto(projectId: string, file: File): Promise<string> {
    const ext = PHOTO_TYPES[file.type];
    if (!ext) throw new Error('Ảnh hiện trường phải là JPEG, PNG hoặc WebP.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Ảnh hiện trường tối đa 20 MB.');
    const path = `field/${projectId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('bim-models')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) fail(error, 'Không lưu được ảnh hiện trường');
    return path;
  },
};
