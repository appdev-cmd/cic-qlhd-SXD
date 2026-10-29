import type * as THREE from 'three';

type FrameRequest = (callback: () => void) => number;
type FrameCancel = (handle: number) => void;

/**
 * Vòng vẽ cho lớp phủ DOM trên 3D: mỗi khung hình chỉ so ma trận camera và kích thước khung nhìn (không cấp phát),
 * vẽ lại khi có thay đổi; dừng hẳn khi lớp bị ẩn. Dữ liệu đổi thì gọi draw() trực tiếp từ lớp phủ.
 */
export class OverlayRedraw {
  private handle = 0;
  private readonly last = new Float64Array(34);
  private primed = false;
  private readonly request: FrameRequest;
  private readonly cancel: FrameCancel;

  constructor(
    private readonly camera: () => THREE.Camera | null,
    private readonly host: HTMLElement,
    private readonly draw: () => void,
  ) {
    const g = globalThis as typeof globalThis & {
      requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame?: (handle: number) => void;
    };
    this.request = g.requestAnimationFrame
      ? (cb) => g.requestAnimationFrame!(() => cb())
      : (cb) => setTimeout(cb, 50) as unknown as number;
    this.cancel = g.cancelAnimationFrame
      ? (h) => g.cancelAnimationFrame!(h)
      : (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
  }

  get running() {
    return this.handle !== 0;
  }
  start() {
    if (!this.handle) this.handle = this.request(this.tick);
  }
  stop() {
    if (this.handle) this.cancel(this.handle);
    this.handle = 0;
    this.primed = false;
  }
  /** true nếu camera hoặc khung nhìn đổi kể từ lần kiểm tra trước (ghi nhận trạng thái mới). */
  changed(): boolean {
    const camera = this.camera();
    if (!camera) return false;
    const world = camera.matrixWorld.elements;
    const projection = camera.projectionMatrix.elements;
    let diff = !this.primed;
    for (let i = 0; i < 16; i++) {
      if (this.last[i] !== world[i]) {
        this.last[i] = world[i];
        diff = true;
      }
      if (this.last[16 + i] !== projection[i]) {
        this.last[16 + i] = projection[i];
        diff = true;
      }
    }
    if (this.last[32] !== this.host.clientWidth || this.last[33] !== this.host.clientHeight) {
      this.last[32] = this.host.clientWidth;
      this.last[33] = this.host.clientHeight;
      diff = true;
    }
    this.primed = true;
    return diff;
  }
  private tick = () => {
    this.handle = 0;
    if (this.changed()) this.draw();
    this.handle = this.request(this.tick);
  };
}
