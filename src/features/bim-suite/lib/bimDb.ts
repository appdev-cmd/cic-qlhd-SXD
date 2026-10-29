// Client Supabase có kiểu cho bảng/view/hàm BIM, sinh từ schema HUD (types/bim-db.types.ts,
// scripts/gen-bim-types.mjs). Dùng thay cho `(supabase as any)` trong phân hệ BIM.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/features/bim-suite/adapters/supabase';
import type { BimDatabase, BimRpcName, BimRpcArgs, BimRpcReturns } from '@/features/bim-suite/types/bim-db.types';

export const bimDb = supabase as unknown as SupabaseClient<BimDatabase>;

/**
 * Bảng/hàm của schema repo nhưng KHÔNG có trên HUD (đối chiếu 22/10/2026: bim_nen_ban_do, bim_bo_chon,
 * bim_cde_lich_su, bim_thong_bao_ngoai, bim_hang_doi…) và bảng ngoài phân hệ BIM (documents, nhiem_vu,
 * notifications). Không sinh được kiểu từ HUD nên dùng client không kiểu, gom về một chỗ có chú thích.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const legacyDb = supabase as unknown as SupabaseClient<any>;

/** Gọi RPC BIM có kiểu; ném lỗi tiếng Việt kèm thông điệp máy chủ. */
export async function bimRpc<T extends BimRpcName>(
  name: T,
  args: BimRpcArgs<T>,
  context = 'Lỗi truy vấn BIM',
): Promise<BimRpcReturns<T>> {
  // Kiểu tham số/giá trị trả về đã được ràng buộc bởi chữ ký hàm này.
  const rpc = bimDb.rpc as unknown as (
    fn: string,
    params: unknown,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc.call(bimDb, name, args);
  if (error) throw new Error(`${context}: ${error.message}`);
  return data as BimRpcReturns<T>;
}
