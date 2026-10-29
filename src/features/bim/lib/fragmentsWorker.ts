// Worker xử lý hình học của thư viện Fragments, tự lưu trữ trong public/bim/ (mặc định thư viện tải từ unpkg.com,
// mạng nội bộ chặn CDN là mất trình xem). `prepare:drawings` chép dist/Worker/worker.min.mjs sang đúng tên dưới đây;
// khi nâng @thatopen/fragments chỉ cần đổi hằng số, test verify-bim-foundation.test.ts báo nếu lệch phiên bản.

export const FRAGMENTS_VERSION = '3.4.8';
export const FRAGMENTS_WORKER_URL = `/bim/fragments-worker-${FRAGMENTS_VERSION}.js`;

// Worker của phân hệ (băm/nén tệp tải lên, dựng mặt cắt) được esbuild đóng gói sẵn vào public/bim/workers/ khi
// `prepare:drawings`, giống worker DXF/IFC của trình xem tài liệu: Turbopack chép nguyên tệp .ts thay vì đóng gói
// khi gặp `new Worker(new URL('./x.worker.ts', import.meta.url))`.
export const BIM_WORKER_URLS = {
  upload: '/bim/workers/bimUpload.worker.js',
  sectionBatch: '/bim/workers/sectionBatch.worker.js',
  clashBroadPhase: '/bim/workers/clashBroadPhase.worker.js',
  narrowPhase: '/bim/workers/narrowPhase.worker.js',
  // Site analysis (lib/sun): sun hours, sun by schedule milestone, facades, building envelope.
  sun: '/bim/workers/sun.worker.js',
  phaseSun: '/bim/workers/phaseSun.worker.js',
  facade: '/bim/workers/facade.worker.js',
  envelope: '/bim/workers/envelope.worker.js',
} as const;
