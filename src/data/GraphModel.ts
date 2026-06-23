export type ResolvedLinks = Record<string, Record<string, number>>;

export interface GraphModel {
  count: number;
  edgeCount: number;
  paths: string[];
  pathToIndex: Map<string, number>;
  positions: Float32Array;
  velocities: Float32Array;
  degree: Uint16Array;
  groupId: Uint16Array;
  edges: Int32Array;
}

function edgeKey(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  // 안전한 무방향 키 (노드 수 < 10,000 가정)
  return lo * 67108864 + hi;
}

export function buildGraphModel(resolvedLinks: ResolvedLinks): GraphModel {
  const pathToIndex = new Map<string, number>();
  const paths: string[] = [];
  const intern = (p: string): number => {
    let i = pathToIndex.get(p);
    if (i === undefined) {
      i = paths.length;
      pathToIndex.set(p, i);
      paths.push(p);
    }
    return i;
  };

  for (const src of Object.keys(resolvedLinks)) {
    intern(src);
    for (const tgt of Object.keys(resolvedLinks[src])) intern(tgt);
  }

  const count = paths.length;
  const degree = new Uint16Array(count);
  const seen = new Set<number>();
  const edgeList: number[] = [];

  for (const src of Object.keys(resolvedLinks)) {
    const si = pathToIndex.get(src)!;
    for (const tgt of Object.keys(resolvedLinks[src])) {
      const ti = pathToIndex.get(tgt)!;
      if (si === ti) continue;
      const key = edgeKey(si, ti);
      if (seen.has(key)) continue;
      seen.add(key);
      edgeList.push(si, ti);
      degree[si]++;
      degree[ti]++;
    }
  }

  return {
    count,
    edgeCount: edgeList.length / 2,
    paths,
    pathToIndex,
    positions: new Float32Array(count * 3),
    velocities: new Float32Array(count * 3),
    degree,
    groupId: new Uint16Array(count),
    edges: Int32Array.from(edgeList),
  };
}

// mulberry32 — 시드 가능한 결정적 PRNG
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedPositions(model: GraphModel, seed: number): void {
  const rand = mulberry32(seed);
  const radius = Math.cbrt(model.count) * 20 + 1;
  for (let i = 0; i < model.count; i++) {
    // 구 내부 균등 분포 (체적 샘플링)
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = radius * Math.cbrt(rand());
    const s = Math.sqrt(1 - u * u);
    model.positions[i * 3] = r * s * Math.cos(theta);
    model.positions[i * 3 + 1] = r * s * Math.sin(theta);
    model.positions[i * 3 + 2] = r * u;
  }
}
