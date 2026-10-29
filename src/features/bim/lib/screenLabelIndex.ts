/** Spatial buckets for label placement. At most nine neighboring cells are examined per candidate. */
export class ScreenLabelIndex {
  private cells = new Map<string, { x: number; y: number }[]>();
  constructor(private readonly spacing = 23) {}
  clear() {
    this.cells.clear();
  }
  overlaps(x: number, y: number): boolean {
    const cx = Math.floor(x / this.spacing),
      cy = Math.floor(y / this.spacing);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const point of this.cells.get(`${cx + dx}:${cy + dy}`) ?? [])
          if (Math.hypot(point.x - x, point.y - y) < this.spacing) return true;
      }
    return false;
  }
  add(x: number, y: number) {
    const key = `${Math.floor(x / this.spacing)}:${Math.floor(y / this.spacing)}`;
    const cell = this.cells.get(key);
    if (cell) cell.push({ x, y });
    else this.cells.set(key, [{ x, y }]);
  }
}
