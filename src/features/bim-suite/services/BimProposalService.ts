// Design options (phase B5, migration 20261027130000; carbon from 6D in 20261027140000): a named set of project models; comparison metrics are measured on
// the server from the elements of the models (bim_phuong_an_chi_so).
import { legacyDb } from '../lib/bimDb';

type DbError = { code?: string; message: string } | null;
const fail = (error: DbError, context: string): never => {
  throw new Error(`${context}: ${error?.message}`);
};

export interface ProposalRow {
  id: string;
  ten: string;
  mo_ta: string | null;
  model_ids: string[];
  so_cau_kien: number;
  so_tang: number;
  the_tich: number | null;
  dien_tich: number | null;
  chieu_dai: number | null;
  trong_luong: number | null;
  thieu_khoi_luong: number;
  /** Embodied carbon of the computed elements (phase B6 6D); null when not computed. */
  carbon_kg: number | null;
  carbon_cau_kien: number;
  updated_at: string;
}
export interface ProposalModel {
  id: string;
  file_name: string;
  discipline: string | null;
  phien_ban: number | null;
  ghi_chu_phien_ban: string | null;
  status: string;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const BimProposalService = {
  async list(projectId: string): Promise<ProposalRow[]> {
    const { data, error } = await legacyDb.rpc('bim_phuong_an_chi_so', { p_project: projectId });
    if (error) fail(error, 'Lỗi tải phương án');
    return ((data ?? []) as ProposalRow[]).map((r) => ({
      ...r,
      so_cau_kien: Number(r.so_cau_kien) || 0,
      so_tang: Number(r.so_tang) || 0,
      the_tich: num(r.the_tich),
      dien_tich: num(r.dien_tich),
      chieu_dai: num(r.chieu_dai),
      trong_luong: num(r.trong_luong),
      thieu_khoi_luong: Number(r.thieu_khoi_luong) || 0,
      carbon_kg: num(r.carbon_kg),
      carbon_cau_kien: Number(r.carbon_cau_kien) || 0,
    }));
  },
  async save(projectId: string, id: string | null, ten: string, moTa: string, modelIds: string[]): Promise<void> {
    const { error } = await legacyDb.rpc('bim_phuong_an_luu', {
      p_project: projectId,
      p_id: id,
      p_ten: ten,
      p_mo_ta: moTa,
      p_model_ids: modelIds,
    });
    if (error) fail(error, 'Không lưu được phương án');
  },
  async remove(id: string): Promise<void> {
    const { error } = await legacyDb.rpc('bim_phuong_an_xoa', { p_id: id });
    if (error) fail(error, 'Không xóa được phương án');
  },
  async models(projectId: string): Promise<ProposalModel[]> {
    const { data, error } = await legacyDb
      .from('bim_models')
      .select('id,file_name,discipline,phien_ban,ghi_chu_phien_ban,status')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .eq('status', 'ready')
      .order('file_name');
    if (error) fail(error, 'Lỗi tải mô hình');
    return (data ?? []) as ProposalModel[];
  },
};
