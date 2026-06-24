// assembly/physics.ts — Barnes-Hut 물리 (raw linear-memory 버전)
// 모든 내부 버퍼 접근을 load<T>/store<T>로 교체하여 managed 배열 오버헤드 제거

const FLOAT_STRIDE: i32 = 8;   // cx cy cz half mass comx comy comz
const INT_STRIDE: i32 = 9;     // body + children[0..7]
const CAPACITY_FACTOR: i32 = 16;
const ALPHA_DECAY: f64 = 0.0228;

// 카운트/크기
let count: i32 = 0;
let edgeCount: i32 = 0;
let numGroups: i32 = 0;

// raw 포인터 — heap.alloc()이 반환하는 usize
let posPtr: usize = 0;
let velPtr: usize = 0;
let edgePtr: usize = 0;
let groupPtr: usize = 0;
let forcePtr: usize = 0;
let pinnedPtr: usize = 0;

// 그룹 힘 스크래치
let gSumPtr: usize = 0;
let gCountPtr: usize = 0;
let gCenPtr: usize = 0;
let gSepPtr: usize = 0;

// octree 풀
let oFloatsPtr: usize = 0;
let oIntsPtr: usize = 0;
let oStackPtr: usize = 0;
let oCapacity: i32 = 0;
let oSize: i32 = 0;

// 파라미터
let pRep: f64 = 0, pLs: f64 = 0, pLd: f64 = 0, pGrav: f64 = 0, pDamp: f64 = 0, pTheta: f64 = 0, pGc: f64 = 0, pGs: f64 = 0;
let alpha: f64 = 1.0;

// ----- 인라인 접근자 헬퍼 (인라인 상수 전개를 위해 매크로 대신 함수 사용) -----
// f32 버퍼: offset = i << 2
// i32 버퍼: offset = i << 2
// u16 버퍼: offset = i << 1
// u8  버퍼: offset = i

// positions (f32, stride 3)
@inline function posX(i: i32): f64 { return <f64>load<f32>(posPtr + (<usize>(i * 3) << 2)); }
@inline function posY(i: i32): f64 { return <f64>load<f32>(posPtr + (<usize>(i * 3 + 1) << 2)); }
@inline function posZ(i: i32): f64 { return <f64>load<f32>(posPtr + (<usize>(i * 3 + 2) << 2)); }
@inline function storePosX(i: i32, v: f32): void { store<f32>(posPtr + (<usize>(i * 3) << 2), v); }
@inline function storePosY(i: i32, v: f32): void { store<f32>(posPtr + (<usize>(i * 3 + 1) << 2), v); }
@inline function storePosZ(i: i32, v: f32): void { store<f32>(posPtr + (<usize>(i * 3 + 2) << 2), v); }

// velocities (f32, stride 3)
@inline function velX(i: i32): f64 { return <f64>load<f32>(velPtr + (<usize>(i * 3) << 2)); }
@inline function velY(i: i32): f64 { return <f64>load<f32>(velPtr + (<usize>(i * 3 + 1) << 2)); }
@inline function velZ(i: i32): f64 { return <f64>load<f32>(velPtr + (<usize>(i * 3 + 2) << 2)); }
@inline function storeVelX(i: i32, v: f32): void { store<f32>(velPtr + (<usize>(i * 3) << 2), v); }
@inline function storeVelY(i: i32, v: f32): void { store<f32>(velPtr + (<usize>(i * 3 + 1) << 2), v); }
@inline function storeVelZ(i: i32, v: f32): void { store<f32>(velPtr + (<usize>(i * 3 + 2) << 2), v); }

// force (f32, stride 3)
@inline function frcAt(idx: i32): f64 { return <f64>load<f32>(forcePtr + (<usize>idx << 2)); }
@inline function storeFrc(idx: i32, v: f32): void { store<f32>(forcePtr + (<usize>idx << 2), v); }

// edges (i32, stride 2*edgeCount elements stored as pairs)
@inline function edgeA(e: i32): i32 { return load<i32>(edgePtr + (<usize>(e * 2) << 2)); }
@inline function edgeB(e: i32): i32 { return load<i32>(edgePtr + (<usize>(e * 2 + 1) << 2)); }

// groupId (u16)
@inline function grpId(i: i32): i32 { return <i32>load<u16>(groupPtr + (<usize>i << 1)); }

// pinned (u8)
@inline function isPinned(i: i32): bool { return load<u8>(pinnedPtr + <usize>i) != 0; }
@inline function storePinned(i: i32, v: u8): void { store<u8>(pinnedPtr + <usize>i, v); }

// oFloats (f32, stride FLOAT_STRIDE)
@inline function oFAt(cellIdx: i32, k: i32): f64 { return <f64>load<f32>(oFloatsPtr + (<usize>(cellIdx * FLOAT_STRIDE + k) << 2)); }
@inline function storeOF(cellIdx: i32, k: i32, v: f32): void { store<f32>(oFloatsPtr + (<usize>(cellIdx * FLOAT_STRIDE + k) << 2), v); }

// oInts (i32, stride INT_STRIDE)
@inline function oIAt(cellIdx: i32, k: i32): i32 { return load<i32>(oIntsPtr + (<usize>(cellIdx * INT_STRIDE + k) << 2)); }
@inline function storeOI(cellIdx: i32, k: i32, v: i32): void { store<i32>(oIntsPtr + (<usize>(cellIdx * INT_STRIDE + k) << 2), v); }

// oStack (i32)
@inline function oStackAt(top: i32): i32 { return load<i32>(oStackPtr + (<usize>top << 2)); }
@inline function storeOStack(top: i32, v: i32): void { store<i32>(oStackPtr + (<usize>top << 2), v); }
let oStackCap: i32 = 0; // 별도 추적 (oCapacity와 같이 성장)

// gSum (f32, stride 3)
@inline function gSumAt(idx: i32): f64 { return <f64>load<f32>(gSumPtr + (<usize>idx << 2)); }
@inline function storeGSum(idx: i32, v: f32): void { store<f32>(gSumPtr + (<usize>idx << 2), v); }

// gCount (f32)
@inline function gCntAt(g: i32): f64 { return <f64>load<f32>(gCountPtr + (<usize>g << 2)); }
@inline function storeGCnt(g: i32, v: f32): void { store<f32>(gCountPtr + (<usize>g << 2), v); }

// gCen (f32, stride 3)
@inline function gCenAt(idx: i32): f64 { return <f64>load<f32>(gCenPtr + (<usize>idx << 2)); }
@inline function storeGCen(idx: i32, v: f32): void { store<f32>(gCenPtr + (<usize>idx << 2), v); }

// gSep (f32, stride 3)
@inline function gSepAt(idx: i32): f64 { return <f64>load<f32>(gSepPtr + (<usize>idx << 2)); }
@inline function storeGSep(idx: i32, v: f32): void { store<f32>(gSepPtr + (<usize>idx << 2), v); }

// ---- 메모리 할당 ----
export function allocate(c: i32, ec: i32, ng: i32): void {
  count = c; edgeCount = ec; numGroups = ng;

  // f32 배열: c*3 elements = c*3*4 bytes
  posPtr    = heap.alloc(<usize>(c * 3 * 4));
  velPtr    = heap.alloc(<usize>(c * 3 * 4));
  forcePtr  = heap.alloc(<usize>(c * 3 * 4));

  // i32 배열: ec*2 elements = ec*2*4 bytes
  edgePtr   = heap.alloc(<usize>(ec * 2 * 4));

  // u16 배열: c elements = c*2 bytes
  groupPtr  = heap.alloc(<usize>(c * 2));

  // u8 배열: c elements = c bytes
  pinnedPtr = heap.alloc(<usize>(c));

  // 그룹 스크래치 (f32)
  gSumPtr   = heap.alloc(<usize>(ng * 3 * 4));
  gCountPtr = heap.alloc(<usize>(ng * 4));
  gCenPtr   = heap.alloc(<usize>(ng * 3 * 4));
  gSepPtr   = heap.alloc(<usize>(ng * 3 * 4));

  // octree 풀
  oCapacity = <i32>Math.max(<f64>(c * CAPACITY_FACTOR), 64.0);
  oStackCap = oCapacity;
  oFloatsPtr = heap.alloc(<usize>(oCapacity * FLOAT_STRIDE * 4));
  oIntsPtr   = heap.alloc(<usize>(oCapacity * INT_STRIDE * 4));
  oStackPtr  = heap.alloc(<usize>(oCapacity * 4));

  // 읽기 전에 zero-init이 필요한 버퍼
  memory.fill(velPtr,    0, <usize>(c * 3 * 4));
  memory.fill(pinnedPtr, 0, <usize>(c));
}

export function positionsPtr(): usize { return posPtr; }
export function velocitiesPtr(): usize { return velPtr; }
export function edgesPtr(): usize { return edgePtr; }
export function groupIdPtr(): usize { return groupPtr; }

export function setParams(rep: f64, ls: f64, ld: f64, grav: f64, damp: f64, th: f64, gc: f64, gs: f64): void {
  pRep = rep; pLs = ls; pLd = ld; pGrav = grav; pDamp = damp; pTheta = th; pGc = gc; pGs = gs;
}
export function setAlpha(a: f64): void { alpha = a; }
export function getAlpha(): f64 { return alpha; }
export function reheat(): void { alpha = 1.0; }

export function pin(i: i32, x: f32, y: f32, z: f32): void {
  storePinned(i, 1);
  storePosX(i, x); storePosY(i, y); storePosZ(i, z);
  storeVelX(i, 0); storeVelY(i, 0); storeVelZ(i, 0);
}
export function unpin(i: i32): void { storePinned(i, 0); }

// ---- Octree ----
function growTree(): void {
  const nc = oCapacity * 2;

  const newFPtr = heap.alloc(<usize>(nc * FLOAT_STRIDE * 4));
  memory.copy(newFPtr, oFloatsPtr, <usize>(oCapacity * FLOAT_STRIDE * 4));
  oFloatsPtr = newFPtr;

  const newIPtr = heap.alloc(<usize>(nc * INT_STRIDE * 4));
  memory.copy(newIPtr, oIntsPtr, <usize>(oCapacity * INT_STRIDE * 4));
  oIntsPtr = newIPtr;

  const newSPtr = heap.alloc(<usize>(nc * 4));
  memory.copy(newSPtr, oStackPtr, <usize>(oStackCap * 4));
  oStackPtr = newSPtr;

  oCapacity = nc;
  oStackCap = nc;
}

function allocCell(cx: f64, cy: f64, cz: f64, half: f64): i32 {
  const idx = oSize;
  if (idx >= oCapacity) growTree();
  oSize++;
  storeOF(idx, 0, <f32>cx); storeOF(idx, 1, <f32>cy); storeOF(idx, 2, <f32>cz); storeOF(idx, 3, <f32>half);
  storeOF(idx, 4, 0); storeOF(idx, 5, 0); storeOF(idx, 6, 0); storeOF(idx, 7, 0);
  storeOI(idx, 0, -1);
  for (let k = 1; k <= 8; k++) storeOI(idx, k, -1);
  return idx;
}

function octant(cellIdx: i32, x: f64, y: f64, z: f64): i32 {
  return (x >= oFAt(cellIdx, 0) ? 1 : 0) | (y >= oFAt(cellIdx, 1) ? 2 : 0) | (z >= oFAt(cellIdx, 2) ? 4 : 0);
}

function childCell(parentIdx: i32, oct: i32): i32 {
  const h = oFAt(parentIdx, 3) / 2.0;
  const cx = oFAt(parentIdx, 0) + ((oct & 1) != 0 ? h : -h);
  const cy = oFAt(parentIdx, 1) + ((oct & 2) != 0 ? h : -h);
  const cz = oFAt(parentIdx, 2) + ((oct & 4) != 0 ? h : -h);
  return allocCell(cx, cy, cz, h);
}

function placeInChild(cellIdx: i32, body: i32): void {
  const x = posX(body), y = posY(body), z = posZ(body);
  const oct = octant(cellIdx, x, y, z);
  let childIdx = oIAt(cellIdx, 1 + oct);
  if (childIdx === -1) {
    childIdx = childCell(cellIdx, oct);
    storeOI(cellIdx, 1 + oct, childIdx); // grow() 후 참조 대비 재계산
  }
  insertBody(childIdx, body);
}

function insertBody(cellIdx: i32, body: i32): void {
  const x = posX(body), y = posY(body), z = posZ(body);
  storeOF(cellIdx, 4, <f32>(oFAt(cellIdx, 4) + 1.0));
  storeOF(cellIdx, 5, <f32>(oFAt(cellIdx, 5) + x));
  storeOF(cellIdx, 6, <f32>(oFAt(cellIdx, 6) + y));
  storeOF(cellIdx, 7, <f32>(oFAt(cellIdx, 7) + z));
  const currentBody = oIAt(cellIdx, 0);
  const hasChildren = oIAt(cellIdx, 1) !== -1 || oIAt(cellIdx, 2) !== -1 || oIAt(cellIdx, 3) !== -1 || oIAt(cellIdx, 4) !== -1
    || oIAt(cellIdx, 5) !== -1 || oIAt(cellIdx, 6) !== -1 || oIAt(cellIdx, 7) !== -1 || oIAt(cellIdx, 8) !== -1;
  if (currentBody === -1 && !hasChildren) { storeOI(cellIdx, 0, body); return; }
  if (!hasChildren) { const existing = currentBody; storeOI(cellIdx, 0, -1); placeInChild(cellIdx, existing); }
  if (oFAt(cellIdx, 3) < 1e-4) return;
  placeInChild(cellIdx, body);
}

function rebuildTree(): void {
  oSize = 0;
  if (count === 0) return;
  let mn: f64 = Infinity, mx: f64 = -Infinity;
  for (let i = 0; i < count * 3; i++) {
    const v = <f64>load<f32>(posPtr + (<usize>i << 2));
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
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
  const px = posX(i), py = posY(i), pz = posZ(i);
  let top = 0;
  storeOStack(top++, 0);
  while (top > 0) {
    const cellIdx = oStackAt(--top);
    const mass = oFAt(cellIdx, 4);
    if (mass === 0) continue;
    const body = oIAt(cellIdx, 0);
    if (body === i && mass === 1.0) continue;
    const cmx = oFAt(cellIdx, 5) / mass, cmy = oFAt(cellIdx, 6) / mass, cmz = oFAt(cellIdx, 7) / mass;
    let dx = px - cmx, dy = py - cmy, dz = pz - cmz;
    let dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 < 1e-6) { dx = 1e-3; dy = 0; dz = 0; dist2 = 1e-6; }
    const dist = Math.sqrt(dist2);
    const half = oFAt(cellIdx, 3);
    const isLeaf = oIAt(cellIdx, 1) === -1 && oIAt(cellIdx, 2) === -1 && oIAt(cellIdx, 3) === -1 && oIAt(cellIdx, 4) === -1
      && oIAt(cellIdx, 5) === -1 && oIAt(cellIdx, 6) === -1 && oIAt(cellIdx, 7) === -1 && oIAt(cellIdx, 8) === -1;
    if (isLeaf || (half * 2.0) / dist < theta) {
      const fmag = (repulsion * mass) / dist2;
      outX += (dx / dist) * fmag; outY += (dy / dist) * fmag; outZ += (dz / dist) * fmag;
    } else {
      for (let k = 1; k <= 8; k++) {
        const ci = oIAt(cellIdx, k);
        if (ci !== -1) {
          if (top >= oStackCap) growTree();
          storeOStack(top++, ci);
        }
      }
    }
  }
}

export function tick(): f64 {
  // force 버퍼 zero-init
  memory.fill(forcePtr, 0, <usize>(count * 3 * 4));

  // 1) 척력 (Barnes-Hut)
  rebuildTree();
  for (let i = 0; i < count; i++) {
    computeForce(i, pTheta, pRep);
    const ix = i * 3;
    storeFrc(ix,     <f32>(frcAt(ix)     + outX));
    storeFrc(ix + 1, <f32>(frcAt(ix + 1) + outY));
    storeFrc(ix + 2, <f32>(frcAt(ix + 2) + outZ));
  }

  // 2) 인력 (spring)
  for (let e = 0; e < edgeCount; e++) {
    const a = edgeA(e), b = edgeB(e);
    let dx = posX(b) - posX(a);
    let dy = posY(b) - posY(a);
    let dz = posZ(b) - posZ(a);
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d === 0) d = 1e-3;
    const k = pLs * (d - pLd) / d;
    const fx = dx * k, fy = dy * k, fz = dz * k;
    const ax = a * 3, ay = ax + 1, az = ax + 2;
    const bx = b * 3, by = bx + 1, bz = bx + 2;
    storeFrc(ax, <f32>(frcAt(ax) + fx)); storeFrc(ay, <f32>(frcAt(ay) + fy)); storeFrc(az, <f32>(frcAt(az) + fz));
    storeFrc(bx, <f32>(frcAt(bx) - fx)); storeFrc(by, <f32>(frcAt(by) - fy)); storeFrc(bz, <f32>(frcAt(bz) - fz));
  }

  // 2.5) 그룹 힘
  const doCohesion = pGc > 0;
  const doSeparation = pGs > 0 && numGroups > 1;
  if (doCohesion || doSeparation) {
    const G = numGroups;
    memory.fill(gSumPtr,   0, <usize>(G * 3 * 4));
    memory.fill(gCountPtr, 0, <usize>(G * 4));
    for (let i = 0; i < count; i++) {
      const g = grpId(i);
      storeGSum(g * 3,     <f32>(gSumAt(g * 3)     + posX(i)));
      storeGSum(g * 3 + 1, <f32>(gSumAt(g * 3 + 1) + posY(i)));
      storeGSum(g * 3 + 2, <f32>(gSumAt(g * 3 + 2) + posZ(i)));
      storeGCnt(g, <f32>(gCntAt(g) + 1.0));
    }
    for (let g = 0; g < G; g++) {
      const c = gCntAt(g) !== 0 ? gCntAt(g) : 1.0;
      storeGCen(g * 3,     <f32>(gSumAt(g * 3)     / c));
      storeGCen(g * 3 + 1, <f32>(gSumAt(g * 3 + 1) / c));
      storeGCen(g * 3 + 2, <f32>(gSumAt(g * 3 + 2) / c));
    }
    if (doSeparation) {
      memory.fill(gSepPtr, 0, <usize>(G * 3 * 4));
      for (let g = 0; g < G; g++) {
        if (gCntAt(g) === 0) continue;
        for (let h = 0; h < G; h++) {
          if (h === g || gCntAt(h) === 0) continue;
          let dx = gCenAt(g * 3)     - gCenAt(h * 3);
          let dy = gCenAt(g * 3 + 1) - gCenAt(h * 3 + 1);
          let dz = gCenAt(g * 3 + 2) - gCenAt(h * 3 + 2);
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 1e-3) { dx = <f64>(g - h); dy = 0; dz = 0; d2 = <f64>((g - h) * (g - h)); if (d2 === 0) d2 = 1e-3; }
          const dd = Math.sqrt(d2);
          const fmag = (pGs * gCntAt(h)) / d2;
          storeGSep(g * 3,     <f32>(gSepAt(g * 3)     + (dx / dd) * fmag));
          storeGSep(g * 3 + 1, <f32>(gSepAt(g * 3 + 1) + (dy / dd) * fmag));
          storeGSep(g * 3 + 2, <f32>(gSepAt(g * 3 + 2) + (dz / dd) * fmag));
        }
      }
    }
    for (let i = 0; i < count; i++) {
      const g = grpId(i);
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      if (doCohesion) {
        storeFrc(ix, <f32>(frcAt(ix) + (gCenAt(g * 3)     - posX(i)) * pGc));
        storeFrc(iy, <f32>(frcAt(iy) + (gCenAt(g * 3 + 1) - posY(i)) * pGc));
        storeFrc(iz, <f32>(frcAt(iz) + (gCenAt(g * 3 + 2) - posZ(i)) * pGc));
      }
      if (doSeparation) {
        storeFrc(ix, <f32>(frcAt(ix) + gSepAt(g * 3)));
        storeFrc(iy, <f32>(frcAt(iy) + gSepAt(g * 3 + 1)));
        storeFrc(iz, <f32>(frcAt(iz) + gSepAt(g * 3 + 2)));
      }
    }
  }

  // 3) 중심화(gravity) + 적분 + 변위 클램프
  const maxStep = pLd;
  const maxStep2 = maxStep * maxStep;
  for (let i = 0; i < count; i++) {
    if (isPinned(i)) continue;
    const ix = i * 3, iy = ix + 1, iz = ix + 2;
    // gravity를 force 배열에 저장(f32 절단) — JS의 f[ix] -= pos*gravity 와 동일
    storeFrc(ix, <f32>(frcAt(ix) - posX(i) * pGrav));
    storeFrc(iy, <f32>(frcAt(iy) - posY(i) * pGrav));
    storeFrc(iz, <f32>(frcAt(iz) - posZ(i) * pGrav));
    let vx = (velX(i) + frcAt(ix) * alpha) * pDamp;
    let vy = (velY(i) + frcAt(iy) * alpha) * pDamp;
    let vz = (velZ(i) + frcAt(iz) * alpha) * pDamp;
    const sp2 = vx * vx + vy * vy + vz * vz;
    if (sp2 > maxStep2) {
      const scale = maxStep / Math.sqrt(sp2);
      vx *= scale; vy *= scale; vz *= scale;
    }
    storeVelX(i, <f32>vx); storeVelY(i, <f32>vy); storeVelZ(i, <f32>vz);
    storePosX(i, <f32>(posX(i) + vx));
    storePosY(i, <f32>(posY(i) + vy));
    storePosZ(i, <f32>(posZ(i) + vz));
  }

  alpha += (0.0 - alpha) * ALPHA_DECAY;
  return alpha;
}
