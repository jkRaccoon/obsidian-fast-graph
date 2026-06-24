// assembly/physics.ts — Barnes-Hut 물리 (JS PhysicsEngine/Octree의 AssemblyScript 포팅)

const FLOAT_STRIDE: i32 = 8;   // cx cy cz half mass comx comy comz
const INT_STRIDE: i32 = 9;     // body + children[0..7]
const CAPACITY_FACTOR: i32 = 16;
const ALPHA_DECAY: f64 = 0.0228;

// 노드 버퍼
let count: i32 = 0;
let edgeCount: i32 = 0;
let numGroups: i32 = 0;
let positions: Float32Array = new Float32Array(0);
let velocities: Float32Array = new Float32Array(0);
let edges: Int32Array = new Int32Array(0);
let groupId: Uint16Array = new Uint16Array(0);
let force: Float32Array = new Float32Array(0);
let pinned: Uint8Array = new Uint8Array(0);

// 그룹 힘 스크래치
let gSum: Float32Array = new Float32Array(0);
let gCount: Float32Array = new Float32Array(0);
let gCen: Float32Array = new Float32Array(0);
let gSep: Float32Array = new Float32Array(0);

// octree 풀
let oFloats: Float32Array = new Float32Array(0);
let oInts: Int32Array = new Int32Array(0);
let oStack: Int32Array = new Int32Array(0);
let oCapacity: i32 = 0;
let oSize: i32 = 0;

// 파라미터
let pRep: f64 = 0, pLs: f64 = 0, pLd: f64 = 0, pGrav: f64 = 0, pDamp: f64 = 0, pTheta: f64 = 0, pGc: f64 = 0, pGs: f64 = 0;
let alpha: f64 = 1.0;

export function allocate(c: i32, ec: i32, ng: i32): void {
  count = c; edgeCount = ec; numGroups = ng;
  positions = new Float32Array(c * 3);
  velocities = new Float32Array(c * 3);
  edges = new Int32Array(ec * 2);
  groupId = new Uint16Array(c);
  force = new Float32Array(c * 3);
  pinned = new Uint8Array(c);
  gSum = new Float32Array(ng * 3);
  gCount = new Float32Array(ng);
  gCen = new Float32Array(ng * 3);
  gSep = new Float32Array(ng * 3);
  oCapacity = <i32>Math.max(<f64>(c * CAPACITY_FACTOR), 64.0);
  oFloats = new Float32Array(oCapacity * FLOAT_STRIDE);
  oInts = new Int32Array(oCapacity * INT_STRIDE);
  oStack = new Int32Array(oCapacity);
}

export function positionsPtr(): usize { return positions.dataStart; }
export function velocitiesPtr(): usize { return velocities.dataStart; }
export function edgesPtr(): usize { return edges.dataStart; }
export function groupIdPtr(): usize { return groupId.dataStart; }

export function setParams(rep: f64, ls: f64, ld: f64, grav: f64, damp: f64, th: f64, gc: f64, gs: f64): void {
  pRep = rep; pLs = ls; pLd = ld; pGrav = grav; pDamp = damp; pTheta = th; pGc = gc; pGs = gs;
}
export function setAlpha(a: f64): void { alpha = a; }
export function getAlpha(): f64 { return alpha; }
export function reheat(): void { alpha = 1.0; }

export function pin(i: i32, x: f32, y: f32, z: f32): void {
  pinned[i] = 1;
  positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
  velocities[i * 3] = 0; velocities[i * 3 + 1] = 0; velocities[i * 3 + 2] = 0;
}
export function unpin(i: i32): void { pinned[i] = 0; }

// ---- Octree ----
function growTree(): void {
  const nc = oCapacity * 2;
  const nf = new Float32Array(nc * FLOAT_STRIDE); nf.set(oFloats);
  const ni = new Int32Array(nc * INT_STRIDE); ni.set(oInts);
  const ns = new Int32Array(nc); ns.set(oStack);
  oFloats = nf; oInts = ni; oStack = ns; oCapacity = nc;
}

function allocCell(cx: f64, cy: f64, cz: f64, half: f64): i32 {
  const idx = oSize;
  if (idx >= oCapacity) growTree();
  oSize++;
  const fi = idx * FLOAT_STRIDE;
  oFloats[fi + 0] = <f32>cx; oFloats[fi + 1] = <f32>cy; oFloats[fi + 2] = <f32>cz; oFloats[fi + 3] = <f32>half;
  oFloats[fi + 4] = 0; oFloats[fi + 5] = 0; oFloats[fi + 6] = 0; oFloats[fi + 7] = 0;
  const ii = idx * INT_STRIDE;
  oInts[ii + 0] = -1;
  for (let k = 1; k <= 8; k++) oInts[ii + k] = -1;
  return idx;
}

function octant(cellIdx: i32, x: f64, y: f64, z: f64): i32 {
  const fi = cellIdx * FLOAT_STRIDE;
  return (x >= <f64>oFloats[fi + 0] ? 1 : 0) | (y >= <f64>oFloats[fi + 1] ? 2 : 0) | (z >= <f64>oFloats[fi + 2] ? 4 : 0);
}

function childCell(parentIdx: i32, oct: i32): i32 {
  const fi = parentIdx * FLOAT_STRIDE;
  const h = <f64>oFloats[fi + 3] / 2.0;
  const cx = <f64>oFloats[fi + 0] + ((oct & 1) != 0 ? h : -h);
  const cy = <f64>oFloats[fi + 1] + ((oct & 2) != 0 ? h : -h);
  const cz = <f64>oFloats[fi + 2] + ((oct & 4) != 0 ? h : -h);
  return allocCell(cx, cy, cz, h);
}

function placeInChild(cellIdx: i32, body: i32): void {
  const x = <f64>positions[body * 3], y = <f64>positions[body * 3 + 1], z = <f64>positions[body * 3 + 2];
  const oct = octant(cellIdx, x, y, z);
  const ii = cellIdx * INT_STRIDE;
  let childIdx = oInts[ii + 1 + oct];
  if (childIdx === -1) {
    childIdx = childCell(cellIdx, oct);
    oInts[cellIdx * INT_STRIDE + 1 + oct] = childIdx; // grow() 후 참조 대비 재계산
  }
  insertBody(childIdx, body);
}

function insertBody(cellIdx: i32, body: i32): void {
  const x = <f64>positions[body * 3], y = <f64>positions[body * 3 + 1], z = <f64>positions[body * 3 + 2];
  const fi = cellIdx * FLOAT_STRIDE;
  const ii = cellIdx * INT_STRIDE;
  oFloats[fi + 4] = <f32>(<f64>oFloats[fi + 4] + 1.0);
  oFloats[fi + 5] = <f32>(<f64>oFloats[fi + 5] + x);
  oFloats[fi + 6] = <f32>(<f64>oFloats[fi + 6] + y);
  oFloats[fi + 7] = <f32>(<f64>oFloats[fi + 7] + z);
  const currentBody = oInts[ii + 0];
  const hasChildren = oInts[ii + 1] !== -1 || oInts[ii + 2] !== -1 || oInts[ii + 3] !== -1 || oInts[ii + 4] !== -1
    || oInts[ii + 5] !== -1 || oInts[ii + 6] !== -1 || oInts[ii + 7] !== -1 || oInts[ii + 8] !== -1;
  if (currentBody === -1 && !hasChildren) { oInts[ii + 0] = body; return; }
  if (!hasChildren) { const existing = currentBody; oInts[ii + 0] = -1; placeInChild(cellIdx, existing); }
  if (<f64>oFloats[fi + 3] < 1e-4) return;
  placeInChild(cellIdx, body);
}

function rebuildTree(): void {
  oSize = 0;
  if (count === 0) return;
  let mn: f64 = Infinity, mx: f64 = -Infinity;
  for (let i = 0; i < count * 3; i++) { const v = <f64>positions[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!isFinite(mn)) { mn = -1.0; mx = 1.0; }
  const center = (mn + mx) / 2.0;
  const half = Math.max((mx - mn) / 2.0, 1e-3) + 1e-3;
  const root = allocCell(center, center, center, half);
  for (let i = 0; i < count; i++) insertBody(root, i);
}

// computeForce 결과(전역으로 반환 — 핫 루프 할당 회피)
let outX: f64 = 0, outY: f64 = 0, outZ: f64 = 0;
function computeForce(i: i32, theta: f64, repulsion: f64): void {
  outX = 0; outY = 0; outZ = 0;
  if (oSize === 0) return;
  const px = <f64>positions[i * 3], py = <f64>positions[i * 3 + 1], pz = <f64>positions[i * 3 + 2];
  let top = 0;
  oStack[top++] = 0;
  while (top > 0) {
    const cellIdx = oStack[--top];
    const fi = cellIdx * FLOAT_STRIDE;
    const ii = cellIdx * INT_STRIDE;
    const mass = <f64>oFloats[fi + 4];
    if (mass === 0) continue;
    const body = oInts[ii + 0];
    if (body === i && mass === 1.0) continue;
    const cmx = <f64>oFloats[fi + 5] / mass, cmy = <f64>oFloats[fi + 6] / mass, cmz = <f64>oFloats[fi + 7] / mass;
    let dx = px - cmx, dy = py - cmy, dz = pz - cmz;
    let dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 < 1e-6) { dx = 1e-3; dy = 0; dz = 0; dist2 = 1e-6; }
    const dist = Math.sqrt(dist2);
    const half = <f64>oFloats[fi + 3];
    const isLeaf = oInts[ii + 1] === -1 && oInts[ii + 2] === -1 && oInts[ii + 3] === -1 && oInts[ii + 4] === -1
      && oInts[ii + 5] === -1 && oInts[ii + 6] === -1 && oInts[ii + 7] === -1 && oInts[ii + 8] === -1;
    if (isLeaf || (half * 2.0) / dist < theta) {
      const fmag = (repulsion * mass) / dist2;
      outX += (dx / dist) * fmag; outY += (dy / dist) * fmag; outZ += (dz / dist) * fmag;
    } else {
      for (let k = 1; k <= 8; k++) {
        const ci = oInts[ii + k];
        if (ci !== -1) {
          if (top >= oStack.length) { const ns = new Int32Array(oStack.length * 2); ns.set(oStack); oStack = ns; }
          oStack[top++] = ci;
        }
      }
    }
  }
}

export function tick(): f64 {
  const f = force;
  for (let i = 0; i < count * 3; i++) f[i] = 0;

  // 1) 척력 (Barnes-Hut) — JS와 동일하게 매 tick rebuild + 전 노드 computeForce
  rebuildTree();
  for (let i = 0; i < count; i++) {
    computeForce(i, pTheta, pRep);
    f[i * 3] = <f32>(<f64>f[i * 3] + outX);
    f[i * 3 + 1] = <f32>(<f64>f[i * 3 + 1] + outY);
    f[i * 3 + 2] = <f32>(<f64>f[i * 3 + 2] + outZ);
  }

  // 2) 인력 (spring)
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1];
    let dx = <f64>positions[b * 3] - <f64>positions[a * 3];
    let dy = <f64>positions[b * 3 + 1] - <f64>positions[a * 3 + 1];
    let dz = <f64>positions[b * 3 + 2] - <f64>positions[a * 3 + 2];
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d === 0) d = 1e-3;
    const k = pLs * (d - pLd) / d;
    const fx = dx * k, fy = dy * k, fz = dz * k;
    f[a * 3] = <f32>(<f64>f[a * 3] + fx); f[a * 3 + 1] = <f32>(<f64>f[a * 3 + 1] + fy); f[a * 3 + 2] = <f32>(<f64>f[a * 3 + 2] + fz);
    f[b * 3] = <f32>(<f64>f[b * 3] - fx); f[b * 3 + 1] = <f32>(<f64>f[b * 3 + 1] - fy); f[b * 3 + 2] = <f32>(<f64>f[b * 3 + 2] - fz);
  }

  // 2.5) 그룹 힘
  const doCohesion = pGc > 0;
  const doSeparation = pGs > 0 && numGroups > 1;
  if (doCohesion || doSeparation) {
    const G = numGroups;
    for (let i = 0; i < G * 3; i++) gSum[i] = 0;
    for (let i = 0; i < G; i++) gCount[i] = 0;
    for (let i = 0; i < count; i++) {
      const g = <i32>groupId[i];
      gSum[g * 3] = <f32>(<f64>gSum[g * 3] + <f64>positions[i * 3]);
      gSum[g * 3 + 1] = <f32>(<f64>gSum[g * 3 + 1] + <f64>positions[i * 3 + 1]);
      gSum[g * 3 + 2] = <f32>(<f64>gSum[g * 3 + 2] + <f64>positions[i * 3 + 2]);
      gCount[g] = <f32>(<f64>gCount[g] + 1.0);
    }
    for (let g = 0; g < G; g++) {
      const c = <f64>gCount[g] !== 0 ? <f64>gCount[g] : 1.0;
      gCen[g * 3] = <f32>(<f64>gSum[g * 3] / c);
      gCen[g * 3 + 1] = <f32>(<f64>gSum[g * 3 + 1] / c);
      gCen[g * 3 + 2] = <f32>(<f64>gSum[g * 3 + 2] / c);
    }
    if (doSeparation) {
      for (let i = 0; i < G * 3; i++) gSep[i] = 0;
      for (let g = 0; g < G; g++) {
        if (<f64>gCount[g] === 0) continue;
        for (let h = 0; h < G; h++) {
          if (h === g || <f64>gCount[h] === 0) continue;
          let dx = <f64>gCen[g * 3] - <f64>gCen[h * 3];
          let dy = <f64>gCen[g * 3 + 1] - <f64>gCen[h * 3 + 1];
          let dz = <f64>gCen[g * 3 + 2] - <f64>gCen[h * 3 + 2];
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 1e-3) { dx = <f64>(g - h); dy = 0; dz = 0; d2 = <f64>((g - h) * (g - h)); if (d2 === 0) d2 = 1e-3; }
          const dd = Math.sqrt(d2);
          const fmag = (pGs * <f64>gCount[h]) / d2;
          gSep[g * 3] = <f32>(<f64>gSep[g * 3] + (dx / dd) * fmag);
          gSep[g * 3 + 1] = <f32>(<f64>gSep[g * 3 + 1] + (dy / dd) * fmag);
          gSep[g * 3 + 2] = <f32>(<f64>gSep[g * 3 + 2] + (dz / dd) * fmag);
        }
      }
    }
    for (let i = 0; i < count; i++) {
      const g = <i32>groupId[i];
      if (doCohesion) {
        f[i * 3] = <f32>(<f64>f[i * 3] + (<f64>gCen[g * 3] - <f64>positions[i * 3]) * pGc);
        f[i * 3 + 1] = <f32>(<f64>f[i * 3 + 1] + (<f64>gCen[g * 3 + 1] - <f64>positions[i * 3 + 1]) * pGc);
        f[i * 3 + 2] = <f32>(<f64>f[i * 3 + 2] + (<f64>gCen[g * 3 + 2] - <f64>positions[i * 3 + 2]) * pGc);
      }
      if (doSeparation) {
        f[i * 3] = <f32>(<f64>f[i * 3] + <f64>gSep[g * 3]);
        f[i * 3 + 1] = <f32>(<f64>f[i * 3 + 1] + <f64>gSep[g * 3 + 1]);
        f[i * 3 + 2] = <f32>(<f64>f[i * 3 + 2] + <f64>gSep[g * 3 + 2]);
      }
    }
  }

  // 3) 중심화(gravity) + 적분 + 변위 클램프
  // JS와 동일하게 중력을 f[]에 먼저 저장(f32 절단)한 후 적분
  const maxStep = pLd;
  const maxStep2 = maxStep * maxStep;
  for (let i = 0; i < count; i++) {
    if (pinned[i] != 0) continue;
    const ix = i * 3, iy = ix + 1, iz = ix + 2;
    // gravity를 force 배열에 저장(f32 절단) — JS의 f[ix] -= pos*gravity 와 동일
    f[ix] = <f32>(<f64>f[ix] - <f64>positions[ix] * pGrav);
    f[iy] = <f32>(<f64>f[iy] - <f64>positions[iy] * pGrav);
    f[iz] = <f32>(<f64>f[iz] - <f64>positions[iz] * pGrav);
    let vx = (<f64>velocities[ix] + <f64>f[ix] * alpha) * pDamp;
    let vy = (<f64>velocities[iy] + <f64>f[iy] * alpha) * pDamp;
    let vz = (<f64>velocities[iz] + <f64>f[iz] * alpha) * pDamp;
    const sp2 = vx * vx + vy * vy + vz * vz;
    if (sp2 > maxStep2) {
      const scale = maxStep / Math.sqrt(sp2);
      vx *= scale; vy *= scale; vz *= scale;
    }
    velocities[ix] = <f32>vx; velocities[iy] = <f32>vy; velocities[iz] = <f32>vz;
    positions[ix] = <f32>(<f64>positions[ix] + vx);
    positions[iy] = <f32>(<f64>positions[iy] + vy);
    positions[iz] = <f32>(<f64>positions[iz] + vz);
  }

  alpha += (0.0 - alpha) * ALPHA_DECAY;
  return alpha;
}
