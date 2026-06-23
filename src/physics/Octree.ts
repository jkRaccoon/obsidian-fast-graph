// 노드를 8분 트리에 넣고 각 셀의 질량중심으로 척력을 근사한다(Barnes-Hut).
// 핫 루프 GC 압박 제거를 위해 Cell JS 객체 대신 typed array 풀을 사용한다.

// 셀당 저장 레이아웃 (Float32Array, FLOAT_STRIDE floats per cell):
//   0: cx, 1: cy, 2: cz, 3: half
//   4: mass, 5: comx, 6: comy, 7: comz
// 셀당 저장 레이아웃 (Int32Array, INT_STRIDE ints per cell):
//   0: body  (-1 = 없음/내부 노드)
//   1..8: children[0..7] (-1 = null)

const FLOAT_STRIDE = 8; // cx cy cz half mass comx comy comz
const INT_STRIDE = 9;   // body + 8 children

// 최대 셀 수: 노드당 최악 8*(N-1)+1 ≈ 8N, 넉넉하게 16N 으로 예약
const CAPACITY_FACTOR = 16;

export class Octree {
  private floats: Float32Array;
  private ints: Int32Array;
  private capacity: number;
  private size: number = 0;  // 현재 사용 중인 셀 수

  private pos!: Float32Array;
  private count: number = 0;

  // 재귀 없이 accumulate 에서 쓸 스택 (셀 인덱스)
  private stack: Int32Array;

  constructor(maxNodes: number) {
    this.capacity = Math.max(maxNodes * CAPACITY_FACTOR, 64);
    this.floats = new Float32Array(this.capacity * FLOAT_STRIDE);
    this.ints = new Int32Array(this.capacity * INT_STRIDE);
    this.stack = new Int32Array(this.capacity);
  }

  // tick 시작마다 호출: 트리를 초기화하고 모든 노드를 삽입
  rebuild(positions: Float32Array, count: number): void {
    this.pos = positions;
    this.count = count;
    this.size = 0;

    if (count === 0) return;

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

    const root = this.allocCell(center, center, center, half);
    for (let i = 0; i < count; i++) this.insert(root, i);
  }

  private allocCell(cx: number, cy: number, cz: number, half: number): number {
    const idx = this.size;
    if (idx >= this.capacity) {
      // 용량 초과 시 확장 (드문 경우)
      this.grow();
    }
    this.size++;
    const fi = idx * FLOAT_STRIDE;
    this.floats[fi + 0] = cx;
    this.floats[fi + 1] = cy;
    this.floats[fi + 2] = cz;
    this.floats[fi + 3] = half;
    this.floats[fi + 4] = 0;  // mass
    this.floats[fi + 5] = 0;  // comx
    this.floats[fi + 6] = 0;  // comy
    this.floats[fi + 7] = 0;  // comz
    const ii = idx * INT_STRIDE;
    this.ints[ii + 0] = -1;   // body
    for (let k = 1; k <= 8; k++) this.ints[ii + k] = -1; // children
    return idx;
  }

  private grow(): void {
    const newCap = this.capacity * 2;
    const newFloats = new Float32Array(newCap * FLOAT_STRIDE);
    newFloats.set(this.floats);
    const newInts = new Int32Array(newCap * INT_STRIDE);
    newInts.set(this.ints);
    const newStack = new Int32Array(newCap);
    newStack.set(this.stack);
    this.floats = newFloats;
    this.ints = newInts;
    this.stack = newStack;
    this.capacity = newCap;
  }

  private octant(cellIdx: number, x: number, y: number, z: number): number {
    const fi = cellIdx * FLOAT_STRIDE;
    return (x >= this.floats[fi + 0] ? 1 : 0)
         | (y >= this.floats[fi + 1] ? 2 : 0)
         | (z >= this.floats[fi + 2] ? 4 : 0);
  }

  private childCell(parentIdx: number, oct: number): number {
    const fi = parentIdx * FLOAT_STRIDE;
    const h = this.floats[fi + 3] / 2;
    const cx = this.floats[fi + 0] + (oct & 1 ? h : -h);
    const cy = this.floats[fi + 1] + (oct & 2 ? h : -h);
    const cz = this.floats[fi + 2] + (oct & 4 ? h : -h);
    return this.allocCell(cx, cy, cz, h);
  }

  private insert(cellIdx: number, body: number): void {
    const x = this.pos[body * 3], y = this.pos[body * 3 + 1], z = this.pos[body * 3 + 2];
    const fi = cellIdx * FLOAT_STRIDE;
    const ii = cellIdx * INT_STRIDE;

    this.floats[fi + 4] += 1;   // mass++
    this.floats[fi + 5] += x;   // comx
    this.floats[fi + 6] += y;   // comy
    this.floats[fi + 7] += z;   // comz

    const currentBody = this.ints[ii + 0];
    const hasChildren = this.ints[ii + 1] !== -1 || this.ints[ii + 2] !== -1
                     || this.ints[ii + 3] !== -1 || this.ints[ii + 4] !== -1
                     || this.ints[ii + 5] !== -1 || this.ints[ii + 6] !== -1
                     || this.ints[ii + 7] !== -1 || this.ints[ii + 8] !== -1;

    if (currentBody === -1 && !hasChildren) {
      // 빈 리프 셀
      this.ints[ii + 0] = body;
      return;
    }
    if (!hasChildren) {
      // 단일 노드 셀 → 분할
      const existing = currentBody;
      this.ints[ii + 0] = -1;
      this.placeInChild(cellIdx, existing);
    }
    if (this.floats[fi + 3] < 1e-4) return; // 과분할 방지
    this.placeInChild(cellIdx, body);
  }

  private placeInChild(cellIdx: number, body: number): void {
    const x = this.pos[body * 3], y = this.pos[body * 3 + 1], z = this.pos[body * 3 + 2];
    const oct = this.octant(cellIdx, x, y, z);
    const ii = cellIdx * INT_STRIDE;
    let childIdx = this.ints[ii + 1 + oct];
    if (childIdx === -1) {
      childIdx = this.childCell(cellIdx, oct);
      // childCell 은 alloc 하므로 cellIdx 의 메모리가 이동하지 않음 (typed array는 고정)
      // 단, grow() 호출 시 this.ints 참조가 바뀌므로 ii 재계산 필요
      const ii2 = cellIdx * INT_STRIDE;
      this.ints[ii2 + 1 + oct] = childIdx;
    }
    this.insert(childIdx, body);
  }

  computeForce(i: number, theta: number, repulsion: number, out: Float32Array): void {
    out[0] = 0; out[1] = 0; out[2] = 0;
    if (this.size === 0) return;
    this.accumulateIterative(0, i, theta, repulsion, out);
  }

  private accumulateIterative(root: number, i: number, theta: number, repulsion: number, out: Float32Array): void {
    const px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2];
    let top = 0;
    this.stack[top++] = root;

    while (top > 0) {
      const cellIdx = this.stack[--top];
      const fi = cellIdx * FLOAT_STRIDE;
      const ii = cellIdx * INT_STRIDE;

      const mass = this.floats[fi + 4];
      if (mass === 0) continue;

      const body = this.ints[ii + 0];
      if (body === i && mass === 1) continue; // 자기 자신

      const mx = this.floats[fi + 5] / mass;
      const my = this.floats[fi + 6] / mass;
      const mz = this.floats[fi + 7] / mass;
      let dx = px - mx, dy = py - my, dz = pz - mz;
      let dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 < 1e-6) { dx = 1e-3; dy = 0; dz = 0; dist2 = 1e-6; }
      const dist = Math.sqrt(dist2);

      const half = this.floats[fi + 3];
      const isLeaf = this.ints[ii + 1] === -1 && this.ints[ii + 2] === -1
                  && this.ints[ii + 3] === -1 && this.ints[ii + 4] === -1
                  && this.ints[ii + 5] === -1 && this.ints[ii + 6] === -1
                  && this.ints[ii + 7] === -1 && this.ints[ii + 8] === -1;

      if (isLeaf || (half * 2) / dist < theta) {
        const f = (repulsion * mass) / dist2;
        out[0] += (dx / dist) * f;
        out[1] += (dy / dist) * f;
        out[2] += (dz / dist) * f;
      } else {
        // 자식 셀을 스택에 추가
        for (let k = 1; k <= 8; k++) {
          const childIdx = this.ints[ii + k];
          if (childIdx !== -1) {
            if (top >= this.stack.length) {
              // 스택 확장 (드문 경우)
              const newStack = new Int32Array(this.stack.length * 2);
              newStack.set(this.stack);
              this.stack = newStack;
            }
            this.stack[top++] = childIdx;
          }
        }
      }
    }
  }
}
