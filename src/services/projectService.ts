import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { MOCK_PROJECTS, type Project, getProjectTT39Data } from '../data/mockData';

export const projectService = {
  /**
   * Lấy danh sách toàn bộ dự án thẩm định
   */
  async getAll(): Promise<Project[]> {
    if (!isSupabaseConfigured()) {
      return MOCK_PROJECTS;
    }

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('submission_date', { ascending: false });

      if (error || !data || data.length === 0) {
        console.warn('Supabase get projects failed or empty, fallback to mock data:', error);
        return MOCK_PROJECTS;
      }

      return data.map((row: any) => {
        // Fallback matching to existing mock structure
        const existing = MOCK_PROJECTS.find((p) => p.id === row.id);
        if (existing) {
          return {
            ...existing,
            name: row.title || existing.name,
            totalInvestment: Number(row.investment_cost) || existing.totalInvestment,
            location: row.location_district || existing.location,
          };
        }

        return {
          id: row.id,
          code: row.code,
          name: row.title,
          coverImage: row.thumbnail_url,
          images: row.thumbnail_url
            ? [
                {
                  id: `img-${row.id}-1`,
                  url: row.thumbnail_url,
                  title: 'Ảnh phối cảnh',
                  isPrimary: true,
                  category: 'phoi_canh',
                  categoryLabel: 'Phối cảnh',
                  date: row.submission_date || '2026-03-01',
                  author: 'Chủ đầu tư',
                },
              ]
            : [],
          investorId: row.investor_id || 'org-001',
          investorName: row.investor_name || 'Ban QLDA Tỉnh Điện Biên',
          location: row.location_district || 'Điện Biên',
          projectGroup: (row.group_type?.includes('A') ? 'A' : row.group_type?.includes('C') ? 'C' : 'B') as any,
          buildingGrade: (row.grade?.includes('I') ? 'I' : 'II') as any,
          totalInvestment: Number(row.investment_cost) || 0,
          stage: 'bcnckt',
          slaStatus: 'dang_tham_dinh',
          submissionDate: row.submission_date || '2026-03-01',
          deadlineDate: row.deadline || '2026-04-15',
          assignee: row.lead_reviewer_name || 'KTS. Chuyên viên Sở XD',
          department: 'Phòng Quản lý Xây dựng',
          planningCompliance: true,
          standardCompliance: true,
          fireSafetyStatus: 'dat',
          estimatedSavings: Math.round(Number(row.investment_cost || 0) * 0.045),
          contractors: [],
        };
      });
    } catch (err) {
      console.error('Error fetching projects from Supabase:', err);
      return MOCK_PROJECTS;
    }
  },

  /**
   * Lấy chi tiết dự án theo ID
   */
  async getById(id: string): Promise<Project | undefined> {
    const list = await this.getAll();
    return list.find((p) => p.id === id);
  },

  /**
   * Lấy dữ liệu hồ sơ theo Thông tư 39
   */
  async getTT39Data(project: Project) {
    if (!isSupabaseConfigured()) {
      return getProjectTT39Data(project);
    }

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('tt39_data')
        .eq('id', project.id)
        .single();

      if (error || !data?.tt39_data) {
        return getProjectTT39Data(project);
      }

      return data.tt39_data;
    } catch {
      return getProjectTT39Data(project);
    }
  },
};
