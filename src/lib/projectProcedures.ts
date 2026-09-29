export type ProjectProcedure = 'bcnckt' | 'gpxd' | 'nghiem_thu';
export const PROJECT_PROCEDURES = {
  bcnckt: { label: 'Thẩm định BCNCKT', path: '/projects/appraisal' },
  gpxd: { label: 'Cấp giấy phép xây dựng', path: '/projects/permits' },
  nghiem_thu: { label: 'Hậu kiểm & Nghiệm thu', path: '/projects/inspections' },
} as const;
export const SUBMISSION_STATUS: Record<string, string> = {
  intake: 'Tiếp nhận',
  analyzing: 'Đang kiểm tra',
  analyzed: 'Đã kiểm tra',
  request_supplement: 'Yêu cầu bổ sung',
  suspended: 'Tạm dừng thẩm định',
  rejected: 'Từ chối tiếp nhận',
  stopped: 'Dừng xử lý',
  reviewed: 'Đã rà soát nội bộ',
};
