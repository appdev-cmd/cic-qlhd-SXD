import * as THREE from 'three';
import { OverlayRedraw } from './overlayRedraw';

export interface FacilityAssetLabel {
  assetId: string;
  modelId: string;
  guid: string;
  name: string;
  code: string;
  location: string;
  color: string;
}
export interface FacilityAssetLayerConfig {
  assets: FacilityAssetLabel[];
  showLabels: boolean;
  onSelect: (assetId: string) => void;
}
interface Node {
  button: HTMLButtonElement;
  name: HTMLSpanElement;
  line: SVGLineElement;
  dot: SVGCircleElement;
  key: string;
  point: THREE.Vector3 | null;
}

/** Device labels stay separate from live IoT and issue pins. Coordinates are world-space. */
export class FacilityAssetLayer {
  private config: FacilityAssetLayerConfig | null = null;
  private nodes = new Map<string, Node>();
  private cache = new Map<string, Promise<THREE.Vector3 | null>>();
  private root = document.createElement('div');
  private svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private legend = document.createElement('div');
  private redraw: OverlayRedraw;
  private alive = true;
  private projected = new THREE.Vector3();
  /** Số lần vẽ: chỉ tăng khi camera, khung nhìn hoặc dữ liệu đổi. */
  draws = 0;

  constructor(
    private host: HTMLElement,
    private camera: () => THREE.Camera | null,
    private modelKey: (modelId: string) => string | null,
    private resolve: (modelId: string, guid: string) => Promise<THREE.Vector3 | null>,
  ) {
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    this.svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.legend.style.cssText =
      'position:absolute;top:52px;left:12px;padding:6px 9px;border-radius:8px;background:#fffef0ec;border:1px solid #fecaca;color:#991b1b;font:600 11px system-ui;white-space:pre-line';
    this.legend.setAttribute('role', 'status');
    this.root.append(this.svg, this.legend);
    host.append(this.root);
    // Không còn setInterval 80 ms: chỉ vẽ khi camera/khung nhìn/dữ liệu đổi, dừng khi lớp ẩn.
    this.redraw = new OverlayRedraw(camera, host, () => this.draw());
  }
  update(config: FacilityAssetLayerConfig | null) {
    this.config = config;
    this.root.style.display = config?.assets.length ? 'block' : 'none';
    if (config?.assets.length) this.redraw.start();
    else this.redraw.stop();
    const ids = new Set(config?.assets.map((asset) => asset.assetId));
    for (const [id, node] of this.nodes)
      if (!ids.has(id)) {
        node.button.remove();
        node.line.remove();
        node.dot.remove();
        this.nodes.delete(id);
      }
    for (const asset of config?.assets ?? []) {
      let node = this.nodes.get(asset.assetId);
      if (!node) {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText =
          'position:absolute;display:none;pointer-events:auto;width:210px;height:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;padding:3px 8px;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:6px;background:#fff7f5f5;color:#991b1b;font:600 11px system-ui;box-shadow:0 1px 5px #0002;cursor:pointer';
        const name = document.createElement('span');
        button.append(name);
        for (const type of ['pointerdown', 'pointerup', 'dblclick'])
          button.addEventListener(type, (event) => event.stopPropagation());
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          this.config?.onSelect(asset.assetId);
        });
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', '#dc2626');
        line.setAttribute('stroke-opacity', '0.6');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '4');
        dot.setAttribute('stroke', 'white');
        dot.setAttribute('stroke-width', '1.5');
        this.svg.append(line, dot);
        this.root.append(button);
        node = { button, name, line, dot, key: '', point: null };
        this.nodes.set(asset.assetId, node);
      }
      node.name.textContent = asset.name.replace(/^\[DEMO(?: BIM456)?\]\s*/i, '');
      node.button.title = `${asset.code} · ${asset.name}\n${asset.location}\nBấm để xem thông tin và lịch bảo trì`;
      node.button.setAttribute('aria-label', `Xem thiết bị ${asset.code} · ${asset.name}`);
      node.button.style.borderLeftColor = asset.color;
      node.dot.setAttribute('fill', asset.color);
      const version = this.modelKey(asset.modelId);
      const key = version ? `${asset.modelId}:${version}:${asset.guid}` : '';
      if (node.key !== key || (!node.point && key && !this.cache.has(key))) {
        node.key = key;
        node.point = null;
        if (!key) continue;
        let pending = this.cache.get(key);
        if (!pending) {
          pending = this.resolve(asset.modelId, asset.guid).catch(() => null);
          this.cache.set(key, pending);
        }
        const current = node;
        void pending.then((point) => {
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
    const visible: { node: Node; x: number; y: number }[] = [];
    let mapped = 0;
    for (const asset of config.assets) {
      const node = this.nodes.get(asset.assetId);
      if (!node) continue;
      node.button.style.display = 'none';
      node.line.style.display = 'none';
      node.dot.style.display = 'none';
      if (!node.point) continue;
      mapped++;
      const p = this.projected.copy(node.point).project(camera);
      const x = ((p.x + 1) * width) / 2,
        y = ((1 - p.y) * height) / 2;
      if (p.z < -1 || p.z > 1 || x < 0 || x > width || y < 0 || y > height) continue;
      node.dot.style.display = 'block';
      node.dot.setAttribute('cx', String(x));
      node.dot.setAttribute('cy', String(y));
      visible.push({ node, x, y });
    }
    const leftNodes = new Set(
      [...visible]
        .sort((a, b) => a.x - b.x)
        .slice(0, Math.ceil(visible.length / 2))
        .map((item) => item.node),
    );
    for (const left of [true, false]) {
      const column = visible.filter((item) => leftNodes.has(item.node) === left).sort((a, b) => a.y - b.y);
      const top = 108,
        bottom = Math.max(top, height - 82);
      const gap = Math.min(29, (bottom - top) / Math.max(1, column.length - 1));
      const labelWidth = Math.min(210, Math.max(100, width * 0.32));
      let lastY = top - gap;
      column.forEach((item, index) => {
        const y = Math.max(lastY + gap, Math.min(item.y - 13, bottom - (column.length - 1 - index) * gap));
        lastY = y;
        const x = left ? 12 : width - labelWidth - 12;
        item.node.button.style.display = config.showLabels ? 'block' : 'none';
        item.node.button.style.width = `${labelWidth}px`;
        item.node.button.style.left = `${x}px`;
        item.node.button.style.top = `${y}px`;
        item.node.line.style.display = config.showLabels ? 'block' : 'none';
        item.node.line.setAttribute('x1', String(item.x));
        item.node.line.setAttribute('y1', String(item.y));
        item.node.line.setAttribute('x2', String(left ? x + labelWidth : x));
        item.node.line.setAttribute('y2', String(y + 13));
      });
    }
    const legend = `Thiết bị hỏng · ${visible.length}/${config.assets.length} trong khung nhìn · ${mapped} đã định vị\nĐỏ: hỏng, chờ sửa · Bấm nhãn để xem hồ sơ và bảo trì`;
    if (this.legend.textContent !== legend) this.legend.textContent = legend;
  }
  dispose() {
    this.alive = false;
    this.redraw.stop();
    this.root.remove();
    this.nodes.clear();
    this.cache.clear();
  }
}
