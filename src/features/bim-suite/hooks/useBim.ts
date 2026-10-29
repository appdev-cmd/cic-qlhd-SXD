// features/bim/hooks/useBim.ts
// TanStack React Query hooks cho phân hệ BIM

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BimService } from '../services/BimService';
import { BimWorkspaceService } from '../services/BimWorkspaceService';
import {
  BimDiscipline,
  BimSavedView,
  BimIssue,
  BimElementFilter,
  BimModel,
  BimDocumentLink,
} from '@/features/bim-suite/types/bim.types';
import { useToast } from '@/features/bim-suite/adapters/toast';
import type { ElementCursor } from '../lib/bimSearch';

// 1. Quản lý danh sách mô hình
export const useBimModels = (projectId: string, workId?: string) => {
  return useQuery({
    queryKey: ['bim-models', projectId, workId || 'all'],
    queryFn: () => BimService.getModels(projectId, workId),
    enabled: !!projectId,
    refetchInterval: (query) => {
      // Nếu có mô hình đang ở trạng thái 'uploaded' hoặc 'processing', tự động poll mỗi 3 giây
      const data = query.state.data;
      const hasProcessing = data?.some((m) => m.status === 'uploaded' || m.status === 'processing');
      return hasProcessing ? 3000 : false;
    },
    staleTime: 30 * 1000,
  });
};

// Bộ chọn thông minh (G3)
export const useBimFieldCatalog = (modelIds: string[]) => {
  return useQuery({
    queryKey: ['bim-field-catalog', [...modelIds].sort().join(',')],
    queryFn: () => BimService.getFieldCatalog(modelIds),
    enabled: modelIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
};

export const useBimSmartSets = (projectId: string) => {
  return useQuery({
    queryKey: ['bim-smart-sets', projectId],
    queryFn: () => BimService.getSmartSets(projectId),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
};

export const useSaveBimSmartSet = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: BimService.saveSmartSet.bind(BimService),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-smart-sets', projectId] });
      addToast({ type: 'success', message: 'Đã lưu bộ chọn.' });
    },
    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
  });
};

export const useDeleteBimSmartSet = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: (id: string) => BimService.deleteSmartSet(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bim-smart-sets', projectId] }),
    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
  });
};

/** Vị trí hàng đợi chuyển đổi — chỉ hỏi khi có mô hình đang chờ */
export const useBimQueue = (enabled: boolean) => {
  return useQuery({
    queryKey: ['bim-queue'],
    queryFn: () => BimService.getQueue(),
    enabled,
    refetchInterval: enabled ? 5000 : false,
    staleTime: 2000,
  });
};

export const useBimModelDetail = (modelId?: string) => {
  return useQuery({
    queryKey: ['bim-model-detail', modelId],
    queryFn: () => (modelId ? BimService.getModelById(modelId) : null),
    enabled: !!modelId,
  });
};

export const useUploadBimModel = (projectId: string, workId?: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: ({
      file,
      discipline,
      uploadedBy,
      previousModel,
      versionNote,
    }: {
      file: File;
      discipline: BimDiscipline;
      uploadedBy?: string;
      previousModel?: BimModel | null;
      versionNote?: string;
    }) => BimService.uploadModel(projectId, file, discipline, workId, { uploadedBy, previousModel, versionNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-models', projectId] });
      addToast({
        title: 'Tải lên thành công',
        message: 'Mô hình IFC đã được tải lên và đang chuyển đổi dữ liệu ngầm.',
        type: 'success',
      });
    },
    onError: (err: any) => {
      addToast({
        title: 'Tải lên thất bại',
        message: err.message || 'Lỗi khi upload file IFC.',
        type: 'error',
      });
    },
  });
};

export const useDeleteBimModel = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: (modelId: string) => BimService.deleteModel(modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-models', projectId] });
      addToast({
        title: 'Đã xóa',
        message: 'Mô hình BIM đã được gỡ bỏ khỏi dự án.',
        type: 'success',
      });
    },
    onError: (err: any) => {
      addToast({
        title: 'Lỗi xóa mô hình',
        message: err.message || 'Không thể xóa mô hình.',
        type: 'error',
      });
    },
  });
};

export const useRetryBimModel = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: (modelId: string) => BimService.retryModel(modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-models', projectId] });
      addToast({
        title: 'Đã gửi yêu cầu xử lý lại',
        message: 'Hệ thống đang xếp hàng chuyển đổi lại mô hình.',
        type: 'info',
      });
    },
    onError: (err: any) => {
      addToast({
        title: 'Lỗi',
        message: err.message || 'Không thể yêu cầu chuyển đổi lại.',
        type: 'error',
      });
    },
  });
};

// 2. Tra cứu cấu kiện & khối lượng
const ELEMENT_PAGE_SIZE = 200;

/** Danh sách cấu kiện phân trang theo bộ lọc (dùng cho cây cấu kiện và kết quả tìm kiếm) */
export const useBimElementsPaged = (modelId: string | undefined, filter: BimElementFilter, enabled = true) => {
  return useInfiniteQuery({
    queryKey: ['bim-elements', modelId, filter],
    // Phân trang keyset: trang sau bắt đầu sau (ten_cau_kien, id) của dòng cuối trang trước
    queryFn: ({ pageParam }) => BimService.getElementsPage(modelId!, filter, pageParam, ELEMENT_PAGE_SIZE),
    initialPageParam: null as ElementCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!modelId && enabled,
    staleTime: 5 * 60 * 1000,
  });
};

/** Tổng hợp khối lượng theo loại / vật liệu / vị trí (view v_bim_khoi_luong_tong_hop) */
export const useBimQuantitySummary = (modelId?: string) => {
  return useQuery({
    queryKey: ['bim-quantity-summary', modelId],
    queryFn: () => (modelId ? BimService.getQuantitySummary(modelId) : []),
    enabled: !!modelId,
    staleTime: 5 * 60 * 1000,
  });
};

/** Tổng hợp khối lượng của nhiều mô hình đang hiển thị (ghép liên bộ môn) */
export const useBimQuantitySummaryMany = (modelIds: string[]) => {
  const key = [...modelIds].sort().join(',');
  return useQuery({
    queryKey: ['bim-quantity-summary-many', key],
    queryFn: () => BimService.getQuantitySummaryMany(modelIds),
    enabled: modelIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
};

/** Chi tiết cấu kiện theo GUID trong một mô hình */
export const useBimElementByGuid = (modelId?: string, guid?: string | null) => {
  return useQuery({
    queryKey: ['bim-element-guid', modelId, guid],
    queryFn: () => (modelId && guid ? BimService.getElementByModelGuid(modelId, guid) : null),
    enabled: !!modelId && !!guid,
    staleTime: 5 * 60 * 1000,
  });
};

export const useBimElementDetail = (modelId?: string, expressId?: number) => {
  return useQuery({
    queryKey: ['bim-element-detail', modelId, expressId],
    queryFn: () => (modelId && expressId !== undefined ? BimService.getElementByExpressId(modelId, expressId) : null),
    enabled: !!modelId && expressId !== undefined,
    staleTime: 5 * 60 * 1000,
  });
};

// 3. Góc nhìn lưu trữ (Saved views)
export const useBimSavedViews = (projectId: string, modelId?: string) => {
  return useQuery({
    queryKey: ['bim-saved-views', projectId, modelId || 'all'],
    queryFn: () => BimService.getSavedViews(projectId, modelId),
    enabled: !!projectId,
  });
};

export const useSaveBimView = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: (view: Omit<BimSavedView, 'id' | 'created_at'>) => BimService.saveView(view),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-saved-views', projectId] });
      addToast({
        title: 'Đã lưu góc nhìn',
        message: 'Góc nhìn 3D hiện tại đã được ghi nhớ thành công.',
        type: 'success',
      });
    },
    onError: (err: any) => {
      addToast({
        title: 'Lỗi lưu góc nhìn',
        message: err.message,
        type: 'error',
      });
    },
  });
};

export const useDeleteBimView = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: (viewId: string) => BimService.deleteSavedView(viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-saved-views', projectId] });
      addToast({
        title: 'Đã xóa',
        message: 'Góc nhìn đã được xóa.',
        type: 'success',
      });
    },
  });
};

// 4. Vướng mắc phối hợp BIM (Issues)
export const useBimIssues = (projectId: string, modelId?: string) => {
  return useQuery({
    queryKey: ['bim-issues', projectId, modelId || 'all'],
    queryFn: () => BimService.getIssues(projectId, modelId),
    enabled: !!projectId,
  });
};

export const useCreateBimIssue = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: (issue: Omit<BimIssue, 'id' | 'created_at' | 'updated_at'>) => BimService.createIssue(issue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-issues', projectId] });
      addToast({
        title: 'Đã tạo vướng mắc',
        message: 'Vướng mắc 3D đã được ghi nhận và phân công xử lý.',
        type: 'success',
      });
    },
    onError: (err: any) => {
      addToast({
        title: 'Lỗi tạo vướng mắc',
        message: err.message,
        type: 'error',
      });
    },
  });
};

export const useUpdateBimIssue = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<BimIssue> }) => BimService.updateIssue(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-issues', projectId] });
      addToast({
        title: 'Cập nhật thành công',
        message: 'Trạng thái vướng mắc đã được lưu.',
        type: 'success',
      });
    },
  });
};

export const useBimIssueComments = (issueId?: string) => {
  return useQuery({
    queryKey: ['bim-issue-comments', issueId],
    queryFn: () => (issueId ? BimService.getIssueComments(issueId) : []),
    enabled: !!issueId,
  });
};

export const useAddBimIssueComment = (issueId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      author,
      authorId,
      system,
    }: {
      body: string;
      author?: string;
      authorId?: string;
      system?: boolean;
    }) =>
      issueId
        ? BimService.addIssueComment(issueId, body, author, { authorId, system })
        : Promise.reject(new Error('No issueId')),
    onSuccess: () => {
      if (issueId) {
        queryClient.invalidateQueries({ queryKey: ['bim-issue-comments', issueId] });
      }
    },
  });
};

/** Latest acceptance verdict per element, keyed by elementKey(model_id, global_id); includes group acceptances. */
export const useBimWorkspaceAcceptance = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: ['bim-workspace-acceptance', projectId],
    queryFn: () => BimWorkspaceService.acceptance(projectId),
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  });

/** Project owner and members, for assignee lists. */
export const useBimProjectPeople = (projectId?: string) =>
  useQuery({
    queryKey: ['bim-project-people', projectId],
    queryFn: () => BimService.getProjectPeople(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

// 5. Liên kết nghiệm thu cho cấu kiện
export const useBimAcceptanceRecords = (bimGuid?: string) => {
  return useQuery({
    queryKey: ['bim-acceptance-records', bimGuid],
    queryFn: () => (bimGuid ? BimService.getAcceptanceRecordsForGuid(bimGuid) : []),
    enabled: !!bimGuid,
    staleTime: 60 * 1000,
  });
};

// 6. Liên kết hồ sơ tài liệu
export const useBimElementLinks = (projectId?: string, guid?: string | null) => {
  return useQuery({
    queryKey: ['bim-links', projectId, guid],
    queryFn: async () => {
      const links = await BimService.getLinksForElement(projectId!, guid!);
      const docIds = links.filter((l) => l.loai_doi_tuong === 'tai_lieu').map((l) => l.doi_tuong_id);
      const ntIds = links.filter((l) => l.loai_doi_tuong === 'nghiem_thu').map((l) => l.doi_tuong_id);
      const taskIds = links.filter((l) => l.loai_doi_tuong === 'cong_viec').map((l) => l.doi_tuong_id);
      const boqIds = links.filter((l) => l.loai_doi_tuong === 'boq').map((l) => l.doi_tuong_id);
      const [docs, acceptances, tasks, boqs] = await Promise.all([
        BimService.getDocumentsByIds(docIds),
        BimService.getAcceptanceByIds(ntIds),
        BimService.getTasksByIds(taskIds),
        // Liên kết BOQ thuộc mô-đun Chi phí (giai đoạn B5), chưa có nguồn.
        Promise.resolve([] as { ma_boq: string }[]),
      ]);
      const docMap = new Map(docs.map((d) => [d.id, d]));
      const ntMap = new Map(acceptances.map((n: any) => [String(n.ma_nghiem_thu), n]));
      const taskMap = new Map(tasks.map((t) => [t.ma_nhiem_vu, t]));
      const boqMap = new Map(boqs.map((b) => [String(b.ma_boq), b]));
      const recordOf = (l: BimDocumentLink) => {
        if (l.loai_doi_tuong === 'boq') return boqMap.get(l.doi_tuong_id);
        if (l.loai_doi_tuong === 'tai_lieu') return docMap.get(String(l.doi_tuong_id));
        if (l.loai_doi_tuong === 'nghiem_thu') return ntMap.get(String(l.doi_tuong_id));
        return taskMap.get(String(l.doi_tuong_id));
      };
      return links.map((l) => ({ link: l, record: recordOf(l) }));
    },
    enabled: !!projectId && !!guid,
    staleTime: 60 * 1000,
  });
};

export const useBimLinkedGuids = (projectId?: string) => {
  return useQuery({
    queryKey: ['bim-linked-guids', projectId],
    queryFn: () => BimService.getLinkedGuids(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
};

export const useAddBimLinks = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: (links: Omit<BimDocumentLink, 'id' | 'created_at'>[]) => BimService.addLinks(links),
    onSuccess: (_d, links) => {
      queryClient.invalidateQueries({ queryKey: ['bim-links', projectId] });
      queryClient.invalidateQueries({ queryKey: ['bim-linked-guids', projectId] });
      queryClient.invalidateQueries({ queryKey: ['bim-workspace-acceptance', projectId] });
      queryClient.invalidateQueries({ queryKey: ['bim-task-links', projectId] });
      addToast({ title: 'Đã gắn hồ sơ', message: `Đã liên kết ${links.length} hồ sơ với cấu kiện.`, type: 'success' });
    },
    onError: (err: any) => addToast({ title: 'Lỗi gắn hồ sơ', message: err.message, type: 'error' }),
  });
};

export const useRemoveBimLink = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: (id: string) => BimService.removeLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-links', projectId] });
      queryClient.invalidateQueries({ queryKey: ['bim-linked-guids', projectId] });
      queryClient.invalidateQueries({ queryKey: ['bim-workspace-acceptance', projectId] });
      queryClient.invalidateQueries({ queryKey: ['bim-task-links', projectId] });
    },
    onError: (err: any) => addToast({ title: 'Lỗi gỡ liên kết', message: err.message, type: 'error' }),
  });
};

export const useProjectDocumentSearch = (projectId: string, search: string, enabled = true) => {
  return useQuery({
    queryKey: ['bim-doc-search', projectId, search],
    queryFn: () => BimService.searchProjectDocuments(projectId, search),
    enabled: !!projectId && enabled,
    staleTime: 30 * 1000,
  });
};

// 7. Nghiệm thu gắn cấu kiện
export const useBimAcceptanceStatus = (projectId?: string, enabled = true) => {
  return useQuery({
    queryKey: ['bim-acceptance-status', projectId],
    queryFn: () => BimService.getAcceptanceStatusByGuid(projectId!),
    enabled: !!projectId && enabled,
    staleTime: 60 * 1000,
  });
};

export const useCreateBimAcceptance = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: (record: Parameters<typeof BimService.createAcceptanceForElement>[0]) =>
      BimService.createAcceptanceForElement(record),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bim-acceptance-records'] });
      queryClient.invalidateQueries({ queryKey: ['bim-acceptance-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['bim-workspace-acceptance', projectId] });
      queryClient.invalidateQueries({ queryKey: ['nghiem-thu', projectId] });
      addToast({ title: 'Đã lập biên bản', message: 'Biên bản nghiệm thu đã gắn với cấu kiện.', type: 'success' });
    },
    onError: (err: any) => addToast({ title: 'Lỗi lập biên bản', message: err.message, type: 'error' }),
  });
};

// 8. So sánh phiên bản
export const useBimVersionDiff = (oldModelId?: string | null, newModelId?: string | null) => {
  return useQuery({
    queryKey: ['bim-version-diff', oldModelId, newModelId],
    queryFn: () => BimService.compareVersions(oldModelId!, newModelId!),
    enabled: !!oldModelId && !!newModelId,
    staleTime: 5 * 60 * 1000,
  });
};

// ============================================================
// 4D tiến độ · 5D chi phí · kiểm tra chất lượng thông tin
// ============================================================

/** Công việc tiến độ của dự án (gắn cấu kiện & mô phỏng 4D) */
export const useProjectTasks = (projectId?: string, enabled = true) => {
  return useQuery({
    queryKey: ['bim-project-tasks', projectId],
    queryFn: () => BimService.getProjectTasks(projectId!),
    enabled: !!projectId && enabled,
    staleTime: 60 * 1000,
  });
};

/** GUID cấu kiện → danh sách công việc đã gắn */
export const useBimTaskLinks = (projectId?: string, enabled = true) => {
  return useQuery({
    queryKey: ['bim-task-links', projectId],
    queryFn: () => BimService.getTaskLinks(projectId!),
    enabled: !!projectId && enabled,
    staleTime: 30 * 1000,
  });
};

export const useBimUnitPrices = (projectId?: string, enabled = true) => {
  return useQuery({
    queryKey: ['bim-unit-prices', projectId],
    queryFn: () => BimService.getUnitPrices(projectId!),
    enabled: !!projectId && enabled,
    staleTime: 60 * 1000,
  });
};

export const useSaveBimUnitPrice = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: (price: Parameters<typeof BimService.saveUnitPrice>[0]) => BimService.saveUnitPrice(price),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bim-unit-prices', projectId] }),
    onError: (err: any) => addToast({ title: 'Lỗi lưu đơn giá', message: err.message, type: 'error' }),
  });
};

export const useDeleteBimUnitPrice = (projectId: string) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: (id: string) => BimService.deleteUnitPrice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bim-unit-prices', projectId] }),
    onError: (err: any) => addToast({ title: 'Lỗi xóa đơn giá', message: err.message, type: 'error' }),
  });
};

/** Kiểm tra chất lượng thông tin mô hình — chỉ chạy khi người dùng bấm */
export const useBimQualityCheck = (modelId?: string) => {
  return useMutation({
    mutationFn: () => BimService.checkModelQuality(modelId!),
  });
};
