// Quyết định có nhận thêm việc chuyển đổi hay không (song song theo kích thước tệp).
// Tệp lớn chiếm nhiều RAM ở bước tính hình học → chạy một mình; tệp nhỏ chạy song song tới giới hạn.

export interface SlotState {
  running: number;
  bigRunning: boolean;
}

export const isBigFile = (bytes: number | null | undefined, bigBytes: number) => (bytes ?? 0) >= bigBytes;

export const canClaim = (
  state: SlotState,
  candidateBytes: number | null | undefined,
  concurrency: number,
  bigBytes: number,
) => {
  if (state.running >= concurrency) return false;
  if (state.bigRunning) return false;
  if (state.running > 0 && isBigFile(candidateBytes, bigBytes)) return false;
  return true;
};
