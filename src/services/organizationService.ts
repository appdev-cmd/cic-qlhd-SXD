import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { MOCK_ORGANIZATIONS } from '../data/mockOrganizations';
import type { Organization } from '../data/mockData';

export const organizationService = {
  /**
   * Lấy danh sách toàn bộ tổ chức tham gia hoạt động xây dựng
   */
  async getAll(): Promise<Organization[]> {
    if (!isSupabaseConfigured()) {
      return MOCK_ORGANIZATIONS;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });

      if (error || !data || data.length === 0) {
        console.warn('Supabase get organizations failed or empty, fallback to mock data:', error);
        return MOCK_ORGANIZATIONS;
      }

      return data.map((row: any) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        type: row.type,
        taxCode: row.tax_code || row.license_number,
        address: row.address,
        representative: row.legal_rep || row.representative,
        phone: row.phone,
        certificateNumber: row.cert_number,
        certificateGrade: row.cert_grade,
        certificateExpiry: row.cert_expiry,
        activeProjectsCount: row.active_projects_count || 0,
        status: row.status,
      }));
    } catch (err) {
      console.error('Error fetching organizations from Supabase:', err);
      return MOCK_ORGANIZATIONS;
    }
  },

  /**
   * Lấy chi tiết một tổ chức theo ID
   */
  async getById(id: string): Promise<Organization | undefined> {
    const list = await this.getAll();
    return list.find((org) => org.id === id);
  },
};
