import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { MOCK_PERSONNEL } from '../data/mockPersonnel';
import type { Personnel } from '../data/mockData';

export const personnelService = {
  /**
   * Lấy danh sách toàn bộ cá nhân hành nghề chuyên nghiệp
   */
  async getAll(): Promise<Personnel[]> {
    if (!isSupabaseConfigured()) {
      return MOCK_PERSONNEL;
    }

    try {
      const { data, error } = await supabase
        .from('personnel')
        .select('*')
        .order('full_name', { ascending: true });

      if (error || !data || data.length === 0) {
        console.warn('Supabase get personnel failed or empty, fallback to mock data:', error);
        return MOCK_PERSONNEL;
      }

      return data.map((row: any) => ({
        id: row.id,
        code: row.code || row.id.toUpperCase(),
        fullName: row.full_name,
        idCard: row.id_card,
        certNumber: row.cert_number,
        certAuthority: row.cert_authority,
        certIssuer: row.cert_authority || 'Sở Xây dựng tỉnh Điện Biên',
        certExpiry: row.cert_expiry,
        certGrade: row.cert_grade,
        specialties: row.specialties || [],
        orgId: row.org_id,
        orgName: row.org_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        activeProjectsCount: row.active_projects_count || 0,
        hasConflictWarning: Boolean(row.has_conflict_warning),
        conflictDetails: row.conflict_details,
      }));
    } catch (err) {
      console.error('Error fetching personnel from Supabase:', err);
      return MOCK_PERSONNEL;
    }
  },

  /**
   * Lấy chi tiết một nhân sự theo ID
   */
  async getById(id: string): Promise<Personnel | undefined> {
    const list = await this.getAll();
    return list.find((p) => p.id === id);
  },
};
