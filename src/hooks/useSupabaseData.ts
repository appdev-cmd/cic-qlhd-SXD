import { useState, useEffect } from 'react';
import { organizationService } from '../services/organizationService';
import { personnelService } from '../services/personnelService';
import { projectService } from '../services/projectService';
import { MOCK_ORGANIZATIONS, MOCK_PERSONNEL, MOCK_PROJECTS, type Organization, type Personnel, type Project } from '../data/mockData';
import { isSupabaseConfigured } from '../lib/supabase';

/**
 * Hook nạp dữ liệu Tổ chức với cơ chế SWR (Stale-While-Revalidate)
 * Mặc định khởi tạo ngay với Mock Data, đồng bộ từ Supabase Database ngầm
 */
export function useOrganizations() {
  const [data, setData] = useState<Organization[]>(MOCK_ORGANIZATIONS);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured());
  const [isLiveDb, setIsLiveDb] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    if (isSupabaseConfigured()) {
      organizationService.getAll().then((res) => {
        if (isMounted) {
          setData(res);
          setIsLoading(false);
          setIsLiveDb(true);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  return { organizations: data, isLoading, isLiveDb };
}

/**
 * Hook nạp dữ liệu Cá nhân hành nghề
 */
export function usePersonnel() {
  const [data, setData] = useState<Personnel[]>(MOCK_PERSONNEL);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured());
  const [isLiveDb, setIsLiveDb] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    if (isSupabaseConfigured()) {
      personnelService.getAll().then((res) => {
        if (isMounted) {
          setData(res);
          setIsLoading(false);
          setIsLiveDb(true);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  return { personnel: data, isLoading, isLiveDb };
}

/**
 * Hook nạp dữ liệu Dự án thẩm định
 */
export function useProjects() {
  const [data, setData] = useState<Project[]>(MOCK_PROJECTS);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured());
  const [isLiveDb, setIsLiveDb] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    if (isSupabaseConfigured()) {
      projectService.getAll().then((res) => {
        if (isMounted) {
          setData(res);
          setIsLoading(false);
          setIsLiveDb(true);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  return { projects: data, isLoading, isLiveDb };
}
