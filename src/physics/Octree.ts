// 노드를 8분 트리에 넣고 각 셀의 질량중심으로 척력을 근사한다(Barnes-Hut).
interface Cell {
  cx: number; cy: number; cz: number;   // 셀 중심
  half: number;                          // 셀 반변(half size)
  mass: number;                          // 누적 질량(노드 수)
  comx: number; comy: number; comz: number; // 질량중심 누적합
  body: number;                          // 단일 노드 인덱스(-1이면 없음/내부 노드)
  children: (Cell | null)[] | null;      // 8개
}

export class Octree {
  private root: Cell;
  private pos: Float32Array;

  constructor(positions: Float32Array, count: number) {
    this.pos = positions;
    // 경계 박스 계산
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < count * 3; i++) {
      const v = positions[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!isFinite(min)) { min = -1; max = 1; }
    const center = (min + max) / 2;
    const half = Math.max((max - min) / 2, 1e-3) + 1e-3;
    this.root = this.makeCell(center, center, center, half);
    for (let i = 0; i < count; i++) this.insert(this.root, i);
  }

  private makeCell(cx: number, cy: number, cz: number, half: number): Cell {
    return { cx, cy, cz, half, mass: 0, comx: 0, comy: 0, comz: 0, body: -1, children: null };
  }

  private octant(cell: Cell, x: number, y: number, z: number): number {
    return (x >= cell.cx ? 1 : 0) | (y >= cell.cy ? 2 : 0) | (z >= cell.cz ? 4 : 0);
  }

  private childCell(cell: Cell, oct: number): Cell {
    const h = cell.half / 2;
    const cx = cell.cx + (oct & 1 ? h : -h);
    const cy = cell.cy + (oct & 2 ? h : -h);
    const cz = cell.cz + (oct & 4 ? h : -h);
    return this.makeCell(cx, cy, cz, h);
  }

  private insert(cell: Cell, body: number): void {
    const x = this.pos[body * 3], y = this.pos[body * 3 + 1], z = this.pos[body * 3 + 2];
    cell.mass++;
    cell.comx += x; cell.comy += y; cell.comz += z;

    if (cell.body === -1 && cell.children === null) {
      cell.body = body;
      return;
    }
    if (cell.children === null) {
      // 단일 노드 셀을 분할
      cell.children = [null, null, null, null, null, null, null, null];
      const existing = cell.body;
      cell.body = -1;
      this.placeInChild(cell, existing);
    }
    if (cell.half < 1e-4) return; // 과분할 방지(동일 좌표)
    this.placeInChild(cell, body);
  }

  private placeInChild(cell: Cell, body: number): void {
    const x = this.pos[body * 3], y = this.pos[body * 3 + 1], z = this.pos[body * 3 + 2];
    const oct = this.octant(cell, x, y, z);
    let child = cell.children![oct];
    if (child === null) {
      child = this.childCell(cell, oct);
      cell.children![oct] = child;
    }
    this.insert(child, body);
  }

  computeForce(i: number, theta: number, repulsion: number, out: Float32Array): void {
    out[0] = 0; out[1] = 0; out[2] = 0;
    this.accumulate(this.root, i, theta, repulsion, out);
  }

  private accumulate(cell: Cell, i: number, theta: number, repulsion: number, out: Float32Array): void {
    if (cell.mass === 0) return;
    if (cell.body === i && cell.mass === 1) return; // 자기 자신

    const px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2];
    const mx = cell.comx / cell.mass, my = cell.comy / cell.mass, mz = cell.comz / cell.mass;
    let dx = px - mx, dy = py - my, dz = pz - mz;
    let dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 < 1e-6) { dx = 1e-3; dy = 0; dz = 0; dist2 = 1e-6; }
    const dist = Math.sqrt(dist2);

    const isLeaf = cell.children === null;
    if (isLeaf || (cell.half * 2) / dist < theta) {
      // 셀을 하나의 질량으로 근사: F = repulsion * mass / dist^2, 방향 (dx,dy,dz)/dist
      const f = (repulsion * cell.mass) / dist2;
      out[0] += (dx / dist) * f;
      out[1] += (dy / dist) * f;
      out[2] += (dz / dist) * f;
      return;
    }
    for (const c of cell.children!) {
      if (c) this.accumulate(c, i, theta, repulsion, out);
    }
  }
}
