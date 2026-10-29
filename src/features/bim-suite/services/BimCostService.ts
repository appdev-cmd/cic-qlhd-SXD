// Unit prices and cost estimates of a project (phase B5, migration 20261027130000). Replaces the cost part of
// cic-hud's BimWorkflowService; the shapes match what the ported panels read.
import { legacyDb } from '../lib/bimDb';
import type { BimCostRow, BimModel, BimUnitPrice } from '@/features/bim-suite/types/bim.types';

export interface CostEstimate {
  id: string;
  project_id: string;
  name: string;
  models: Pick<BimModel, 'id' | 'file_name' | 'phien_ban' | 'discipline'>[];
  rows: BimCostRow[];
  status: 'draft' | 'approved';
  tax_percent: number;
  source: string;
  created_at: string;
  approved_at?: string | null;
}

type Res<T> = { data: T | null; error: { message: string } | null };
const unwrap = <T>({ data, error }: Res<T>, context: string): T => {
  if (error) throw new Error(`${context}: ${error.message}`);
  return data as T;
};

export const BimCostService = {
  importPrices: async (project: string, rows: Partial<BimUnitPrice>[]) =>
    unwrap<number>(
      await legacyDb.rpc('bim_import_unit_prices', { p_project: project, p_rows: rows }),
      'Không nhập được đơn giá',
    ),
  async estimates(project: string): Promise<CostEstimate[]> {
    const rows = unwrap<CostEstimate[]>(
      await legacyDb
        .from('bim_cost_estimates')
        .select('*')
        .eq('project_id', project)
        .order('created_at', { ascending: false })
        .order('id')
        .limit(500),
      'Lỗi tải dự toán',
    );
    return (rows ?? []).map((e) => ({ ...e, tax_percent: Number(e.tax_percent) || 0 }));
  },
  saveEstimate: async (estimate: Omit<CostEstimate, 'id' | 'created_at' | 'approved_at'>) =>
    unwrap<CostEstimate>(
      await legacyDb.from('bim_cost_estimates').insert(estimate).select().single(),
      'Không lưu được dự toán',
    ),
  /** Approval needs project manager rights; an approved estimate is locked by the database. */
  approveEstimate: async (id: string) =>
    unwrap<CostEstimate>(
      await legacyDb
        .from('bim_cost_estimates')
        .update({ status: 'approved' })
        .eq('id', id)
        .eq('status', 'draft')
        .select()
        .single(),
      'Không duyệt được dự toán',
    ),
};
