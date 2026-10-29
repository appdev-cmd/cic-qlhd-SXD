import * as THREE from 'three';
import { OverlayRedraw } from './overlayRedraw';
import { ScreenLabelIndex } from '../lib/screenLabelIndex';

export type IotPinStatus = 'normal' | 'warning' | 'critical' | 'bad' | 'stale';
export const IOT_PIN_COLORS: Record<IotPinStatus, string> = {
  normal: '#059669',
  warning: '#d97706',
  critical: '#dc2626',
  bad: '#9333ea',
  stale: '#64748b',
};
export const IOT_PIN_LABELS: Record<IotPinStatus, string> = {
  normal: 'Theo dõi',
  warning: 'Vượt ngưỡng',
  critical: 'Vượt ngưỡng nghiêm trọng',
  bad: 'Lỗi cảm biến',
  stale: 'Mất cập nhật',
};
export interface BimIotSensorPin {
  id: string;
  modelId: string;
  guid: string;
  label: string;
  title: string;
  summary: string;
  status: IotPinStatus;
  selected?: boolean;
}
export interface BimIotSensorConfig {
  pins: BimIotSensorPin[];
  scopeLabel?: string;
  showLabels: boolean;
  onSelect: (id: string) => void;
}
interface PinNode {
  button: HTMLButtonElement;
  label: HTMLSpanElement;
  dot: HTMLSpanElement;
  line: SVGLineElement;
  point: THREE.Vector3 | null;
  key: string;
}

/** Independent DOM overlay; leaves issue pins, element coloring and selection materials alone. */
export class IotSensorLayer {
  private config: BimIotSensorConfig | null = null;
  private nodes = new Map<string, PinNode>();
  private cache = new Map<string, Promise<THREE.Vector3 | null>>();
  private root: HTMLDivElement;
  private legend: HTMLDivElement;
  private svg: SVGSVGElement;
  private redraw: OverlayRedraw;
  private alive = true;
  private projected = new THREE.Vector3();
  private occupied = new ScreenLabelIndex();
  /** Số lần vẽ (chẩn đoán/kiểm thử): chỉ tăng khi camera, khung nhìn hoặc dữ liệu đổi. */
  draws = 0;

  constructor(
    private host: HTMLElement,
    private camera: () => THREE.Camera | null,
    private modelKey: (id: string) => string | null,
    private resolve: (modelId: string, guid: string) => Promise<THREE.Vector3 | null>,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud-iot-sensor-layer';
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    const style = document.createElement('style');
    style.textContent = `.hud-iot-pin{position:absolute;display:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;transform:translate(-50%,-50%)}
        .hud-iot-pin:focus-visible{outline:3px solid #06b6d4;outline-offset:3px;border-radius:50%}
        .hud-iot-pin-dot{display:flex;align-items:center;justify-content:center;width:16px;height:16px;border:2px solid white;border-radius:50%;color:white;font:700 11px system-ui;box-shadow:0 1px 7px #0006}
        .hud-iot-pin-label{display:none;position:absolute;left:25px;top:0;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;border-radius:6px;padding:4px 7px;color:#f8fafc;background:#0f172aeb;box-shadow:0 2px 7px #0003;font:600 11px system-ui;pointer-events:none}
        .hud-iot-pin:hover .hud-iot-pin-label,.hud-iot-pin:focus .hud-iot-pin-label,.hud-iot-pin[data-label="true"] .hud-iot-pin-label{display:block}
        .hud-iot-pin[data-selected="true"] .hud-iot-pin-dot{outline:3px solid #22d3ee;outline-offset:2px}
        .hud-iot-pin[data-critical="true"] .hud-iot-pin-dot{box-shadow:0 0 0 5px #ef444430,0 1px 8px #0006}`;
    this.root.appendChild(style);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.root.appendChild(this.svg);
    this.legend = document.createElement('div');
    this.legend.style.cssText =
      'position:absolute;left:12px;top:12px;max-width:calc(100% - 24px);pointer-events:none;background:#0f172aed;color:#f8fafc;border:1px solid #64748b;border-radius:10px;padding:8px 10px;font:11px system-ui;box-shadow:0 3px 12px #0002';
    this.root.appendChild(this.legend);
    host.appendChild(this.root);
    // Chỉ chiếu lại khi camera/khung nhìn đổi; dữ liệu đổi thì update() vẽ ngay. Ẩn lớp thì dừng vòng vẽ.
    this.redraw = new OverlayRedraw(camera, host, () => this.draw());
  }

  update(config: BimIotSensorConfig | null) {
    this.config = config;
    const ids = new Set(config?.pins.map((p) => p.id) ?? []);
    for (const [id, node] of this.nodes)
      if (!ids.has(id)) {
        node.button.remove();
        node.line.remove();
        this.nodes.delete(id);
      }
    this.root.style.display = config?.pins.length ? 'block' : 'none';
    if (config?.pins.length) this.redraw.start();
    else this.redraw.stop();
    if (!config) return;
    for (const pin of config.pins) {
      let node = this.nodes.get(pin.id);
      if (!node) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hud-iot-pin';
        const dot = document.createElement('span');
        dot.className = 'hud-iot-pin-dot';
        const label = document.createElement('span');
        label.className = 'hud-iot-pin-label';
        button.append(dot, label);
        for (const name of ['pointerdown', 'pointerup', 'dblclick'])
          button.addEventListener(name, (e) => e.stopPropagation());
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          this.config?.onSelect(pin.id);
        });
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', '#94a3b8');
        line.setAttribute('stroke-width', '1');
        line.style.display = 'none';
        this.svg.appendChild(line);
        this.root.appendChild(button);
        node = { button, dot, label, line, point: null, key: '' };
        this.nodes.set(pin.id, node);
      }
      node.dot.style.background = IOT_PIN_COLORS[pin.status];
      node.dot.textContent =
        pin.status === 'critical' || pin.status === 'warning'
          ? '!'
          : pin.status === 'stale'
            ? '×'
            : pin.status === 'bad'
              ? '?'
              : '';
      node.button.dataset.selected = String(!!pin.selected);
      node.button.dataset.critical = String(pin.status === 'critical');
      node.button.dataset.label = String(
        config.showLabels || pin.selected || pin.status === 'critical' || pin.status === 'warning',
      );
      node.button.style.zIndex = pin.selected ? '8' : pin.status === 'normal' ? '2' : '5';
      node.button.setAttribute('aria-label', `Cảm biến ${pin.label}: ${IOT_PIN_LABELS[pin.status]}. ${pin.summary}`);
      node.button.title = pin.title;
      node.label.textContent = `${pin.label} · ${pin.summary}`;
      const version = this.modelKey(pin.modelId);
      const key = version ? `${pin.modelId}:${version}:${pin.guid}` : '';
      if (node.key !== key || (!node.point && key && !this.cache.has(key))) {
        node.key = key;
        node.point = null;
        if (!key) continue;
        let promise = this.cache.get(key);
        if (!promise) {
          promise = this.resolve(pin.modelId, pin.guid).catch(() => null);
          this.cache.set(key, promise);
        }
        const current = node;
        void promise.then((point) => {
          if (!this.alive || current.key !== key) return;
          current.point = point;
          if (!point) this.cache.delete(key);
          this.draw();
        });
      }
    }
    this.draw();
  }

  private draw() {
    const camera = this.camera(),
      config = this.config;
    if (!camera || !config || !this.alive) return;
    this.draws++;
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    const occupied = this.occupied;
    occupied.clear();
    let placed = 0,
      visible = 0;
    for (const pin of config.pins) {
      const node = this.nodes.get(pin.id);
      if (!node) continue;
      if (!node.point) {
        node.button.style.display = 'none';
        node.line.style.display = 'none';
        continue;
      }
      placed++;
      this.projected.copy(node.point).project(camera);
      const x = ((this.projected.x + 1) * width) / 2,
        y = ((1 - this.projected.y) * height) / 2;
      if (this.projected.z < -1 || this.projected.z > 1 || x < 5 || x > width - 5 || y < 5 || y > height - 5) {
        node.button.style.display = 'none';
        node.line.style.display = 'none';
        continue;
      }
      let px = x,
        py = y;
      for (let attempt = 0; attempt < 32 && occupied.overlaps(px, py); attempt++) {
        const angle = attempt * 2.4,
          radius = 22 + Math.floor(attempt / 7) * 15;
        px = Math.max(15, Math.min(width - 15, x + Math.cos(angle) * radius));
        py = Math.max(15, Math.min(height - 15, y + Math.sin(angle) * radius));
      }
      occupied.add(px, py);
      visible++;
      node.button.style.display = 'flex';
      node.button.style.left = `${px}px`;
      node.button.style.top = `${py}px`;
      node.label.style.left = px > width * 0.65 ? 'auto' : '25px';
      node.label.style.right = px > width * 0.65 ? '25px' : 'auto';
      node.line.style.display = Math.hypot(px - x, py - y) > 5 ? 'block' : 'none';
      node.line.setAttribute('x1', String(x));
      node.line.setAttribute('y1', String(y));
      node.line.setAttribute('x2', String(px));
      node.line.setAttribute('y2', String(py));
    }
    const scope = config.scopeLabel ? `${config.scopeLabel}\n` : '';
    const text =
      width < 300
        ? `IoT LIVE · ${visible}/${config.pins.length}\n${scope}Bấm điểm để xem`
        : `IoT LIVE · ${visible}/${config.pins.length} điểm thiết bị trong khung nhìn · ${placed} đã định vị\n${scope}Xanh: theo dõi · Cam: vượt ngưỡng · Đỏ: nghiêm trọng · Tím: lỗi · Xám: mất cập nhật\nXuyên lớp vỏ để thấy điểm tham chiếu; bấm điểm để xem chỉ số. ${placed < config.pins.length ? 'Đang chờ mô hình/GUID còn thiếu.' : ''}`;
    if (this.legend.textContent !== text) {
      this.legend.textContent = text;
      this.legend.style.whiteSpace = 'pre-line';
    }
  }

  dispose() {
    this.alive = false;
    this.redraw.stop();
    this.nodes.clear();
    this.cache.clear();
    this.root.remove();
  }
}
