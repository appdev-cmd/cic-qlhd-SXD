// features/bim/services/BimService.ts
// Service API tương tác CSDL Supabase cho phân hệ BIM

import { supabase } from '@/features/bim-suite/adapters/supabase';
import { readAllRows, readPage, type BoundedList } from '../lib/readAllRows';
import { bimDb, bimRpc, legacyDb } from '../lib/bimDb';
import type { BimInsert, BimUpdate } from '@/features/bim-suite/types/bim-db.types';
import { hashFile, resumableUpload, zipIfcFile, type ProgressFn } from '../lib/bimUpload';
import { convertBimModelInBrowser } from '../lib/browserIfcConverter';
import { BimWorkspaceService } from './BimWorkspaceService';
import type { BimCostRow } from '@/features/bim-suite/types/bim.types';

export interface BimVersionDiffSummary {
  counts: { them_moi: number; da_xoa: number; da_sua: number };
  groups: {
    trang_thai: BimVersionDiffRow['trang_thai'];
    loai_cau_kien: string;
    so_luong: number;
    the_tich: number;
    chenh_lech: number;
  }[];
  samples: { trang_thai: BimVersionDiffRow['trang_thai']; ten_cau_kien: string | null; loai_cau_kien: string }[];
}
import { logAuditEvent } from '@/features/bim-suite/adapters/audit';
import { withStorageApiKey } from '@/features/bim-suite/adapters/supabase';
import { ilikeAny } from '@/features/bim-suite/adapters/utils';
import { buildElementPageFilter, type ElementCursor } from '../lib/bimSearch';
import {
  BimModel,
  BimElement,
  BimElementFilter,
  BimQuantitySummaryRow,
  BimSavedView,
  BimIssue,
  BimIssueComment,
  BimDiscipline,
  BimDocumentLink,
  BimLinkType,
  BimVersionDiffRow,
  BimTask,
  BimQueueEntry,
  BimBasemap,
  BimClashSession,
  BimClashRecord,
  BimClashRow,
  BimClashStatus,
  BimCdeState,
  BimCdeHistory,
  BimFieldRef,
  BimSetCondition,
  BimSmartSet,
  BimFieldInfo,
  BimElementRef,
  BimUnitPrice,
  BimQualityRule,
  BimQualityReport,
  BimProjectPerson,
  BimLibraryDocument,
} from '@/features/bim-suite/types/bim.types';

import type { BimComposition } from '../lib/tabUtils';

// Workspace tasks (Nhiệm vụ) mapped to the task shape the ported BIM code uses.
const WORKSPACE_TASK_COLUMNS = 'id,title,status,due_date,created_at,updated_at';
type WorkspaceTaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};
const toBimTask = (t: WorkspaceTaskRow): BimTask => ({
  ma_nhiem_vu: t.id,
  tieu_de: t.title,
  trang_thai: t.status,
  tien_do: t.status === 'done' ? 100 : null,
  ngay_bat_dau: null,
  ngay_han: t.due_date,
  ngay_bat_dau_thuc_te: null,
  ngay_ket_thuc_thuc_te: t.status === 'done' ? t.updated_at : null,
});

export class BimService {
  // ============================================================
  // 1. QUẢN LÝ MÔ HÌNH (bim_models)
  // ============================================================

  static async getModels(projectId: string, workId?: string): Promise<BimModel[]> {
    // Mô hình xóa mềm bị RLS ẩn với người dùng thường; lọc thêm ở client để quản trị cũng không thấy trong trình xem
    let query = bimDb
      .from('bim_models')
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (workId) {
      query = query.eq('work_id', workId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Lỗi tải danh sách mô hình BIM: ${error.message}`);
    return (data as unknown as BimModel[]) || [];
  }

  /** Màn quản trị: gồm cả mô hình đã xóa mềm (deleted_at khác null) để khôi phục / xóa vĩnh viễn */
  static async getAllModels(): Promise<(BimModel & { du_an?: { ten_du_an?: string } })[]> {
    const { data, error } = await bimDb
      .from('bim_models')
      .select('*, du_an:project_id(ten_du_an:name)')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Lỗi tải toàn bộ danh sách mô hình BIM: ${error.message}`);
    return (data as any[]) || [];
  }

  static async getAllIssues(): Promise<BimIssue[]> {
    const { data, error } = await bimDb.from('bim_issues').select('*').order('created_at', { ascending: false });

    if (error) throw new Error(`Lỗi tải danh sách vướng mắc BIM: ${error.message}`);
    return (data as BimIssue[]) || [];
  }

  static async getBimStats() {
    const [modelsRes, issuesRes, elementsCountRes] = await Promise.all([
      bimDb.from('bim_models').select('id, status, element_count, file_size').is('deleted_at', null),
      bimDb.from('bim_issues').select('id, status, priority'),
      bimDb.from('bim_elements').select('id', { count: 'exact', head: true }),
    ]);

    const models = modelsRes.data || [];
    const issues = issuesRes.data || [];
    const totalElements =
      elementsCountRes.count || models.reduce((sum: number, m: any) => sum + (m.element_count || 0), 0);

    return {
      totalModels: models.length,
      readyModels: models.filter((m: any) => m.status === 'ready').length,
      processingModels: models.filter((m: any) => m.status === 'processing' || m.status === 'uploaded').length,
      totalElements,
      totalFileSize: models.reduce((sum: number, m: any) => sum + (Number(m.file_size) || 0), 0),
      totalIssues: issues.length,
      openIssues: issues.filter((i: any) => i.status === 'open' || i.status === 'in_progress').length,
      criticalIssues: issues.filter((i: any) => i.priority === 'critical' || i.priority === 'high').length,
    };
  }

  static async getModelById(id: string): Promise<BimModel | null> {
    const { data, error } = await bimDb.from('bim_models').select('*').eq('id', id).maybeSingle();

    if (error) throw new Error(`Lỗi tải mô hình BIM: ${error.message}`);
    return (data as unknown as BimModel) ?? null;
  }

  /** SHA-256 đầy đủ của tệp, băm theo khúc trong Web Worker (chống trùng ở máy chủ dùng giá trị này). */
  static async fileFingerprint(file: File, onProgress?: ProgressFn, signal?: AbortSignal): Promise<string> {
    return hashFile(file, onProgress, signal);
  }

  static async findDuplicateModel(projectId: string, fingerprint: string): Promise<BimModel | null> {
    const { data } = await bimDb
      .from('bim_models')
      .select('*')
      .eq('project_id', projectId)
      .eq('file_hash', fingerprint)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    return (data as unknown as BimModel) || null;
  }

  /**
   * Tải mô hình: băm SHA-256 (worker) → nén .ifczip nếu IFC thô > 10 MB (worker) → tải lên tiếp tục được (TUS)
   * → RPC bim_register_model_upload (máy chủ kiểm quyền, chống trùng theo băm, cấp số phiên bản).
   * Tạo bản ghi lỗi thì gỡ tệp vừa tải để không để lại tệp mồ côi trong kho.
   */
  static async uploadModel(
    projectId: string,
    file: File,
    discipline: BimDiscipline = 'TOAN_THE',
    workId?: string,
    options: {
      uploadedBy?: string;
      previousModel?: BimModel | null;
      versionNote?: string;
      fileHash?: string;
      onProgress?: ProgressFn;
      signal?: AbortSignal;
    } = {},
  ): Promise<BimModel> {
    const { onProgress, signal } = options;
    const fingerprint =
      options.fileHash && /^[0-9a-f]{64}$/.test(options.fileHash)
        ? options.fileHash
        : await this.fileFingerprint(file, onProgress, signal);
    const duplicate = await this.findDuplicateModel(projectId, fingerprint);
    if (duplicate) {
      throw new Error(
        `File này đã được tải lên trước đó (mô hình "${duplicate.file_name}", phiên bản ${duplicate.phien_ban ?? 1}).`,
      );
    }

    let uploadData: Blob = file;
    let safeName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    if (/\.ifc$/i.test(safeName) && file.size > 10 * 1024 * 1024) {
      const zipped = await zipIfcFile(file, onProgress, signal);
      if (zipped) {
        uploadData = zipped;
        safeName = safeName.replace(/\.ifc$/i, '.ifczip');
      }
    }
    // Thư mục theo băm: tải lại cùng tệp sau khi trang đóng sẽ tiếp tục đúng phiên TUS.
    const storagePath = `models/${projectId}/${fingerprint.slice(0, 16)}/${safeName}`;
    await resumableUpload({
      bucket: 'bim-models',
      path: storagePath,
      file: uploadData,
      contentType: /\.(ifczip|zip)$/i.test(safeName) ? 'application/zip' : 'application/x-step',
      onProgress,
      signal,
    });

    onProgress?.({ phase: 'register', percent: 0 });
    const previous = options.previousModel || null;
    const { data, error } = await bimDb.rpc('bim_register_model_upload', {
      p_project: projectId,
      p_ifc_path: storagePath,
      p_file_name: file.name,
      p_file_size: file.size,
      p_file_hash: fingerprint,
      p_discipline: previous?.discipline || discipline,
      p_work: workId || undefined,
      p_previous_model: previous?.id || undefined,
      p_version_note: options.versionNote || undefined,
      p_uploaded_by: options.uploadedBy || undefined,
    });
    if (error || !data) {
      onProgress?.({ phase: 'cleanup', percent: 0 });
      const { error: cleanupError } = await supabase.storage.from('bim-models').remove([storagePath]);
      if (cleanupError) console.warn('[BIM Upload] Chưa gỡ được tệp mồ côi:', storagePath, cleanupError.message);
      throw new Error(`Lỗi lưu bản ghi mô hình: ${error?.message || 'máy chủ không trả bản ghi'}`);
    }
    onProgress?.({ phase: 'register', percent: 100 });
    let model = data as unknown as BimModel;

    try {
      const converted = await convertBimModelInBrowser(model, {
        sourceFile: file,
        onProgress: (percent, message) => {
          onProgress?.({ phase: 'convert', percent, message });
        },
      });
      if (converted.model) {
        model = converted.model;
      }
    } catch (convertErr) {
      console.warn('[BIM Upload] Chuyển đổi trực tiếp trên trình duyệt gặp lỗi, có thể bấm xử lý lại:', convertErr);
    }

    logAuditEvent({
      action: 'CREATE',
      targetEntity: 'bim_models',
      targetId: String(model.id),
      targetName: file.name,
      details: `Tải lên mô hình BIM "${file.name}" (phiên bản ${model.phien_ban}, ${(file.size / 1048576).toFixed(1)} MB) cho dự án ${projectId}`,
      newValues: { file_name: file.name, discipline: model.discipline, phien_ban: model.phien_ban },
    });
    return model;
  }

  /**
   * Xóa mềm (RPC bim_delete_model): mô hình bị ẩn khỏi người dùng thường, tệp và cấu kiện giữ nguyên;
   * vướng mắc / góc nhìn vẫn còn. Quản trị khôi phục bằng restoreModel hoặc xóa hẳn bằng purgeModel.
   */
  static async deleteModel(id: string): Promise<void> {
    const { data, error } = await bimDb.rpc('bim_delete_model', { p_id: id });
    if (error) throw new Error(`Lỗi xóa mô hình: ${error.message}`);
    const model = (Array.isArray(data) ? data[0] : data) as BimModel | null;

    logAuditEvent({
      action: 'DELETE',
      targetEntity: 'bim_models',
      targetId: id,
      targetName: model?.file_name,
      details: model
        ? `Xóa mềm mô hình BIM "${model.file_name}" (phiên bản ${model.phien_ban ?? 1}) của dự án ${model.project_id} — có thể khôi phục`
        : 'Xóa mềm mô hình BIM',
      oldValues: model
        ? { file_name: model.file_name, project_id: model.project_id, element_count: model.element_count }
        : undefined,
    });
  }

  /** Khôi phục mô hình đã xóa mềm (RPC bim_restore_model) */
  static async restoreModel(id: string): Promise<BimModel> {
    const { data, error } = await bimDb.rpc('bim_restore_model', { p_id: id });
    if (error) throw new Error(`Lỗi khôi phục mô hình: ${error.message}`);
    const model = (Array.isArray(data) ? data[0] : data) as BimModel;

    logAuditEvent({
      action: 'UPDATE',
      targetEntity: 'bim_models',
      targetId: id,
      targetName: model?.file_name,
      details: model
        ? `Khôi phục mô hình BIM "${model.file_name}" (phiên bản ${model.phien_ban ?? 1}) của dự án ${model.project_id}`
        : 'Khôi phục mô hình BIM',
    });
    return model;
  }

  /**
   * Xóa vĩnh viễn (RPC bim_purge_model, chỉ quản trị): xóa bản ghi và cấu kiện, rồi gỡ tệp IFC / Fragments
   * khỏi kho theo đường dẫn RPC trả về. Vướng mắc / góc nhìn mất liên kết mô hình nhưng không bị xóa.
   */
  static async purgeModel(id: string): Promise<void> {
    const { data, error } = await bimDb.rpc('bim_purge_model', { p_id: id });
    if (error) throw new Error(`Lỗi xóa vĩnh viễn mô hình: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as {
      ifc_path?: string | null;
      frag_path?: string | null;
      properties_path?: string | null;
    } | null;
    const paths = [row?.ifc_path, row?.frag_path, row?.properties_path].filter((p): p is string => !!p);
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('bim-models').remove(paths);
      if (storageError) console.warn('[BIM] Đã xóa bản ghi nhưng chưa gỡ được tệp trong kho:', storageError.message);
    }

    logAuditEvent({
      action: 'DELETE',
      targetEntity: 'bim_models',
      targetId: id,
      details: `Xóa vĩnh viễn mô hình BIM (${paths.length} tệp trong kho bim-models đã gỡ)`,
      oldValues: row ? { ifc_path: row.ifc_path, frag_path: row.frag_path } : undefined,
    });
  }

  /** Lưu độ dịch toạ độ khi ghép mô hình (mét) — RPC bim_set_model_offset kiểm tra quyền và kiểu số */
  static async saveModelOffset(id: string, offset: { x: number; y: number; z: number }): Promise<void> {
    const { error } = await bimDb.rpc('bim_set_model_offset', { p_id: id, p_offset: offset });
    if (error) throw new Error(`Lỗi lưu toạ độ mô hình: ${error.message}`);
  }

  /** Đưa mô hình lỗi hoặc chờ chuyển đổi chạy chuyển đổi trực tiếp trên trình duyệt (WebAssembly, không cần Docker) */
  static async retryModel(id: string): Promise<void> {
    const { data, error } = await bimDb.rpc('bim_retry_model', { p_id: id });
    if (error) throw new Error(`Lỗi yêu cầu xử lý lại mô hình: ${error.message}`);
    const model = (Array.isArray(data) ? data[0] : data) as BimModel | null;

    logAuditEvent({
      action: 'UPDATE',
      targetEntity: 'bim_models',
      targetId: id,
      details: 'Chuyển đổi lại mô hình BIM trên trình duyệt (WebAssembly)',
    });

    if (model) {
      await convertBimModelInBrowser(model);
    }
  }

  // ── Tổ hợp mô hình mặc định của dự án (bim_project_settings.to_hop_mac_dinh) ──
  static async getDefaultComposition(
    projectId: string,
  ): Promise<(BimComposition & { ghi_chu?: string; cap_nhat_boi?: string }) | null> {
    const { data, error } = await bimDb
      .from('bim_project_settings')
      .select('to_hop_mac_dinh')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) {
      console.warn('[BIM] Không đọc được tổ hợp mặc định:', error.message);
      return null;
    }
    return (data?.to_hop_mac_dinh as unknown as BimComposition) || null;
  }

  static async saveDefaultComposition(
    projectId: string,
    composition: BimComposition,
    userName?: string,
  ): Promise<void> {
    const payload = { ...composition, cap_nhat_boi: userName || null, cap_nhat_luc: new Date().toISOString() };
    const { error } = await bimDb
      .from('bim_project_settings')
      .upsert({ project_id: projectId, to_hop_mac_dinh: payload }, { onConflict: 'project_id' });
    if (error) throw new Error(`Lỗi lưu tổ hợp mặc định: ${error.message}`);
    logAuditEvent({
      action: 'UPDATE',
      targetEntity: 'bim_project_settings',
      targetId: projectId,
      details: `Đặt tổ hợp mô hình BIM mặc định cho dự án ${projectId}: 1 mô hình chính + ${composition.overlay.length} mô hình ghép`,
      newValues: payload,
    });
  }

  // ============================================================
  // 2. CẤU KIỆN & KHỐI LƯỢNG (bim_elements)
  // ============================================================

  /** Cột nhẹ cho danh sách/cây cấu kiện (không tải thuoc_tinh JSONB) */
  private static readonly ELEMENT_LIST_COLUMNS =
    'id, model_id, project_id, express_id, global_id, ten_cau_kien, loai_cau_kien, phan_doan_tang, vat_lieu, the_tich_be_tong, dien_tich, dien_tich_van_khuon, chieu_dai, trong_luong, nguon_khoi_luong';

  /**
   * Tải một trang cấu kiện theo bộ lọc. `phan_doan_tang = ''` nghĩa là cấu kiện chưa gán vị trí.
   * Tìm kiếm hiểu từ đồng nghĩa tiếng Việt và gõ không dấu ("cot", "cột" → IFCCOLUMN) trên tên, GUID, vật liệu, loại.
   * Phân trang keyset theo (ten_cau_kien, id) — trang sau truyền `nextCursor` của trang trước, không dùng OFFSET.
   */
  static async getElementsPage(
    modelId: string,
    filter: BimElementFilter = {},
    cursor: ElementCursor | null = null,
    pageSize = 200,
  ): Promise<{ items: BimElement[]; hasMore: boolean; nextCursor: ElementCursor | null }> {
    let query = (supabase as any)
      .from('bim_elements')
      .select(this.ELEMENT_LIST_COLUMNS)
      .eq('model_id', modelId)
      .order('ten_cau_kien', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (filter.loai_cau_kien) query = query.eq('loai_cau_kien', filter.loai_cau_kien);
    if (filter.phan_doan_tang !== undefined) {
      query =
        filter.phan_doan_tang === ''
          ? query.is('phan_doan_tang', null)
          : query.eq('phan_doan_tang', filter.phan_doan_tang);
    }

    // Tìm kiếm + điều kiện keyset gộp trong một tham số or= (giá trị đã đặt trong nháy kép, an toàn với dấu phẩy/ngoặc)
    const logic = buildElementPageFilter(filter.search, cursor);
    if (logic) query = query.or(logic);

    // Lấy dư 1 dòng để biết còn trang sau
    const { data, error } = await query.limit(pageSize + 1);
    if (error) throw new Error(`Lỗi tải danh sách cấu kiện: ${error.message}`);
    const rows = (data as BimElement[]) || [];
    const items = rows.slice(0, pageSize);
    const hasMore = rows.length > pageSize;
    const last = items[items.length - 1];
    return { items, hasMore, nextCursor: hasMore && last ? { ten: last.ten_cau_kien ?? null, id: last.id } : null };
  }

  // ============================================================
  // NỀN BẢN ĐỒ / ẢNH FLYCAM (I5)
  // ============================================================

  static async getBasemap(projectId: string): Promise<BimBasemap | null> {
    const { data, error } = await legacyDb.from('bim_nen_ban_do').select('*').eq('project_id', projectId).maybeSingle();
    if (error) throw new Error(`Lỗi tải nền bản đồ: ${error.message}`);
    return (data as BimBasemap) || null;
  }

  static async saveBasemap(config: BimBasemap, image?: File | null): Promise<BimBasemap> {
    let path = config.duong_dan || null;
    if (image) {
      const ext = (image.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      path = `nen/${config.project_id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('bim-models')
        .upload(path, image, { contentType: image.type || 'image/jpeg', upsert: true });
      if (upErr) throw new Error(`Lỗi tải ảnh nền: ${upErr.message}`);
    }
    const payload = { ...config, duong_dan: path, updated_at: new Date().toISOString() };
    const { data, error } = await legacyDb
      .from('bim_nen_ban_do')
      .upsert(payload, { onConflict: 'project_id' })
      .select('*')
      .single();
    if (error) throw new Error(`Lỗi lưu nền bản đồ: ${error.message}`);
    return data as BimBasemap;
  }

  static async deleteBasemap(projectId: string): Promise<void> {
    const { error } = await legacyDb.from('bim_nen_ban_do').delete().eq('project_id', projectId);
    if (error) throw new Error(`Lỗi xóa nền bản đồ: ${error.message}`);
  }

  // ============================================================
  // PHIÊN DÒ VA CHẠM (H3)
  // ============================================================

  static async getClashSessions(projectId: string): Promise<BimClashSession[]> {
    const { data, error } = await bimDb
      .from('bim_phien_va_cham')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Lỗi tải phiên dò va chạm: ${error.message}`);
    return (data as BimClashSession[]) || [];
  }

  static async getClashRecords(sessionId: string): Promise<BimClashRecord[]> {
    const { data, error } = await bimDb
      .from('bim_va_cham')
      .select('*')
      .eq('phien_id', sessionId)
      .order('lan_cuoi', { ascending: false })
      .limit(5000);
    if (error) throw new Error(`Lỗi tải danh sách va chạm: ${error.message}`);
    return (data as BimClashRecord[]) || [];
  }

  static async updateClashRecord(
    id: string,
    patch: Partial<Pick<BimClashRecord, 'trang_thai' | 'ghi_chu' | 'danh_gia' | 'ly_do_danh_gia'>>,
  ): Promise<void> {
    const { error } = await bimDb.from('bim_va_cham').update(patch).eq('id', id);
    if (error) throw new Error(`Lỗi cập nhật va chạm: ${error.message}`);
  }

  static async deleteClashSession(id: string): Promise<void> {
    const { error } = await bimDb.from('bim_phien_va_cham').delete().eq('id', id);
    if (error) throw new Error(`Lỗi xóa phiên dò: ${error.message}`);
  }

  /**
   * Lưu kết quả dò vào phiên (mới hoặc có sẵn), so khớp theo cặp GUID:
   *  - cặp cũ vẫn còn: giữ trạng thái; nếu đã "đã xử lý"/"đã hết" mà xuất hiện lại → mở lại "mới"
   *  - cặp cũ không còn: tự chuyển "đã hết" (trừ khi đang "bỏ qua")
   *  - cặp mới: thêm với trạng thái "mới"
   */
  static async saveClashRun(
    session: Omit<BimClashSession, 'id' | 'created_at' | 'updated_at' | 'so_va_cham'> & { id?: string },
    rows: BimClashRow[],
  ): Promise<{ session: BimClashSession; added: number; reopened: number; closed: number }> {
    const now = new Date().toISOString();
    const valid = rows.filter((r) => r.guidA && r.guidB);
    const payload = { ...session, so_va_cham: valid.length, updated_at: now };
    const q = session.id
      ? bimDb.from('bim_phien_va_cham').update(payload).eq('id', session.id)
      : bimDb.from('bim_phien_va_cham').insert(payload);
    const { data: saved, error } = await q.select('*').single();
    if (error) throw new Error(`Lỗi lưu phiên dò: ${error.message}`);

    const existing = session.id ? await this.getClashRecords(session.id) : [];
    const keyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const byKey = new Map(existing.map((e) => [keyOf(e.guid_a, e.guid_b), e]));
    const seen = new Set<string>();
    let added = 0;
    let reopened = 0;
    const upserts: any[] = [];
    for (const r of valid) {
      const key = keyOf(r.guidA!, r.guidB!);
      if (seen.has(key)) continue;
      seen.add(key);
      const old = byKey.get(key);
      const reopen = !!old && (old.trang_thai === 'da_xu_ly' || old.trang_thai === 'da_het');
      if (!old) added++;
      if (reopen) reopened++;
      const aiJudged = !!old?.ly_do_danh_gia?.startsWith('AI');
      upserts.push({
        ...(old ? { id: old.id } : {}),
        phien_id: saved.id,
        project_id: session.project_id,
        guid_a: old ? old.guid_a : r.guidA,
        guid_b: old ? old.guid_b : r.guidB,
        ten_a: r.nameA,
        ten_b: r.nameB,
        loai_a: r.categoryA,
        loai_b: r.categoryB,
        tam: r.center,
        do_sau: Math.round(r.depth * 10000) / 10000,
        nhom: `${r.categoryA} × ${r.categoryB}`,
        trang_thai: old ? (reopen ? 'moi' : old.trang_thai) : 'moi',
        danh_gia: aiJudged ? old!.danh_gia : (r.verdict ?? null),
        ly_do_danh_gia: aiJudged ? old!.ly_do_danh_gia : (r.reason ?? null),
        lan_cuoi: now,
      });
    }
    for (let i = 0; i < upserts.length; i += 500) {
      const { error: upErr } = await bimDb
        .from('bim_va_cham')
        .upsert(upserts.slice(i, i + 500), { onConflict: 'phien_id,guid_a,guid_b' });
      if (upErr) throw new Error(`Lỗi lưu va chạm: ${upErr.message}`);
    }
    const gone = existing.filter(
      (e) => !seen.has(keyOf(e.guid_a, e.guid_b)) && e.trang_thai !== 'bo_qua' && e.trang_thai !== 'da_het',
    );
    for (let i = 0; i < gone.length; i += 200) {
      const ids = gone.slice(i, i + 200).map((e) => e.id);
      const { error: goneErr } = await bimDb
        .from('bim_va_cham')
        .update({ trang_thai: 'da_het' as BimClashStatus })
        .in('id', ids);
      if (goneErr) throw new Error(`Lỗi cập nhật va chạm đã hết: ${goneErr.message}`);
    }
    return { session: saved as BimClashSession, added, reopened, closed: gone.length };
  }

  // ============================================================
  // MÔI TRƯỜNG DỮ LIỆU CHUNG — ISO 19650 (H2)
  // ============================================================

  static async changeCdeState(
    modelId: string,
    to: BimCdeState,
    options: { code?: string | null; note?: string; userName?: string } = {},
  ): Promise<BimModel> {
    const { data, error } = await legacyDb.rpc('bim_chuyen_trang_thai_cde', {
      p_model_id: modelId,
      p_den: to,
      p_ma_phu_hop: options.code || null,
      p_ghi_chu: options.note || null,
      p_ten_nguoi: options.userName || null,
    });
    if (error) throw new Error(error.message);
    logAuditEvent({
      action: 'UPDATE',
      targetEntity: 'bim_models',
      targetId: modelId,
      details: `Chuyển trạng thái CDE mô hình sang "${to}"${options.code ? ` (${options.code})` : ''}${options.note ? `: ${options.note}` : ''}`,
      newValues: { trang_thai_cde: to, ma_phu_hop: options.code },
    });
    return data as BimModel;
  }

  static async getCdeHistory(modelId: string): Promise<BimCdeHistory[]> {
    const { data, error } = await legacyDb
      .from('bim_cde_lich_su')
      .select('*')
      .eq('model_id', modelId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`Lỗi tải lịch sử CDE: ${error.message}`);
    return (data as BimCdeHistory[]) || [];
  }

  // ============================================================
  // BỘ CHỌN THÔNG MINH (G3)
  // ============================================================

  /** Lọc cấu kiện theo điều kiện trên cột hoặc thuộc tính/Pset (AND) */
  static async filterElements(modelIds: string[], conditions: BimSetCondition[]): Promise<BimElementRef[]> {
    if (modelIds.length === 0) return [];
    const { data, error } = await (supabase as any).rpc('bim_loc_cau_kien', {
      p_model_ids: modelIds,
      p_dieu_kien: conditions,
    });
    if (error) throw new Error(`Lỗi lọc cấu kiện: ${error.message}`);
    return (data as BimElementRef[]) || [];
  }

  /** Giá trị của một trường trên mọi cấu kiện (tô màu theo thuộc tính) */
  static async getFieldValues(
    modelIds: string[],
    field: BimFieldRef,
  ): Promise<{ model_id: string; express_id: number; gia_tri: string | null }[]> {
    if (modelIds.length === 0) return [];
    const { data, error } = await (supabase as any).rpc('bim_gia_tri_theo_truong', {
      p_model_ids: modelIds,
      p_truong: field,
    });
    if (error) throw new Error(`Lỗi đọc giá trị thuộc tính: ${error.message}`);
    return data || [];
  }

  /** Danh mục trường (Pset, kiểu, thông tin) có trong các mô hình */
  static async getFieldCatalog(modelIds: string[]): Promise<BimFieldInfo[]> {
    if (modelIds.length === 0) return [];
    const { data, error } = await (supabase as any).rpc('bim_danh_muc_truong', { p_model_ids: modelIds });
    if (error) throw new Error(`Lỗi tải danh mục thuộc tính: ${error.message}`);
    return (data as BimFieldInfo[]) || [];
  }

  /** Giá trị phổ biến của một trường (gợi ý nhập điều kiện) */
  static async getPopularValues(
    modelIds: string[],
    field: BimFieldRef,
  ): Promise<{ gia_tri: string; so_luong: number }[]> {
    if (modelIds.length === 0) return [];
    const { data, error } = await (supabase as any).rpc('bim_gia_tri_pho_bien', {
      p_model_ids: modelIds,
      p_truong: field,
    });
    if (error) throw new Error(`Lỗi tải giá trị gợi ý: ${error.message}`);
    return data || [];
  }

  static async getSmartSets(projectId: string): Promise<BimSmartSet[]> {
    const { data, error } = await legacyDb
      .from('bim_bo_chon')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Lỗi tải bộ chọn: ${error.message}`);
    return (data as BimSmartSet[]) || [];
  }

  static async saveSmartSet(
    set: Partial<BimSmartSet> & { project_id: string; ten: string; dieu_kien: BimSetCondition[] },
  ): Promise<BimSmartSet> {
    const payload = { ...set, updated_at: new Date().toISOString() };
    const query = set.id
      ? legacyDb.from('bim_bo_chon').update(payload).eq('id', set.id)
      : legacyDb.from('bim_bo_chon').insert(payload);
    const { data, error } = await query.select('*').single();
    if (error) throw new Error(`Lỗi lưu bộ chọn: ${error.message}`);
    return data as BimSmartSet;
  }

  static async deleteSmartSet(id: string): Promise<void> {
    const { error } = await legacyDb.from('bim_bo_chon').delete().eq('id', id);
    if (error) throw new Error(`Lỗi xóa bộ chọn: ${error.message}`);
  }

  /** Vị trí của các mô hình đang chờ trong hàng đợi chuyển đổi chung của hệ thống */
  static async getQueue(): Promise<BimQueueEntry[]> {
    const { data, error } = await legacyDb.rpc('bim_hang_doi');
    if (error) throw new Error(`Lỗi tải hàng đợi chuyển đổi: ${error.message}`);
    return (data as BimQueueEntry[]) || [];
  }

  static async getQuantitySummary(modelId: string): Promise<BimQuantitySummaryRow[]> {
    return this.getQuantitySummaryMany([modelId]);
  }

  /** Tổng hợp khối lượng của nhiều mô hình cùng lúc (khi ghép liên bộ môn) */
  static async getQuantitySummaryMany(modelIds: string[]): Promise<BimQuantitySummaryRow[]> {
    if (modelIds.length === 0) return [];
    return readAllRows<BimQuantitySummaryRow>((from, to, count) =>
      bimDb
        .from('v_bim_khoi_luong_tong_hop')
        .select('*', count ? { count: 'exact' } : undefined)
        .in('model_id', [...new Set(modelIds)].sort())
        .order('model_id', { ascending: true })
        .order('loai_cau_kien', { ascending: true })
        .order('vat_lieu', { ascending: true })
        .order('phan_doan_tang', { ascending: true })
        .range(from, to),
    );
  }

  /** Cấu kiện nguồn của một dòng chi phí — lọc ở máy chủ (bim_quantity_group_elements). */
  static async getQuantitySourceElements(row: BimCostRow): Promise<{ modelId: string; expressId: number }[]> {
    if (!row.model_id) throw new Error('Dòng chi phí không có mô hình nguồn.');
    return BimWorkspaceService.groupElements([
      {
        model_id: row.model_id,
        loai_cau_kien: row.loai_cau_kien,
        vat_lieu: row.vat_lieu,
        phan_doan_tang: row.phan_doan_tang,
      },
    ]);
  }

  static async getElementByModelGuid(modelId: string, guid: string): Promise<BimElement | null> {
    const { data, error } = await (supabase as any)
      .from('bim_elements')
      .select('*')
      .eq('model_id', modelId)
      .eq('global_id', guid)
      .maybeSingle();

    if (error) throw new Error(`Lỗi tải cấu kiện GUID ${guid}: ${error.message}`);
    return (data as BimElement) ?? null;
  }

  static async getElementByExpressId(modelId: string, expressId: number): Promise<BimElement | null> {
    const { data, error } = await (supabase as any)
      .from('bim_elements')
      .select('*')
      .eq('model_id', modelId)
      .eq('express_id', expressId)
      .maybeSingle();

    if (error) throw new Error(`Lỗi tải cấu kiện #${expressId}: ${error.message}`);
    return (data as BimElement) ?? null;
  }

  static async getElementByGuid(guid: string): Promise<BimElement | null> {
    const { data, error } = await (supabase as any)
      .from('bim_elements')
      .select('*')
      .eq('global_id', guid)
      .maybeSingle();

    if (error) throw new Error(`Lỗi tải cấu kiện GUID ${guid}: ${error.message}`);
    return (data as BimElement) ?? null;
  }

  // ============================================================
  // 3. GÓC NHÌN LƯU TRỮ (bim_saved_views)
  // ============================================================

  static async getSavedViews(projectId: string, modelId?: string): Promise<BimSavedView[]> {
    let query = bimDb
      .from('bim_saved_views')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (modelId) {
      query = query.eq('model_id', modelId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Lỗi tải góc nhìn lưu trữ: ${error.message}`);
    return (data as unknown as BimSavedView[]) || [];
  }

  static async saveView(view: Omit<BimSavedView, 'id' | 'created_at'>): Promise<BimSavedView> {
    const { data, error } = await bimDb
      .from('bim_saved_views')
      .insert(view as unknown as BimInsert<'bim_saved_views'>)
      .select()
      .single();

    if (error) throw new Error(`Lỗi lưu góc nhìn: ${error.message}`);
    return data as unknown as BimSavedView;
  }

  static async deleteSavedView(id: string): Promise<void> {
    const { error } = await bimDb.from('bim_saved_views').delete().eq('id', id);

    if (error) throw new Error(`Lỗi xóa góc nhìn: ${error.message}`);
  }

  // ============================================================
  // 4. VƯỚNG MẮC PHỐI HỢP BIM (bim_issues)
  // ============================================================

  /** Toàn bộ vướng mắc cho lớp đánh dấu / thống kê, giới hạn cứng 2.000 dòng mới nhất. */
  static async getIssues(projectId: string, modelId?: string): Promise<BimIssue[]> {
    return (await this.getIssuesPage(projectId, { modelId, limit: 2000 })).rows;
  }

  /** Một trang vướng mắc (mới nhất trước) kèm tổng số; bộ lọc chạy ở máy chủ. */
  static async getIssuesPage(
    projectId: string,
    filter: {
      modelId?: string;
      status?: string;
      active?: boolean;
      mineUserId?: string;
      priority?: string;
      search?: string;
      offset?: number;
      limit?: number;
    } = {},
  ): Promise<BoundedList<BimIssue> & { offset: number; hasMore: boolean }> {
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = Math.min(500, Math.max(1, filter.limit ?? 50));
    return readPage<BimIssue>(
      (from, to) => {
        let query = bimDb
          .from('bim_issues')
          .select('*', { count: 'exact' })
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
        if (filter.modelId) query = query.eq('model_id', filter.modelId);
        if (filter.status) query = query.eq('status', filter.status);
        if (filter.active) query = query.not('status', 'in', '(resolved,closed)');
        if (filter.mineUserId && /^[\w-]+$/.test(filter.mineUserId))
          query = query.or(`assigned_to.eq.${filter.mineUserId},nguoi_tao_uid.eq.${filter.mineUserId}`);
        if (filter.priority) query = query.eq('priority', filter.priority);
        const term = filter.search?.replace(/[%,()*\\:]/g, ' ').trim();
        if (term) query = query.or(ilikeAny(['title', 'description', 'assigned_to_name'], term));
        return query.range(from, to) as unknown as PromiseLike<{
          data: BimIssue[] | null;
          count: number | null;
          error: { message: string } | null;
        }>;
      },
      offset,
      limit,
    );
  }

  /** Số đếm vướng mắc (mở, đang xử lý, quá hạn theo giờ Việt Nam) — một RPC, không tải danh sách. */
  static async getIssueCounts(
    projectId: string,
  ): Promise<{ total: number; open: number; in_progress: number; overdue: number }> {
    const data = (await bimRpc('bim_issue_counts', { p_project: projectId }, 'Lỗi đếm vướng mắc')) as Record<
      string,
      unknown
    > | null;
    return {
      total: Number(data?.total) || 0,
      open: Number(data?.open) || 0,
      in_progress: Number(data?.in_progress) || 0,
      overdue: Number(data?.overdue) || 0,
    };
  }

  static async createIssue(issue: Omit<BimIssue, 'id' | 'created_at' | 'updated_at'>): Promise<BimIssue> {
    const { data, error } = await bimDb
      .from('bim_issues')
      .insert(issue as unknown as BimInsert<'bim_issues'>)
      .select()
      .single();

    if (error) throw new Error(`Lỗi tạo vướng mắc: ${error.message}`);
    return data as BimIssue;
  }

  /** updated_at, resolved_at, so_hieu and the reply stamp are set by the database trigger. */
  static async updateIssue(id: string, updates: Partial<BimIssue>): Promise<BimIssue> {
    const { data, error } = await bimDb
      .from('bim_issues')
      .update(updates as unknown as BimUpdate<'bim_issues'>)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Lỗi cập nhật vướng mắc: ${error.message}`);
    return data as BimIssue;
  }

  static async getIssueComments(issueId: string): Promise<BimIssueComment[]> {
    const { data, error } = await bimDb
      .from('bim_issue_comments')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Lỗi tải bình luận: ${error.message}`);
    return (data as BimIssueComment[]) || [];
  }

  static async addIssueComment(
    issueId: string,
    body: string,
    author?: string,
    options: { authorId?: string; system?: boolean } = {},
  ): Promise<BimIssueComment> {
    const { data, error } = await bimDb
      .from('bim_issue_comments')
      .insert({
        issue_id: issueId,
        body,
        author,
        author_id: options.authorId || null,
        loai: options.system ? 'he_thong' : 'binh_luan',
      })
      .select()
      .single();

    if (error) throw new Error(`Lỗi gửi bình luận: ${error.message}`);
    return data as BimIssueComment;
  }

  /**
   * Lưu ảnh chụp màn hình (data URL) vào kho bim-models (private).
   * Trả về ĐƯỜNG DẪN trong kho; khi hiển thị dùng getSignedFileUrl.
   */
  static async uploadIssueScreenshot(projectId: string, dataUrl: string): Promise<string> {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `issues/${projectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const { error } = await supabase.storage.from('bim-models').upload(path, blob, {
      contentType: 'image/png',
      upsert: false,
    });
    if (error) throw new Error(`Lỗi lưu ảnh chụp vướng mắc: ${error.message}`);
    return path;
  }

  /** URL có chữ ký (hết hạn) cho file trong kho bim-models; URL http/data giữ nguyên */
  static async getSignedFileUrl(pathOrUrl: string, expiresIn = 3600): Promise<string | null> {
    if (!pathOrUrl) return null;
    if (/^(https?:|data:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
    const { data, error } = await supabase.storage.from('bim-models').createSignedUrl(pathOrUrl, expiresIn);
    if (error) {
      console.warn('Không tạo được link tải file BIM:', error.message);
      return null;
    }
    return withStorageApiKey(data.signedUrl);
  }

  /** Nhật ký xem / xuất dữ liệu mô hình (J5) — mỗi mô hình ghi "xem" một lần mỗi phiên */
  private static viewedModels = new Set<string>();
  static logBimActivity(
    action: 'VIEW' | 'EXPORT',
    target: { id?: string | null; name?: string | null },
    details: string,
  ): void {
    if (action === 'VIEW') {
      if (!target.id || this.viewedModels.has(target.id)) return;
      this.viewedModels.add(target.id);
    }
    logAuditEvent({
      action,
      targetEntity: 'bim_models',
      targetId: target.id || undefined,
      targetName: target.name || undefined,
      details,
    });
  }

  /** Project owner and members (assignees, responders); names are e-mail local parts until accounts have names. */
  static async getProjectPeople(projectId: string): Promise<BimProjectPerson[]> {
    const { data, error } = await legacyDb.rpc('bim_nguoi_tham_gia', { p_project: projectId });
    if (error) throw new Error(`Lỗi tải thành viên dự án: ${error.message}`);
    return (data as BimProjectPerson[] | null) || [];
  }

  // ============================================================
  // 5. LIÊN KẾT 2 CHIỀU BIM ↔ NGHIỆM THU (bim_nghiem_thu, biên bản không sửa sau khi lập)
  // ============================================================

  static async getAcceptanceRecordsForGuid(bimGuid: string): Promise<any[]> {
    if (!bimGuid) return [];
    const { data, error } = await legacyDb
      .from('bim_nghiem_thu')
      .select('*')
      .eq('bim_guid', bimGuid)
      .order('tao_luc', { ascending: false });

    if (error) {
      console.warn('Lỗi tra cứu nghiệm thu theo bim_guid:', error.message);
      return [];
    }
    return data || [];
  }

  /** Trạng thái nghiệm thu mới nhất theo GUID cấu kiện (dùng tô màu mô hình) — một RPC. */
  static async getAcceptanceStatusByGuid(
    projectId: string,
  ): Promise<Record<string, 'dat' | 'khong_dat' | 'dat_co_dieu_kien' | 'cho_nghiem_thu'>> {
    const rows = await bimRpc('bim_acceptance_status', { p_project: projectId }, 'Lỗi tải trạng thái nghiệm thu');
    const map: Record<string, 'dat' | 'khong_dat' | 'dat_co_dieu_kien' | 'cho_nghiem_thu'> = {};
    for (const row of rows || []) {
      if (row.bim_guid)
        map[row.bim_guid] = (row.ket_luan || 'cho_nghiem_thu') as
          'dat' | 'khong_dat' | 'dat_co_dieu_kien' | 'cho_nghiem_thu';
    }
    return map;
  }

  static async createAcceptanceForElement(record: {
    ma_du_an: string;
    ma_hang_muc?: string | null;
    cap_nghiem_thu: string;
    ten_nghiem_thu: string;
    ngay_nghiem_thu?: string | null;
    dia_diem?: string | null;
    ket_luan?: string | null;
    noi_dung_danh_gia?: string | null;
    bim_guid: string;
    bim_model_id?: string | null;
    tao_boi?: string | null;
  }): Promise<any> {
    // trang_thai, tao_luc and nguoi_tao_uid are set by the database.
    const payload = {
      ...record,
      ma_hang_muc: record.ma_hang_muc || null,
      ngay_de_nghi: new Date().toISOString().split('T')[0],
    };
    const { data, error } = await legacyDb.from('bim_nghiem_thu').insert(payload).select().single();
    if (error) throw new Error(`Lỗi lập biên bản nghiệm thu: ${error.message}`);
    return data;
  }

  // ============================================================
  // 6. LIÊN KẾT CẤU KIỆN ↔ HỒ SƠ TÀI LIỆU
  // ============================================================

  static async getLinksForElement(projectId: string, guid: string): Promise<BimDocumentLink[]> {
    return readAllRows<BimDocumentLink>((from, to, count) =>
      bimDb
        .from('bim_lien_ket_tai_lieu')
        .select('*', count ? { count: 'exact' } : undefined)
        .eq('project_id', projectId)
        .eq('global_id', guid)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    );
  }

  static async getLinksForObject(type: BimLinkType, objectId: string): Promise<BimDocumentLink[]> {
    return readAllRows<BimDocumentLink>((from, to, count) =>
      bimDb
        .from('bim_lien_ket_tai_lieu')
        .select('*', count ? { count: 'exact' } : undefined)
        .eq('loai_doi_tuong', type)
        .eq('doi_tuong_id', objectId)
        .order('id')
        .range(from, to),
    );
  }

  /** Danh sách GUID có hồ sơ liên kết trong dự án (tô màu mô hình) */
  static async getLinkedGuids(projectId: string): Promise<string[]> {
    const data = await readAllRows<{ global_id: string }>((from, to, count) =>
      bimDb
        .from('bim_lien_ket_tai_lieu')
        .select('global_id', count ? { count: 'exact' } : undefined)
        .eq('project_id', projectId)
        .order('id')
        .range(from, to),
    );
    return [...new Set(data.map((r) => r.global_id))];
  }

  /**
   * Độ phủ nghiệm thu / hồ sơ / tiến độ trên các mô hình — đếm ở máy chủ (bim_scope_coverage),
   * thay cho việc tải toàn bộ GUID cấu kiện về trình duyệt.
   */
  static async getScopeCoverage(
    projectId: string,
    modelIds: string[],
  ): Promise<{ scopeGuids: number; accepted: number; linked: number; taskLinked: number }> {
    if (!modelIds.length) return { scopeGuids: 0, accepted: 0, linked: 0, taskLinked: 0 };
    const data = (await bimRpc(
      'bim_scope_coverage',
      { p_project: projectId, p_model_ids: [...new Set(modelIds)].sort() },
      'Lỗi tính độ phủ dữ liệu',
    )) as Record<string, unknown> | null;
    return {
      scopeGuids: Number(data?.scope_guids) || 0,
      accepted: Number(data?.accepted) || 0,
      linked: Number(data?.linked) || 0,
      taskLinked: Number(data?.task_linked) || 0,
    };
  }

  static async addLinks(links: Omit<BimDocumentLink, 'id' | 'created_at'>[]): Promise<void> {
    if (links.length === 0) return;
    const { error } = await bimDb
      .from('bim_lien_ket_tai_lieu')
      .upsert(links, { onConflict: 'project_id,global_id,loai_doi_tuong,doi_tuong_id', ignoreDuplicates: true });
    if (error) throw new Error(`Lỗi gắn tài liệu: ${error.message}`);
  }

  static async removeLink(id: string): Promise<void> {
    const { error } = await bimDb.from('bim_lien_ket_tai_lieu').delete().eq('id', id);
    if (error) throw new Error(`Lỗi gỡ liên kết: ${error.message}`);
  }

  /** Documents of the project library (Hồ sơ tài liệu), newest first, excluding the bin. */
  static async searchProjectDocuments(projectId: string, search = '', limit = 50): Promise<BimLibraryDocument[]> {
    let query = legacyDb
      .from('documents')
      .select('id, name, category, updated_at')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(limit);
    const term = search.replace(/[%,()*\\:]/g, ' ').trim();
    if (term) query = query.or(ilikeAny(['name', 'category'], term));
    const { data, error } = await query;
    if (error) throw new Error(`Lỗi tìm hồ sơ dự án: ${error.message}`);
    return data || [];
  }

  static async getDocumentsByIds(ids: string[]): Promise<BimLibraryDocument[]> {
    if (ids.length === 0) return [];
    const { data, error } = await legacyDb
      .from('documents')
      .select('id, name, category, updated_at')
      .in('id', ids)
      .is('deleted_at', null);
    if (error) throw new Error(`Lỗi tải hồ sơ: ${error.message}`);
    return data || [];
  }

  static async getTasksByIds(ids: string[]): Promise<BimTask[]> {
    if (ids.length === 0) return [];
    const { data, error } = await legacyDb.from('workspace_tasks').select(WORKSPACE_TASK_COLUMNS).in('id', ids);
    if (error) throw new Error(`Lỗi tải nhiệm vụ: ${error.message}`);
    return ((data as WorkspaceTaskRow[]) || []).map(toBimTask);
  }

  static async getAcceptanceByIds(ids: string[]): Promise<any[]> {
    if (ids.length === 0) return [];
    const { data, error } = await legacyDb.from('bim_nghiem_thu').select('*').in('ma_nghiem_thu', ids);
    if (error) throw new Error(`Lỗi tải biên bản nghiệm thu: ${error.message}`);
    return data || [];
  }

  /** Tìm mô hình (sẵn sàng, mới nhất) chứa cấu kiện có GUID trong dự án */
  static async findModelForGuid(
    projectId: string,
    guid: string,
  ): Promise<{ model_id: string; express_id: number } | null> {
    const { data } = await (supabase as any)
      .from('bim_elements')
      .select('model_id, express_id, created_at')
      .eq('project_id', projectId)
      .eq('global_id', guid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  }

  // ============================================================
  // 7. PHIÊN BẢN MÔ HÌNH
  // ============================================================

  /** Tóm tắt so sánh hai phiên bản ở máy chủ (đếm theo trạng thái, 15 loại lớn nhất, 20 mẫu) cho hộp thoại AI. */
  static async getVersionDiffSummary(oldModelId: string, newModelId: string): Promise<BimVersionDiffSummary> {
    const data = (await bimRpc(
      'bim_version_diff_summary',
      { p_model_cu: oldModelId, p_model_moi: newModelId },
      'Lỗi so sánh phiên bản',
    )) as Partial<BimVersionDiffSummary> | null;
    return {
      counts: {
        them_moi: Number(data?.counts?.them_moi) || 0,
        da_xoa: Number(data?.counts?.da_xoa) || 0,
        da_sua: Number(data?.counts?.da_sua) || 0,
      },
      groups: (data?.groups || []).map((g) => ({
        ...g,
        so_luong: Number(g.so_luong) || 0,
        the_tich: Number(g.the_tich) || 0,
        chenh_lech: Number(g.chenh_lech) || 0,
      })),
      samples: data?.samples || [],
    };
  }

  static async compareVersions(oldModelId: string, newModelId: string): Promise<BimVersionDiffRow[]> {
    const { data, error } = await legacyDb.rpc('bim_so_sanh_phien_ban', {
      p_model_cu: oldModelId,
      p_model_moi: newModelId,
    });
    if (error) throw new Error(`Lỗi so sánh phiên bản: ${error.message}`);
    return (data as BimVersionDiffRow[]) || [];
  }

  // ============================================================
  // 8. 4D - LIEN KET CONG VIEC TIEN DO
  // ============================================================

  /** Workspace tasks of the project (Nhiệm vụ), for element links; the 4D schedule arrives in phase B5. */
  static async getProjectTasks(projectId: string): Promise<BimTask[]> {
    const rows = await readAllRows<WorkspaceTaskRow>((from, to, count) =>
      legacyDb
        .from('workspace_tasks')
        .select(WORKSPACE_TASK_COLUMNS, count ? { count: 'exact' } : undefined)
        .eq('project_id', projectId)
        .order('due_date', { nullsFirst: false })
        .order('id')
        .range(from, to),
    );
    return rows.map(toBimTask);
  }

  /** Bản đồ GUID cấu kiện → công việc đã gắn (toàn dự án) */
  static async getTaskLinks(projectId: string): Promise<Record<string, string[]>> {
    const data = await readAllRows<{ global_id: string; doi_tuong_id: string }>((from, to, count) =>
      bimDb
        .from('bim_lien_ket_tai_lieu')
        .select('global_id, doi_tuong_id', count ? { count: 'exact' } : undefined)
        .eq('project_id', projectId)
        .eq('loai_doi_tuong', 'cong_viec')
        .order('id')
        .range(from, to),
    );
    const map: Record<string, string[]> = {};
    ((data as any[]) || []).forEach((r) => {
      map[r.global_id] = [...(map[r.global_id] || []), r.doi_tuong_id];
    });
    return map;
  }

  // ============================================================
  // 9. 5D - DON GIA VA BOC TACH CHI PHI
  // ============================================================

  static async getUnitPrices(projectId: string): Promise<BimUnitPrice[]> {
    return readAllRows<BimUnitPrice>((from, to, count) =>
      bimDb
        .from('bim_don_gia')
        .select('*', count ? { count: 'exact' } : undefined)
        .eq('project_id', projectId)
        .order('loai_cau_kien', { ascending: true })
        .order('id')
        .range(from, to),
    );
  }

  static async saveUnitPrice(
    price: Omit<BimUnitPrice, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ): Promise<BimUnitPrice> {
    const payload: Record<string, unknown> = {
      ...price,
      vat_lieu: price.vat_lieu || null,
      updated_at: new Date().toISOString(),
    };
    delete payload.id;
    const query = price.id
      ? bimDb
          .from('bim_don_gia')
          .update(payload as BimUpdate<'bim_don_gia'>)
          .eq('id', price.id)
      : bimDb.from('bim_don_gia').insert(payload as unknown as BimInsert<'bim_don_gia'>);
    const { data, error } = await query.select().single();
    if (error) throw new Error(`Lỗi lưu đơn giá: ${error.message}`);
    return data as BimUnitPrice;
  }

  static async deleteUnitPrice(id: string): Promise<void> {
    const { error } = await bimDb.from('bim_don_gia').delete().eq('id', id);
    if (error) throw new Error(`Lỗi xóa đơn giá: ${error.message}`);
  }

  // ============================================================
  // 10. KIEM TRA CHAT LUONG THONG TIN MO HINH (IDS rut gon)
  // ============================================================

  /**
   * Kiểm tra chất lượng thông tin mô hình theo các quy tắc tối thiểu — đếm ở máy chủ (bim_quality_check),
   * trả tối đa 50 mẫu mỗi quy tắc; trình duyệt không tải cấu kiện.
   */
  static async checkModelQuality(modelId: string, onProgress?: (done: number) => void): Promise<BimQualityReport> {
    const data = (await bimRpc(
      'bim_quality_check',
      { p_model: modelId, p_samples: 50 },
      'Lỗi kiểm tra chất lượng mô hình',
    )) as {
      total?: number;
      counts?: Record<string, number>;
      samples?: Record<string, BimQualityRule['samples']>;
      checked_at?: string;
    } | null;
    const total = Number(data?.total) || 0;
    onProgress?.(total);
    return qualityReport(modelId, total, data?.counts || {}, data?.samples || {}, data?.checked_at);
  }
}

const QUALITY_RULES: { id: string; label: string; description: string; severity: BimQualityRule['severity'] }[] = [
  {
    id: 'thieu_ten',
    label: 'Thiếu tên cấu kiện',
    description: 'Cấu kiện không có tên hoặc để tên mặc định — khó tra cứu và lập hồ sơ.',
    severity: 'loi',
  },
  {
    id: 'trung_guid',
    label: 'Trùng GlobalId',
    description: 'Hai cấu kiện dùng chung một GUID: liên kết hồ sơ sẽ gắn nhầm.',
    severity: 'loi',
  },
  {
    id: 'thieu_khoi_luong',
    label: 'Không có khối lượng',
    description: 'Không có thể tích, diện tích hay chiều dài để bóc tách khối lượng.',
    severity: 'loi',
  },
  {
    id: 'thieu_vat_lieu',
    label: 'Thiếu vật liệu',
    description: 'Không khai báo vật liệu (IfcMaterial) — không quy đổi được đơn giá.',
    severity: 'canh_bao',
  },
  {
    id: 'thieu_tang',
    label: 'Thiếu phân đoạn/tầng',
    description: 'Cấu kiện không gắn vào cấu trúc không gian (tầng, phân đoạn).',
    severity: 'canh_bao',
  },
  {
    id: 'thieu_pset',
    label: 'Không có bộ thuộc tính',
    description: 'Không có Property Set nào kèm theo cấu kiện.',
    severity: 'canh_bao',
  },
  {
    id: 'thieu_kieu',
    label: 'Không gắn kiểu (Type)',
    description: 'Cấu kiện không tham chiếu IfcTypeObject — thiếu thông tin quy cách.',
    severity: 'thong_tin',
  },
  {
    id: 'khoi_luong_uoc_tinh',
    label: 'Khối lượng ước tính từ hình học',
    description: 'IFC không kèm bộ số lượng (Qto); khối lượng tính từ hình học nên chỉ để tham khảo.',
    severity: 'thong_tin',
  },
];

/** Dựng báo cáo chất lượng từ số đếm của máy chủ; điểm: lỗi trừ nặng hơn cảnh báo, mức thông tin không trừ. */
export function qualityReport(
  modelId: string,
  total: number,
  counts: Record<string, number>,
  samples: Record<string, BimQualityRule['samples']>,
  checkedAt = new Date().toISOString(),
): BimQualityReport {
  const rules: BimQualityRule[] = QUALITY_RULES.map((m) => ({
    ...m,
    count: Number(counts[m.id]) || 0,
    total,
    samples: (samples[m.id] || []).slice(0, 50),
  }));
  const weight: Record<BimQualityRule['severity'], number> = { loi: 1, canh_bao: 0.5, thong_tin: 0 };
  const scored = rules.filter((r) => weight[r.severity] > 0);
  const penalty = total === 0 ? 0 : scored.reduce((sum, r) => sum + (r.count / total) * weight[r.severity], 0);
  const score = total === 0 ? 0 : Math.max(0, Math.round((1 - penalty / Math.max(1, scored.length)) * 100));
  return { modelId, totalElements: total, score, rules, checkedAt };
}
