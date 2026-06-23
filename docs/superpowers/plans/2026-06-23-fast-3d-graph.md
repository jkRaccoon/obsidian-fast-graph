# Fast 3D Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian의 노트 그래프를 3D 공간에서 ~10,000 노드까지 실시간 물리 시뮬레이션으로 부드럽게 탐색하는 플러그인을 만든다.

**Architecture:** 3개 레이어를 스레드 단위로 분리한다. 메인 스레드는 데이터(metadataCache→typed array 모델)와 렌더(Three.js InstancedMesh/LineSegments)를 담당하고, Web Worker는 Barnes-Hut 물리 시뮬레이션을 담당한다. 워커는 매 tick 위치 버퍼만 메인으로 보내고 메인은 그것을 읽어 인스턴스 행렬만 갱신해, 물리와 렌더를 디커플링한다.

**Tech Stack:** TypeScript, Three.js, esbuild(2-pass: 워커 인라인), vitest, Obsidian Plugin API. 패키지 매니저는 yarn.

## Global Constraints

- 패키지 매니저는 **yarn** 고정. `npm` 사용 금지.
- 언어: **TypeScript** (`strict: true`).
- 빌드 산출물: `main.js`(메인), 워커는 빌드 시 문자열로 인라인되어 `main.js`에 포함.
- 의존성 핵심 버전: `three ^0.169.0`, `obsidian latest`, `esbuild ^0.21.0`, `vitest ^2.1.0`, `typescript ^5.5.0`.
- 플러그인 메타: id `fast-graph-3d`, name `Fast 3D Graph`, `minAppVersion 1.4.0`, `isDesktopOnly: true`.
- **순수 로직 모듈**(`data/GraphModel`, `data/grouping`, `interaction/localGraph`, `physics/Octree`, `physics/PhysicsEngine`)은 Obsidian/Three/DOM에 의존하지 않는다. 이들은 vitest 단위 테스트로 검증한다.
- 핫 루프(물리 tick, 렌더 갱신)에서는 노드/엣지당 JS 객체를 생성하지 않는다 — typed array만 사용.
- 좌표 버퍼 규약: 노드 위치는 `Float32Array`, 길이 `3*count`, 노드 i의 좌표는 `[3i, 3i+1, 3i+2]` = (x, y, z).
- 엣지 버퍼 규약: `Int32Array`, 길이 `2*edgeCount`, 엣지 e는 `[2e]=source index, [2e+1]=target index`. 무방향으로 취급.

---

## File Structure

```
src/
├── main.ts                    # 플러그인 진입점
├── settings.ts                # 설정 탭 + 기본값 + load/saveData
├── types.ts                   # 공용 타입(ForceParams, GroupBy 등)
├── view/Graph3DView.ts        # ItemView, 레이어 조립/생명주기
├── data/
│   ├── GraphModel.ts          # typed array 모델 + 빌더 + seedPositions
│   ├── grouping.ts            # 폴더/태그 → 색상 그룹
│   └── GraphDataProvider.ts   # metadataCache 구독 + 증분 갱신
├── physics/
│   ├── protocol.ts            # 메인↔워커 메시지 타입
│   ├── Octree.ts              # Barnes-Hut octree
│   ├── PhysicsEngine.ts       # force 시뮬레이션
│   ├── physics.worker.ts      # 워커 진입점(PhysicsEngine 래핑)
│   └── PhysicsClient.ts       # 메인 측 워커 핸들(생성/메시지/폴백)
├── render/
│   ├── NodeLayer.ts           # InstancedMesh 노드
│   ├── EdgeLayer.ts           # LineSegments 엣지
│   ├── Picker.ts              # raycast 피킹
│   └── GraphRenderer.ts       # 씬/카메라/컨트롤/루프 총괄
└── interaction/
    ├── localGraph.ts          # BFS depth-N 서브그래프
    └── hover.ts               # 호버 → 라벨/하이라이트 상태 계산
tests/                         # vitest, src 미러 구조
esbuild.config.mjs
vitest.config.ts
manifest.json
tsconfig.json
package.json
```

---

## Task 1: 프로젝트 스캐폴딩 & 2-pass 빌드

**Files:**
- Create: `package.json`, `tsconfig.json`, `manifest.json`, `versions.json`, `esbuild.config.mjs`, `vitest.config.ts`
- Create: `src/types.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `yarn build`(→ `main.js`), `yarn test`(vitest), `yarn dev`(watch). `src/types.ts`에서 `ForceParams`, `GroupBy`, `RENDER_DEFAULTS` export.

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "fast-graph-3d",
  "version": "0.1.0",
  "description": "Fast 3D graph view for Obsidian",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.14.0",
    "esbuild": "^0.21.0",
    "obsidian": "latest",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "three": "^0.169.0",
    "@types/three": "^0.169.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable", "WebWorker"],
    "strict": true,
    "noImplicitAny": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: `manifest.json` 와 `versions.json` 작성**

`manifest.json`:
```json
{
  "id": "fast-graph-3d",
  "name": "Fast 3D Graph",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Explore your vault as a fast 3D force-directed graph.",
  "author": "jkRaccoon",
  "isDesktopOnly": true
}
```
`versions.json`:
```json
{ "0.1.0": "1.4.0" }
```

- [ ] **Step 4: `esbuild.config.mjs` 작성 (워커 인라인 2-pass)**

```js
import esbuild from "esbuild";

const prod = process.argv[2] === "production";

// Pass 1: 워커를 자체 완결 IIFE 문자열로 번들
async function buildWorker() {
  const result = await esbuild.build({
    entryPoints: ["src/physics/physics.worker.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: prod,
    write: false,
  });
  return result.outputFiles[0].text;
}

// Pass 2: 메인 번들. 워커 코드를 define으로 주입.
async function buildMain(workerCode) {
  const ctx = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
    define: { "process.env.WORKER_CODE": JSON.stringify(workerCode) },
    outfile: "main.js",
    sourcemap: prod ? false : "inline",
    minify: prod,
    logLevel: "info",
  });
  if (prod) {
    await ctx.rebuild();
    await ctx.dispose();
  } else {
    await ctx.watch();
  }
}

const workerCode = await buildWorker();
await buildMain(workerCode);
```

워커 코드 접근 헬퍼는 Task 8에서 `process.env.WORKER_CODE`로 읽는다.

- [ ] **Step 5: `vitest.config.ts` 작성**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: `src/types.ts` 작성**

```ts
export type GroupBy = "folder" | "tag" | "none";

export interface ForceParams {
  repulsion: number;     // 척력 세기 (>0)
  linkStrength: number;  // spring 세기
  linkDistance: number;  // spring 이상 거리
  gravity: number;       // 중심화 세기
  damping: number;       // 속도 감쇠(0~1, tick당 곱)
  theta: number;         // Barnes-Hut 개방 기준
}

export const FORCE_DEFAULTS: ForceParams = {
  repulsion: 30,
  linkStrength: 0.05,
  linkDistance: 30,
  gravity: 0.02,
  damping: 0.9,
  theta: 0.8,
};

export interface RenderSettings {
  groupBy: GroupBy;
  nodeBaseSize: number;
  nodeDegreeScale: number;
  localGraphDepth: number;
  showLabels: boolean;
  maxNodes: number;
}

export const RENDER_DEFAULTS: RenderSettings = {
  groupBy: "folder",
  nodeBaseSize: 2,
  nodeDegreeScale: 0.5,
  localGraphDepth: 1,
  showLabels: true,
  maxNodes: 20000,
};
```

- [ ] **Step 7: 스모크 테스트 작성 — `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { FORCE_DEFAULTS, RENDER_DEFAULTS } from "../src/types";

describe("scaffolding smoke", () => {
  it("exposes sane defaults", () => {
    expect(FORCE_DEFAULTS.theta).toBeGreaterThan(0);
    expect(RENDER_DEFAULTS.maxNodes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 8: 의존성 설치 후 테스트 실행해 통과 확인**

Run: `yarn install && yarn test`
Expected: 1 passed.

- [ ] **Step 9: 빌드 확인**

Run: `yarn build`
Expected: `main.js` 생성, 에러 없음. (이 시점 `src/main.ts`가 없으면 Step 10에서 임시 스텁 추가.)

- [ ] **Step 10: 임시 `src/main.ts` 스텁 추가 후 빌드 재확인**

```ts
import { Plugin } from "obsidian";
export default class FastGraphPlugin extends Plugin {
  async onload() {}
}
```
Run: `yarn build`
Expected: `main.js` 생성 성공.

- [ ] **Step 11: 커밋**

```bash
git add package.json tsconfig.json manifest.json versions.json esbuild.config.mjs vitest.config.ts src/types.ts src/main.ts tests/smoke.test.ts yarn.lock
git commit -m "chore: 프로젝트 스캐폴딩 + 2-pass esbuild 빌드"
```

---

## Task 2: GraphModel — typed array 그래프 모델

**Files:**
- Create: `src/data/GraphModel.ts`
- Test: `tests/data/GraphModel.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `interface GraphModel { count, edgeCount, paths: string[], pathToIndex: Map<string,number>, positions: Float32Array, velocities: Float32Array, degree: Uint16Array, groupId: Uint16Array, edges: Int32Array }`
  - `type ResolvedLinks = Record<string, Record<string, number>>`
  - `function buildGraphModel(resolvedLinks: ResolvedLinks): GraphModel`
  - `function seedPositions(model: GraphModel, seed: number): void`

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/data/GraphModel.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildGraphModel, seedPositions } from "../../src/data/GraphModel";

describe("buildGraphModel", () => {
  it("collects all nodes from sources and targets", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1 }, "b.md": {} });
    expect(m.count).toBe(2);
    expect(new Set(m.paths)).toEqual(new Set(["a.md", "b.md"]));
  });

  it("includes target-only nodes", () => {
    const m = buildGraphModel({ "a.md": { "c.md": 1 } });
    expect(m.count).toBe(2);
    expect(m.pathToIndex.has("c.md")).toBe(true);
  });

  it("builds one undirected edge per source-target pair", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1 } });
    expect(m.edgeCount).toBe(1);
    const a = m.pathToIndex.get("a.md")!;
    const b = m.pathToIndex.get("b.md")!;
    expect([m.edges[0], m.edges[1]].sort()).toEqual([a, b].sort());
  });

  it("dedupes reciprocal links into a single edge", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1 }, "b.md": { "a.md": 1 } });
    expect(m.edgeCount).toBe(1);
  });

  it("computes degree per node", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1, "c.md": 1 }, "b.md": {}, "c.md": {} });
    expect(m.degree[m.pathToIndex.get("a.md")!]).toBe(2);
    expect(m.degree[m.pathToIndex.get("b.md")!]).toBe(1);
  });

  it("seedPositions is deterministic for a given seed", () => {
    const m1 = buildGraphModel({ "a.md": { "b.md": 1 } });
    const m2 = buildGraphModel({ "a.md": { "b.md": 1 } });
    seedPositions(m1, 42);
    seedPositions(m2, 42);
    expect(Array.from(m1.positions)).toEqual(Array.from(m2.positions));
    expect(m1.positions.some((v) => v !== 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/data/GraphModel.test.ts`
Expected: FAIL — `buildGraphModel` 미정의.

- [ ] **Step 3: 구현 작성 — `src/data/GraphModel.ts`**

```ts
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
  // 안전한 무방향 키 (노드 수 < 2^26 가정)
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
    // 구 표면 균등 분포
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = radius * Math.cbrt(rand());
    const s = Math.sqrt(1 - u * u);
    model.positions[i * 3] = r * s * Math.cos(theta);
    model.positions[i * 3 + 1] = r * s * Math.sin(theta);
    model.positions[i * 3 + 2] = r * u;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/data/GraphModel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/data/GraphModel.ts tests/data/GraphModel.test.ts
git commit -m "feat: GraphModel typed-array 빌더 + 결정적 위치 시딩"
```

---

## Task 3: grouping — 폴더/태그 색상 그룹화

**Files:**
- Create: `src/data/grouping.ts`
- Test: `tests/data/grouping.test.ts`

**Interfaces:**
- Consumes: `GroupBy`(types).
- Produces:
  - `interface GroupingResult { groupId: Uint16Array; groups: { id: number; key: string; color: string }[] }`
  - `function computeGrouping(paths: string[], tagsByPath: Map<string, string[]>, mode: GroupBy): GroupingResult`
  - `const PALETTE: string[]`

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/data/grouping.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeGrouping } from "../../src/data/grouping";

describe("computeGrouping", () => {
  const tags = new Map<string, string[]>();

  it("groups by top-level folder", () => {
    const r = computeGrouping(["work/a.md", "work/b.md", "personal/c.md"], tags, "folder");
    const idA = r.groupId[0];
    const idB = r.groupId[1];
    const idC = r.groupId[2];
    expect(idA).toBe(idB);
    expect(idA).not.toBe(idC);
    expect(r.groups.length).toBe(2);
  });

  it("groups root files under a shared key", () => {
    const r = computeGrouping(["a.md", "b.md"], tags, "folder");
    expect(r.groupId[0]).toBe(r.groupId[1]);
  });

  it("groups by first tag", () => {
    const t = new Map<string, string[]>([
      ["a.md", ["#x"]],
      ["b.md", ["#y"]],
      ["c.md", ["#x"]],
    ]);
    const r = computeGrouping(["a.md", "b.md", "c.md"], t, "tag");
    expect(r.groupId[0]).toBe(r.groupId[2]);
    expect(r.groupId[0]).not.toBe(r.groupId[1]);
  });

  it("assigns every node to group 0 when mode is none", () => {
    const r = computeGrouping(["a.md", "b.md"], tags, "none");
    expect(Array.from(r.groupId)).toEqual([0, 0]);
    expect(r.groups.length).toBe(1);
  });

  it("assigns a color string to each group", () => {
    const r = computeGrouping(["work/a.md", "personal/c.md"], tags, "folder");
    for (const g of r.groups) expect(g.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/data/grouping.test.ts`
Expected: FAIL — `computeGrouping` 미정의.

- [ ] **Step 3: 구현 작성 — `src/data/grouping.ts`**

```ts
import type { GroupBy } from "../types";

export const PALETTE: string[] = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];

export interface GroupingResult {
  groupId: Uint16Array;
  groups: { id: number; key: string; color: string }[];
}

function keyFor(path: string, tagsByPath: Map<string, string[]>, mode: GroupBy): string {
  if (mode === "none") return "all";
  if (mode === "folder") {
    const slash = path.indexOf("/");
    return slash === -1 ? "/" : path.slice(0, slash);
  }
  // tag
  const tags = tagsByPath.get(path);
  return tags && tags.length > 0 ? tags[0] : "(untagged)";
}

export function computeGrouping(
  paths: string[],
  tagsByPath: Map<string, string[]>,
  mode: GroupBy
): GroupingResult {
  const groupId = new Uint16Array(paths.length);
  const keyToId = new Map<string, number>();
  const groups: { id: number; key: string; color: string }[] = [];

  for (let i = 0; i < paths.length; i++) {
    const key = keyFor(paths[i], tagsByPath, mode);
    let id = keyToId.get(key);
    if (id === undefined) {
      id = groups.length;
      keyToId.set(key, id);
      groups.push({ id, key, color: PALETTE[id % PALETTE.length] });
    }
    groupId[i] = id;
  }
  return { groupId, groups };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/data/grouping.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/data/grouping.ts tests/data/grouping.test.ts
git commit -m "feat: 폴더/태그 색상 그룹화"
```

---

## Task 4: localGraph — BFS depth-N 서브그래프

**Files:**
- Create: `src/interaction/localGraph.ts`
- Test: `tests/interaction/localGraph.test.ts`

**Interfaces:**
- Consumes: `GraphModel`(Task 2).
- Produces: `function extractLocalGraph(model: GraphModel, rootPath: string, depth: number): Set<number>` — depth 이내 노드 인덱스 집합. `rootPath` 부재 시 빈 집합.

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/interaction/localGraph.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildGraphModel } from "../../src/data/GraphModel";
import { extractLocalGraph } from "../../src/interaction/localGraph";

// a - b - c - d (체인)
const model = buildGraphModel({
  "a.md": { "b.md": 1 },
  "b.md": { "c.md": 1 },
  "c.md": { "d.md": 1 },
});
const idx = (p: string) => model.pathToIndex.get(p)!;

describe("extractLocalGraph", () => {
  it("depth 0 returns only the root", () => {
    expect(extractLocalGraph(model, "a.md", 0)).toEqual(new Set([idx("a.md")]));
  });

  it("depth 1 returns root + direct neighbors", () => {
    expect(extractLocalGraph(model, "b.md", 1)).toEqual(
      new Set([idx("a.md"), idx("b.md"), idx("c.md")])
    );
  });

  it("depth 2 reaches two hops", () => {
    const s = extractLocalGraph(model, "a.md", 2);
    expect(s.has(idx("c.md"))).toBe(true);
    expect(s.has(idx("d.md"))).toBe(false);
  });

  it("unknown root yields empty set", () => {
    expect(extractLocalGraph(model, "zzz.md", 2).size).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/interaction/localGraph.test.ts`
Expected: FAIL — `extractLocalGraph` 미정의.

- [ ] **Step 3: 구현 작성 — `src/interaction/localGraph.ts`**

```ts
import type { GraphModel } from "../data/GraphModel";

export function extractLocalGraph(
  model: GraphModel,
  rootPath: string,
  depth: number
): Set<number> {
  const root = model.pathToIndex.get(rootPath);
  if (root === undefined) return new Set();

  // 인접 리스트 (무방향)
  const adj: number[][] = Array.from({ length: model.count }, () => []);
  for (let e = 0; e < model.edgeCount; e++) {
    const s = model.edges[e * 2];
    const t = model.edges[e * 2 + 1];
    adj[s].push(t);
    adj[t].push(s);
  }

  const visited = new Set<number>([root]);
  let frontier = [root];
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (const u of frontier) {
      for (const v of adj[u]) {
        if (!visited.has(v)) {
          visited.add(v);
          next.push(v);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return visited;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/interaction/localGraph.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/interaction/localGraph.ts tests/interaction/localGraph.test.ts
git commit -m "feat: 로컬 그래프 BFS depth-N 추출"
```

---

## Task 5: GraphDataProvider — metadataCache 글루

**Files:**
- Create: `src/data/GraphDataProvider.ts`
- Test: `tests/data/GraphDataProvider.test.ts`

**Interfaces:**
- Consumes: `buildGraphModel`, `seedPositions`(Task 2), `computeGrouping`(Task 3), Obsidian `App`.
- Produces:
  - `class GraphDataProvider { constructor(app: App, settings: RenderSettings); build(): GraphModel; onChange(cb: () => void): () => void; dispose(): void }`
  - `build()`는 `app.metadataCache.resolvedLinks`로 모델을 만들고 그룹/시드를 적용해 반환.
  - `onChange`는 metadataCache `resolved`/vault 변경 시 콜백을 디바운스 호출, 해제 함수 반환.

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/data/GraphDataProvider.test.ts`**

`tests/_mocks/obsidian.ts`로 최소 목 제공:
```ts
// tests/_mocks/obsidian.ts
export class FakeMetadataCache {
  resolvedLinks: Record<string, Record<string, number>> = {};
  private handlers: Record<string, Function[]> = {};
  on(evt: string, cb: Function) { (this.handlers[evt] ??= []).push(cb); return { evt, cb }; }
  offref() {}
  trigger(evt: string) { (this.handlers[evt] ?? []).forEach((h) => h()); }
  getCache() { return { tags: [] }; }
}
export class FakeVault {
  on() { return {}; }
}
export class FakeApp {
  metadataCache = new FakeMetadataCache();
  vault = new FakeVault();
}
```

테스트:
```ts
import { describe, it, expect, vi } from "vitest";
import { GraphDataProvider } from "../../src/data/GraphDataProvider";
import { FakeApp } from "../_mocks/obsidian";
import { RENDER_DEFAULTS } from "../../src/types";

function makeProvider() {
  const app = new FakeApp();
  app.metadataCache.resolvedLinks = { "a.md": { "b.md": 1 }, "b.md": {} };
  const provider = new GraphDataProvider(app as any, { ...RENDER_DEFAULTS });
  return { app, provider };
}

describe("GraphDataProvider", () => {
  it("builds a model from resolvedLinks with seeded positions", () => {
    const { provider } = makeProvider();
    const m = provider.build();
    expect(m.count).toBe(2);
    expect(m.positions.some((v) => v !== 0)).toBe(true);
  });

  it("applies grouping to the model", () => {
    const { app, provider } = makeProvider();
    app.metadataCache.resolvedLinks = { "work/a.md": {}, "home/b.md": {} };
    const m = provider.build();
    expect(m.groupId[0]).not.toBe(m.groupId[1]);
  });

  it("debounced onChange fires after a cache event", async () => {
    const { app, provider } = makeProvider();
    const cb = vi.fn();
    provider.onChange(cb);
    app.metadataCache.trigger("resolved");
    await new Promise((r) => setTimeout(r, 350));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/data/GraphDataProvider.test.ts`
Expected: FAIL — `GraphDataProvider` 미정의.

- [ ] **Step 3: 구현 작성 — `src/data/GraphDataProvider.ts`**

```ts
import type { App, EventRef } from "obsidian";
import { buildGraphModel, seedPositions, type GraphModel } from "./GraphModel";
import { computeGrouping } from "./grouping";
import type { RenderSettings } from "../types";

export class GraphDataProvider {
  private refs: EventRef[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private app: App, private settings: RenderSettings) {}

  build(): GraphModel {
    const links = this.app.metadataCache.resolvedLinks;
    const model = buildGraphModel(links);

    const tagsByPath = new Map<string, string[]>();
    if (this.settings.groupBy === "tag") {
      for (const path of model.paths) {
        const cache = this.app.metadataCache.getCache(path);
        const tags = cache?.tags?.map((t) => t.tag) ?? [];
        tagsByPath.set(path, tags);
      }
    }

    const grouping = computeGrouping(model.paths, tagsByPath, this.settings.groupBy);
    model.groupId.set(grouping.groupId);
    seedPositions(model, 1);
    return model;
  }

  onChange(cb: () => void): () => void {
    const debounced = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(cb, 300);
    };
    this.refs.push(this.app.metadataCache.on("resolved", debounced));
    this.refs.push(this.app.vault.on("rename", debounced));
    this.refs.push(this.app.vault.on("delete", debounced));
    this.refs.push(this.app.vault.on("create", debounced));
    return () => {
      for (const r of this.refs) this.app.metadataCache.offref(r);
      this.refs = [];
    };
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const r of this.refs) this.app.metadataCache.offref(r);
    this.refs = [];
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/data/GraphDataProvider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/data/GraphDataProvider.ts tests/data/GraphDataProvider.test.ts tests/_mocks/obsidian.ts
git commit -m "feat: GraphDataProvider — metadataCache 구독/증분 갱신"
```

---

## Task 6: Octree — Barnes-Hut 척력 근사

**Files:**
- Create: `src/physics/Octree.ts`
- Test: `tests/physics/Octree.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: `class Octree { constructor(positions: Float32Array, count: number); computeForce(i: number, theta: number, repulsion: number, out: Float32Array): void }` — 노드 i에 작용하는 누적 척력을 `out`(길이 3)에 **대입**(덮어쓰기)한다.

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/physics/Octree.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Octree } from "../../src/physics/Octree";

describe("Octree repulsion", () => {
  it("pushes two nodes apart along their axis", () => {
    // 노드 0 at (-1,0,0), 노드 1 at (1,0,0)
    const pos = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const tree = new Octree(pos, 2);
    const f = new Float32Array(3);
    tree.computeForce(0, 0.5, 1, f);
    expect(f[0]).toBeLessThan(0); // 0번은 -x 방향으로 밀린다
    expect(Math.abs(f[1])).toBeLessThan(1e-6);
    expect(Math.abs(f[2])).toBeLessThan(1e-6);
  });

  it("is symmetric for a symmetric pair", () => {
    const pos = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const tree = new Octree(pos, 2);
    const f0 = new Float32Array(3);
    const f1 = new Float32Array(3);
    tree.computeForce(0, 0.5, 1, f0);
    tree.computeForce(1, 0.5, 1, f1);
    expect(f0[0]).toBeCloseTo(-f1[0], 5);
  });

  it("approximates a far cluster by its center of mass (theta large)", () => {
    // 0번 노드, 그리고 멀리 떨어진 군집(100 근방 2개)
    const pos = new Float32Array([0, 0, 0, 100, 0, 0, 102, 0, 0]);
    const tree = new Octree(pos, 3);
    const f = new Float32Array(3);
    tree.computeForce(0, 1.5, 1, f); // theta 큼 → 군집을 한 점으로 근사
    expect(f[0]).toBeLessThan(0); // 군집 반대 방향(-x)으로 밀림
  });

  it("writes (overwrites) into out, not accumulates", () => {
    const pos = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const tree = new Octree(pos, 2);
    const f = new Float32Array([999, 999, 999]);
    tree.computeForce(0, 0.5, 1, f);
    expect(f[0]).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/physics/Octree.test.ts`
Expected: FAIL — `Octree` 미정의.

- [ ] **Step 3: 구현 작성 — `src/physics/Octree.ts`**

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/physics/Octree.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/physics/Octree.ts tests/physics/Octree.test.ts
git commit -m "feat: Barnes-Hut octree 척력 근사"
```

---

## Task 7: PhysicsEngine — force 시뮬레이션

**Files:**
- Create: `src/physics/PhysicsEngine.ts`
- Test: `tests/physics/PhysicsEngine.test.ts`

**Interfaces:**
- Consumes: `Octree`(Task 6), `ForceParams`(types).
- Produces:
  - `class PhysicsEngine`
    - `constructor(opts: { count: number; edges: Int32Array; positions: Float32Array; params: ForceParams })`
    - `alpha: number` (시작 1)
    - `tick(): void` — 한 스텝 전진, positions/velocities 변경, alpha 감쇠
    - `get positions(): Float32Array`
    - `setParams(p: Partial<ForceParams>): void`
    - `pin(i, x, y, z): void` / `unpin(i): void`
    - `reheat(): void` (alpha를 1로)
    - `readonly alphaMin = 0.001`

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/physics/PhysicsEngine.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { PhysicsEngine } from "../../src/physics/PhysicsEngine";
import { FORCE_DEFAULTS } from "../../src/types";

function dist(p: Float32Array, a: number, b: number): number {
  const dx = p[a * 3] - p[b * 3];
  const dy = p[a * 3 + 1] - p[b * 3 + 1];
  const dz = p[a * 3 + 2] - p[b * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe("PhysicsEngine", () => {
  it("pulls two linked far-apart nodes closer", () => {
    const positions = new Float32Array([-200, 0, 0, 200, 0, 0]);
    const engine = new PhysicsEngine({
      count: 2,
      edges: Int32Array.from([0, 1]),
      positions,
      params: { ...FORCE_DEFAULTS },
    });
    const before = dist(positions, 0, 1);
    for (let i = 0; i < 200; i++) engine.tick();
    expect(dist(positions, 0, 1)).toBeLessThan(before);
  });

  it("pushes two unlinked overlapping nodes apart", () => {
    const positions = new Float32Array([0, 0, 0, 0.5, 0, 0]);
    const engine = new PhysicsEngine({
      count: 2,
      edges: new Int32Array(0),
      positions,
      params: { ...FORCE_DEFAULTS },
    });
    const before = dist(positions, 0, 1);
    for (let i = 0; i < 50; i++) engine.tick();
    expect(dist(positions, 0, 1)).toBeGreaterThan(before);
  });

  it("decays alpha below alphaMin over time", () => {
    const engine = new PhysicsEngine({
      count: 2,
      edges: Int32Array.from([0, 1]),
      positions: new Float32Array([-10, 0, 0, 10, 0, 0]),
      params: { ...FORCE_DEFAULTS },
    });
    for (let i = 0; i < 400; i++) engine.tick();
    expect(engine.alpha).toBeLessThan(engine.alphaMin);
  });

  it("keeps a pinned node fixed", () => {
    const positions = new Float32Array([0, 0, 0, 50, 0, 0]);
    const engine = new PhysicsEngine({
      count: 2,
      edges: Int32Array.from([0, 1]),
      positions,
      params: { ...FORCE_DEFAULTS },
    });
    engine.pin(0, 0, 0, 0);
    for (let i = 0; i < 100; i++) engine.tick();
    expect(positions[0]).toBeCloseTo(0, 5);
    expect(positions[1]).toBeCloseTo(0, 5);
    expect(positions[2]).toBeCloseTo(0, 5);
  });

  it("reheat resets alpha to 1", () => {
    const engine = new PhysicsEngine({
      count: 2,
      edges: Int32Array.from([0, 1]),
      positions: new Float32Array([-10, 0, 0, 10, 0, 0]),
      params: { ...FORCE_DEFAULTS },
    });
    for (let i = 0; i < 400; i++) engine.tick();
    engine.reheat();
    expect(engine.alpha).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/physics/PhysicsEngine.test.ts`
Expected: FAIL — `PhysicsEngine` 미정의.

- [ ] **Step 3: 구현 작성 — `src/physics/PhysicsEngine.ts`**

```ts
import { Octree } from "./Octree";
import type { ForceParams } from "../types";

const ALPHA_DECAY = 0.0228;
const ALPHA_TARGET = 0;

export class PhysicsEngine {
  alpha = 1;
  readonly alphaMin = 0.001;

  private count: number;
  private edges: Int32Array;
  private pos: Float32Array;
  private vel: Float32Array;
  private params: ForceParams;
  private force: Float32Array;
  private pinned: Uint8Array;
  private scratch = new Float32Array(3);

  constructor(opts: { count: number; edges: Int32Array; positions: Float32Array; params: ForceParams }) {
    this.count = opts.count;
    this.edges = opts.edges;
    this.pos = opts.positions;
    this.vel = new Float32Array(opts.count * 3);
    this.params = { ...opts.params };
    this.force = new Float32Array(opts.count * 3);
    this.pinned = new Uint8Array(opts.count);
  }

  get positions(): Float32Array {
    return this.pos;
  }

  setParams(p: Partial<ForceParams>): void {
    this.params = { ...this.params, ...p };
  }

  pin(i: number, x: number, y: number, z: number): void {
    this.pinned[i] = 1;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = 0; this.vel[i * 3 + 1] = 0; this.vel[i * 3 + 2] = 0;
  }

  unpin(i: number): void {
    this.pinned[i] = 0;
  }

  reheat(): void {
    this.alpha = 1;
  }

  tick(): void {
    const { repulsion, linkStrength, linkDistance, gravity, damping, theta } = this.params;
    const f = this.force;
    f.fill(0);

    // 1) 척력 (Barnes-Hut)
    const tree = new Octree(this.pos, this.count);
    const s = this.scratch;
    for (let i = 0; i < this.count; i++) {
      tree.computeForce(i, theta, repulsion, s);
      f[i * 3] += s[0]; f[i * 3 + 1] += s[1]; f[i * 3 + 2] += s[2];
    }

    // 2) 인력 (spring, 엣지)
    for (let e = 0; e < this.edges.length; e += 2) {
      const a = this.edges[e], b = this.edges[e + 1];
      let dx = this.pos[b * 3] - this.pos[a * 3];
      let dy = this.pos[b * 3 + 1] - this.pos[a * 3 + 1];
      let dz = this.pos[b * 3 + 2] - this.pos[a * 3 + 2];
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      const k = linkStrength * (d - linkDistance) / d;
      const fx = dx * k, fy = dy * k, fz = dz * k;
      f[a * 3] += fx; f[a * 3 + 1] += fy; f[a * 3 + 2] += fz;
      f[b * 3] -= fx; f[b * 3 + 1] -= fy; f[b * 3 + 2] -= fz;
    }

    // 3) 중심화(gravity) + 적분
    for (let i = 0; i < this.count; i++) {
      if (this.pinned[i]) continue;
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      f[ix] -= this.pos[ix] * gravity;
      f[iy] -= this.pos[iy] * gravity;
      f[iz] -= this.pos[iz] * gravity;

      this.vel[ix] = (this.vel[ix] + f[ix] * this.alpha) * damping;
      this.vel[iy] = (this.vel[iy] + f[iy] * this.alpha) * damping;
      this.vel[iz] = (this.vel[iz] + f[iz] * this.alpha) * damping;

      this.pos[ix] += this.vel[ix];
      this.pos[iy] += this.vel[iy];
      this.pos[iz] += this.vel[iz];
    }

    // alpha 감쇠
    this.alpha += (ALPHA_TARGET - this.alpha) * ALPHA_DECAY;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/physics/PhysicsEngine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/physics/PhysicsEngine.ts tests/physics/PhysicsEngine.test.ts
git commit -m "feat: force 시뮬레이션 엔진(척력/인력/중력/alpha decay)"
```

---

## Task 8: protocol + physics.worker + PhysicsClient

**Files:**
- Create: `src/physics/protocol.ts`, `src/physics/physics.worker.ts`, `src/physics/PhysicsClient.ts`
- Test: `tests/physics/protocol.test.ts`

**Interfaces:**
- Consumes: `PhysicsEngine`(Task 7), `ForceParams`(types), `process.env.WORKER_CODE`(Task 1 빌드 주입).
- Produces:
  - `protocol.ts`: `type MainToWorker`, `type WorkerToMain` (아래 코드 참조).
  - `PhysicsClient`: `constructor(opts: { count; edges; positions; params; onTick(positions: Float32Array, alpha: number): void })`, `setParams`, `pin`, `unpin`, `reheat`, `dispose`. 워커 생성 실패 시 메인 스레드 폴백 루프로 동작.

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/physics/protocol.test.ts`**

protocol 타입은 런타임 값이 없으므로, 타입을 사용하는 작은 팩토리 함수를 함께 둔다.
```ts
import { describe, it, expect } from "vitest";
import { initMessage } from "../../src/physics/protocol";

describe("protocol", () => {
  it("initMessage packs buffers as transferable ArrayBuffers", () => {
    const positions = new Float32Array([1, 2, 3]);
    const edges = Int32Array.from([0, 1]);
    const { msg, transfer } = initMessage(1, edges, positions, {
      repulsion: 1, linkStrength: 1, linkDistance: 1, gravity: 1, damping: 1, theta: 1,
    });
    expect(msg.type).toBe("init");
    expect(msg.count).toBe(1);
    expect(transfer.length).toBe(2);
    expect(transfer[0]).toBeInstanceOf(ArrayBuffer);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/physics/protocol.test.ts`
Expected: FAIL — `initMessage` 미정의.

- [ ] **Step 3: `src/physics/protocol.ts` 작성**

```ts
import type { ForceParams } from "../types";

export type MainToWorker =
  | { type: "init"; count: number; edges: ArrayBuffer; positions: ArrayBuffer; params: ForceParams }
  | { type: "setParams"; params: Partial<ForceParams> }
  | { type: "pin"; index: number; x: number; y: number; z: number }
  | { type: "unpin"; index: number }
  | { type: "reheat" }
  | { type: "stop" };

export type WorkerToMain =
  | { type: "tick"; positions: ArrayBuffer; alpha: number }
  | { type: "stopped" }
  | { type: "error"; message: string };

export function initMessage(
  count: number,
  edges: Int32Array,
  positions: Float32Array,
  params: ForceParams
): { msg: Extract<MainToWorker, { type: "init" }>; transfer: ArrayBuffer[] } {
  // 복사본을 만들어 호출자 버퍼를 detach 시키지 않는다.
  const edgesCopy = edges.slice();
  const posCopy = positions.slice();
  return {
    msg: { type: "init", count, edges: edgesCopy.buffer, positions: posCopy.buffer, params },
    transfer: [edgesCopy.buffer, posCopy.buffer],
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/physics/protocol.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: `src/physics/physics.worker.ts` 작성 (수동 검증 대상)**

```ts
import { PhysicsEngine } from "./PhysicsEngine";
import type { MainToWorker, WorkerToMain } from "./protocol";
import type { ForceParams } from "../types";

let engine: PhysicsEngine | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function post(msg: WorkerToMain, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

function stopLoop() {
  if (timer !== null) { clearInterval(timer); timer = null; }
}

function startLoop() {
  if (timer !== null || !engine) return;
  timer = setInterval(() => {
    if (!engine) return;
    try {
      engine.tick();
      const out = engine.positions.slice();
      post({ type: "tick", positions: out.buffer, alpha: engine.alpha }, [out.buffer]);
      if (engine.alpha < engine.alphaMin) { stopLoop(); post({ type: "stopped" }); }
    } catch (err) {
      stopLoop();
      post({ type: "error", message: String(err) });
    }
  }, 16);
}

self.onmessage = (ev: MessageEvent<MainToWorker>) => {
  const m = ev.data;
  switch (m.type) {
    case "init": {
      const positions = new Float32Array(m.positions);
      const edges = new Int32Array(m.edges);
      engine = new PhysicsEngine({ count: m.count, edges, positions, params: m.params as ForceParams });
      startLoop();
      break;
    }
    case "setParams": engine?.setParams(m.params); engine?.reheat(); startLoop(); break;
    case "pin": engine?.pin(m.index, m.x, m.y, m.z); engine?.reheat(); startLoop(); break;
    case "unpin": engine?.unpin(m.index); engine?.reheat(); startLoop(); break;
    case "reheat": engine?.reheat(); startLoop(); break;
    case "stop": stopLoop(); break;
  }
};
```

- [ ] **Step 6: `src/physics/PhysicsClient.ts` 작성 (워커 생성 + 폴백)**

```ts
import { PhysicsEngine } from "./PhysicsEngine";
import { initMessage, type MainToWorker, type WorkerToMain } from "./protocol";
import type { ForceParams } from "../types";

declare const process: { env: { WORKER_CODE: string } };

export interface PhysicsClientOpts {
  count: number;
  edges: Int32Array;
  positions: Float32Array;
  params: ForceParams;
  onTick: (positions: Float32Array, alpha: number) => void;
}

export class PhysicsClient {
  private worker: Worker | null = null;
  private fallback: PhysicsEngine | null = null;
  private raf = 0;

  constructor(private opts: PhysicsClientOpts) {
    try {
      const blob = new Blob([process.env.WORKER_CODE], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = (ev: MessageEvent<WorkerToMain>) => {
        const m = ev.data;
        if (m.type === "tick") this.opts.onTick(new Float32Array(m.positions), m.alpha);
        else if (m.type === "error") { console.error("[fast-graph-3d] worker:", m.message); this.startFallback(); }
      };
      this.worker.onerror = () => this.startFallback();
      const { msg, transfer } = initMessage(opts.count, opts.edges, opts.positions, opts.params);
      this.worker.postMessage(msg, transfer);
    } catch (err) {
      console.warn("[fast-graph-3d] worker unavailable, using main-thread fallback:", err);
      this.startFallback();
    }
  }

  private startFallback(): void {
    if (this.fallback) return;
    this.disposeWorker();
    this.fallback = new PhysicsEngine({
      count: this.opts.count,
      edges: this.opts.edges,
      positions: this.opts.positions.slice(),
      params: this.opts.params,
    });
    const loop = () => {
      if (!this.fallback) return;
      this.fallback.tick();
      this.opts.onTick(this.fallback.positions, this.fallback.alpha);
      if (this.fallback.alpha >= this.fallback.alphaMin) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private send(msg: MainToWorker): void {
    this.worker?.postMessage(msg);
  }

  setParams(params: Partial<ForceParams>): void {
    if (this.worker) this.send({ type: "setParams", params });
    else if (this.fallback) { this.fallback.setParams(params); this.fallback.reheat(); this.ensureFallbackLoop(); }
  }

  pin(index: number, x: number, y: number, z: number): void {
    if (this.worker) this.send({ type: "pin", index, x, y, z });
    else if (this.fallback) { this.fallback.pin(index, x, y, z); this.fallback.reheat(); this.ensureFallbackLoop(); }
  }

  unpin(index: number): void {
    if (this.worker) this.send({ type: "unpin", index });
    else this.fallback?.unpin(index);
  }

  reheat(): void {
    if (this.worker) this.send({ type: "reheat" });
    else if (this.fallback) { this.fallback.reheat(); this.ensureFallbackLoop(); }
  }

  private ensureFallbackLoop(): void {
    if (this.fallback && this.raf === 0) {
      const loop = () => {
        if (!this.fallback) return;
        this.fallback.tick();
        this.opts.onTick(this.fallback.positions, this.fallback.alpha);
        if (this.fallback.alpha >= this.fallback.alphaMin) this.raf = requestAnimationFrame(loop);
        else this.raf = 0;
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  private disposeWorker(): void {
    if (this.worker) { this.send({ type: "stop" }); this.worker.terminate(); this.worker = null; }
  }

  dispose(): void {
    this.disposeWorker();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fallback = null;
  }
}
```

- [ ] **Step 7: 빌드로 워커 인라인 동작 확인**

Run: `yarn build`
Expected: 에러 없음. `main.js`에 `process.env.WORKER_CODE` 자리에 워커 코드 문자열이 주입됨(grep으로 `onmessage` 포함 확인 가능).

- [ ] **Step 8: 커밋**

```bash
git add src/physics/protocol.ts src/physics/physics.worker.ts src/physics/PhysicsClient.ts tests/physics/protocol.test.ts
git commit -m "feat: 워커 프로토콜 + 물리 워커 + 폴백 가능한 PhysicsClient"
```

---

## Task 9: NodeLayer — InstancedMesh 노드

**Files:**
- Create: `src/render/NodeLayer.ts`
- Test: `tests/render/NodeLayer.test.ts`

**Interfaces:**
- Consumes: `three`, `PALETTE`(Task 3).
- Produces: `class NodeLayer { mesh: THREE.InstancedMesh; constructor(count: number); setColors(groupId: Uint16Array, groups: {color:string}[]): void; setSizes(degree: Uint16Array, base: number, scale: number): void; updatePositions(positions: Float32Array): void; dispose(): void }`

> 참고: Three.js의 InstancedMesh 행렬/색상 연산은 WebGL 컨텍스트 없이도 node에서 동작하므로 단위 테스트 가능하다.

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/render/NodeLayer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { NodeLayer } from "../../src/render/NodeLayer";

describe("NodeLayer", () => {
  it("creates an InstancedMesh with the given count", () => {
    const layer = new NodeLayer(3);
    expect(layer.mesh.count).toBe(3);
  });

  it("writes node positions into instance matrices", () => {
    const layer = new NodeLayer(2);
    layer.updatePositions(new Float32Array([5, 6, 7, -1, -2, -3]));
    const m = new THREE.Matrix4();
    layer.mesh.getMatrixAt(1, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(-1);
    expect(p.y).toBeCloseTo(-2);
    expect(p.z).toBeCloseTo(-3);
  });

  it("applies group colors per instance", () => {
    const layer = new NodeLayer(2);
    layer.setColors(Uint16Array.from([0, 1]), [{ color: "#ff0000" }, { color: "#00ff00" }]);
    const c = new THREE.Color();
    layer.mesh.getColorAt(0, c);
    expect(c.r).toBeCloseTo(1);
    expect(c.g).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/render/NodeLayer.test.ts`
Expected: FAIL — `NodeLayer` 미정의.

- [ ] **Step 3: 구현 작성 — `src/render/NodeLayer.ts`**

```ts
import * as THREE from "three";

export class NodeLayer {
  mesh: THREE.InstancedMesh;
  private geometry: THREE.SphereGeometry;
  private material: THREE.MeshBasicMaterial;
  private dummy = new THREE.Object3D();
  private sizes: Float32Array;

  constructor(count: number) {
    this.geometry = new THREE.SphereGeometry(1, 8, 6);
    this.material = new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.sizes = new Float32Array(count).fill(1);
  }

  setColors(groupId: Uint16Array, groups: { color: string }[]): void {
    const c = new THREE.Color();
    for (let i = 0; i < groupId.length; i++) {
      c.set(groups[groupId[i]]?.color ?? "#888888");
      this.mesh.setColorAt(i, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setSizes(degree: Uint16Array, base: number, scale: number): void {
    for (let i = 0; i < degree.length; i++) {
      this.sizes[i] = base + Math.sqrt(degree[i]) * scale;
    }
  }

  updatePositions(positions: Float32Array): void {
    const d = this.dummy;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      d.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const s = this.sizes[i];
      d.scale.set(s, s, s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/render/NodeLayer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/render/NodeLayer.ts tests/render/NodeLayer.test.ts
git commit -m "feat: InstancedMesh 노드 레이어(색상/크기/위치)"
```

---

## Task 10: EdgeLayer — LineSegments 엣지

**Files:**
- Create: `src/render/EdgeLayer.ts`
- Test: `tests/render/EdgeLayer.test.ts`

**Interfaces:**
- Consumes: `three`.
- Produces: `class EdgeLayer { segments: THREE.LineSegments; constructor(edges: Int32Array); updatePositions(positions: Float32Array): void; dispose(): void }`

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/render/EdgeLayer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { EdgeLayer } from "../../src/render/EdgeLayer";

describe("EdgeLayer", () => {
  it("allocates 2 vertices (6 floats) per edge", () => {
    const layer = new EdgeLayer(Int32Array.from([0, 1, 1, 2]));
    const attr = layer.segments.geometry.getAttribute("position");
    expect(attr.count).toBe(4); // 2 edges * 2 endpoints
  });

  it("copies endpoint coordinates from node positions", () => {
    const layer = new EdgeLayer(Int32Array.from([0, 1]));
    layer.updatePositions(new Float32Array([10, 0, 0, 0, 20, 0]));
    const a = layer.segments.geometry.getAttribute("position").array as Float32Array;
    expect([a[0], a[1], a[2]]).toEqual([10, 0, 0]);
    expect([a[3], a[4], a[5]]).toEqual([0, 20, 0]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/render/EdgeLayer.test.ts`
Expected: FAIL — `EdgeLayer` 미정의.

- [ ] **Step 3: 구현 작성 — `src/render/EdgeLayer.ts`**

```ts
import * as THREE from "three";

export class EdgeLayer {
  segments: THREE.LineSegments;
  private edges: Int32Array;
  private positions: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;

  constructor(edges: Int32Array) {
    this.edges = edges;
    const vertexCount = edges.length; // edges.length/2 엣지 * 2 정점 = edges.length 정점
    this.positions = new Float32Array(vertexCount * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.4 });
    this.segments = new THREE.LineSegments(this.geometry, this.material);
  }

  updatePositions(nodePositions: Float32Array): void {
    const out = this.positions;
    const edges = this.edges;
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      const o = e * 3;
      out[o] = nodePositions[a * 3];
      out[o + 1] = nodePositions[a * 3 + 1];
      out[o + 2] = nodePositions[a * 3 + 2];
      out[o + 3] = nodePositions[b * 3];
      out[o + 4] = nodePositions[b * 3 + 1];
      out[o + 5] = nodePositions[b * 3 + 2];
    }
    this.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/render/EdgeLayer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/render/EdgeLayer.ts tests/render/EdgeLayer.test.ts
git commit -m "feat: LineSegments 엣지 레이어"
```

---

## Task 11: Picker — raycast 피킹

**Files:**
- Create: `src/render/Picker.ts`
- Test: `tests/render/Picker.test.ts`

**Interfaces:**
- Consumes: `three`, `NodeLayer.mesh`(Task 9).
- Produces: `class Picker { constructor(camera: THREE.Camera, mesh: THREE.InstancedMesh); pick(ndcX: number, ndcY: number): number | null }` — NDC 좌표(-1..1)에서 가장 가까운 인스턴스 id 반환, 없으면 null.

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/render/Picker.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { NodeLayer } from "../../src/render/NodeLayer";
import { Picker } from "../../src/render/Picker";

describe("Picker", () => {
  it("picks the instance under the camera center", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const layer = new NodeLayer(2);
    layer.setSizes(Uint16Array.from([0, 0]), 3, 0); // 반지름 3
    // 0번은 원점, 1번은 화면 밖 멀리
    layer.updatePositions(new Float32Array([0, 0, 0, 1000, 1000, 0]));

    const picker = new Picker(camera, layer.mesh);
    expect(picker.pick(0, 0)).toBe(0);
  });

  it("returns null when nothing is hit", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const layer = new NodeLayer(1);
    layer.setSizes(Uint16Array.from([0]), 1, 0);
    layer.updatePositions(new Float32Array([0, 0, 0]));
    const picker = new Picker(camera, layer.mesh);
    expect(picker.pick(0.99, 0.99)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/render/Picker.test.ts`
Expected: FAIL — `Picker` 미정의.

- [ ] **Step 3: 구현 작성 — `src/render/Picker.ts`**

```ts
import * as THREE from "three";

export class Picker {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(private camera: THREE.Camera, private mesh: THREE.InstancedMesh) {}

  pick(ndcX: number, ndcY: number): number | null {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    for (const h of hits) {
      if (h.instanceId !== undefined && h.instanceId !== null) return h.instanceId;
    }
    return null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/render/Picker.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/render/Picker.ts tests/render/Picker.test.ts
git commit -m "feat: raycast 인스턴스 피커"
```

---

## Task 12: GraphRenderer — 씬/카메라/컨트롤/루프

**Files:**
- Create: `src/render/GraphRenderer.ts`
- Modify: `package.json`(three examples 경로는 three에 포함되어 추가 의존성 없음)

**Interfaces:**
- Consumes: `NodeLayer`(9), `EdgeLayer`(10), `Picker`(11), `GraphModel`(2), `RenderSettings`(types), `three/examples/jsm/controls/OrbitControls`.
- Produces:
  - `class GraphRenderer { constructor(container: HTMLElement, model: GraphModel, groups: {color:string}[], settings: RenderSettings); updatePositions(positions: Float32Array): void; setHover(index: number | null): void; pickAt(clientX: number, clientY: number): number | null; onResize(): void; start(): void; stop(): void; dispose(): void; readonly camera: THREE.Camera }`

> WebGL 컨텍스트가 필요하므로 단위 테스트 대신 Task 14 통합 후 실제 vault에서 수동 검증한다.

- [ ] **Step 1: 구현 작성 — `src/render/GraphRenderer.ts`**

```ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { NodeLayer } from "./NodeLayer";
import { EdgeLayer } from "./EdgeLayer";
import { Picker } from "./Picker";
import type { GraphModel } from "../data/GraphModel";
import type { RenderSettings } from "../types";

export class GraphRenderer {
  readonly camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private controls: OrbitControls;
  private nodes: NodeLayer;
  private edges: EdgeLayer;
  private picker: Picker;
  private raf = 0;
  private latest: Float32Array | null = null;
  private hoverIndex: number | null = null;

  constructor(
    private container: HTMLElement,
    private model: GraphModel,
    groups: { color: string }[],
    settings: RenderSettings
  ) {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100000);
    const span = Math.cbrt(model.count) * 60 + 100;
    this.camera.position.set(0, 0, span);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.nodes = new NodeLayer(model.count);
    this.nodes.setColors(model.groupId, groups);
    this.nodes.setSizes(model.degree, settings.nodeBaseSize, settings.nodeDegreeScale);
    this.edges = new EdgeLayer(model.edges);
    this.picker = new Picker(this.camera, this.nodes.mesh);

    this.scene.add(this.edges.segments);
    this.scene.add(this.nodes.mesh);
    this.updatePositions(model.positions);
  }

  updatePositions(positions: Float32Array): void {
    this.latest = positions;
  }

  setHover(index: number | null): void {
    this.hoverIndex = index;
  }

  pickAt(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    return this.picker.pick(ndcX, ndcY);
  }

  onResize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  start(): void {
    if (this.raf) return;
    const loop = () => {
      this.controls.update();
      if (this.latest) {
        this.nodes.updatePositions(this.latest);
        this.edges.updatePositions(this.latest);
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.controls.dispose();
    this.nodes.dispose();
    this.edges.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
```

- [ ] **Step 2: 빌드 통과 확인 (타입/번들)**

Run: `yarn build`
Expected: 에러 없음. (실제 렌더 동작은 Task 14 후 수동 검증.)

- [ ] **Step 3: 커밋**

```bash
git add src/render/GraphRenderer.ts
git commit -m "feat: GraphRenderer 씬/카메라/OrbitControls/렌더 루프"
```

---

## Task 13: hover — 호버 상태 계산(순수)

**Files:**
- Create: `src/interaction/hover.ts`
- Test: `tests/interaction/hover.test.ts`

**Interfaces:**
- Consumes: `GraphModel`(2).
- Produces: `function neighborsOf(model: GraphModel, index: number): Set<number>` — 해당 노드의 직접 이웃 인덱스 집합(자기 자신 포함). 하이라이트 계산에 사용.

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/interaction/hover.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildGraphModel } from "../../src/data/GraphModel";
import { neighborsOf } from "../../src/interaction/hover";

const model = buildGraphModel({ "a.md": { "b.md": 1, "c.md": 1 }, "b.md": {}, "c.md": {} });
const idx = (p: string) => model.pathToIndex.get(p)!;

describe("neighborsOf", () => {
  it("includes self and direct neighbors", () => {
    expect(neighborsOf(model, idx("a.md"))).toEqual(
      new Set([idx("a.md"), idx("b.md"), idx("c.md")])
    );
  });

  it("returns just self for an isolated-from-others node's leaf", () => {
    expect(neighborsOf(model, idx("b.md"))).toEqual(new Set([idx("b.md"), idx("a.md")]));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `yarn vitest run tests/interaction/hover.test.ts`
Expected: FAIL — `neighborsOf` 미정의.

- [ ] **Step 3: 구현 작성 — `src/interaction/hover.ts`**

```ts
import type { GraphModel } from "../data/GraphModel";

export function neighborsOf(model: GraphModel, index: number): Set<number> {
  const result = new Set<number>([index]);
  for (let e = 0; e < model.edgeCount; e++) {
    const a = model.edges[e * 2];
    const b = model.edges[e * 2 + 1];
    if (a === index) result.add(b);
    else if (b === index) result.add(a);
  }
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `yarn vitest run tests/interaction/hover.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/interaction/hover.ts tests/interaction/hover.test.ts
git commit -m "feat: 호버 이웃 계산"
```

---

## Task 14: Graph3DView — ItemView 조립 + 상호작용 배선

**Files:**
- Create: `src/view/Graph3DView.ts`

**Interfaces:**
- Consumes: `GraphDataProvider`(5), `computeGrouping`(3), `PhysicsClient`(8), `GraphRenderer`(12), `extractLocalGraph`(4), `neighborsOf`(13), Obsidian `ItemView`/`WorkspaceLeaf`/`TFile`.
- Produces:
  - `const VIEW_TYPE_3D_GRAPH = "fast-graph-3d-view"`
  - `class Graph3DView extends ItemView { constructor(leaf, app, settings); getViewType(); getDisplayText(); onOpen(); onClose(); setLocalMode(enabled: boolean): void; refresh(): void }`

> WebGL/Worker가 필요하므로 단위 테스트 대신 실제 vault에서 수동 검증한다.

- [ ] **Step 1: 구현 작성 — `src/view/Graph3DView.ts`**

```ts
import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { GraphDataProvider } from "../data/GraphDataProvider";
import { computeGrouping } from "../data/grouping";
import { PhysicsClient } from "../physics/PhysicsClient";
import { GraphRenderer } from "../render/GraphRenderer";
import { extractLocalGraph } from "../interaction/localGraph";
import type { GraphModel } from "../data/GraphModel";
import { FORCE_DEFAULTS, type RenderSettings } from "../types";

export const VIEW_TYPE_3D_GRAPH = "fast-graph-3d-view";

export class Graph3DView extends ItemView {
  private provider: GraphDataProvider;
  private renderer: GraphRenderer | null = null;
  private physics: PhysicsClient | null = null;
  private model: GraphModel | null = null;
  private detachChange: (() => void) | null = null;
  private localMode = false;
  private resizeObserver: ResizeObserver | null = null;
  private label: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private settings: RenderSettings) {
    super(leaf);
    this.provider = new GraphDataProvider(this.app, settings);
  }

  getViewType(): string { return VIEW_TYPE_3D_GRAPH; }
  getDisplayText(): string { return "Fast 3D Graph"; }
  getIcon(): string { return "git-fork"; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.style.position = "relative";
    root.style.height = "100%";

    this.label = root.createDiv({ cls: "fast-graph-3d-label" });
    this.label.style.position = "absolute";
    this.label.style.pointerEvents = "none";
    this.label.style.padding = "2px 6px";
    this.label.style.background = "var(--background-secondary)";
    this.label.style.borderRadius = "4px";
    this.label.style.display = "none";
    this.label.style.zIndex = "10";

    this.build(root);

    this.detachChange = this.provider.onChange(() => this.refresh());
    this.resizeObserver = new ResizeObserver(() => this.renderer?.onResize());
    this.resizeObserver.observe(root);
  }

  private build(root: HTMLElement): void {
    const full = this.provider.build();
    let model = full;
    if (this.localMode) {
      const file = this.app.workspace.getActiveFile();
      if (file) model = this.subgraph(full, file.path);
    }
    this.model = model;

    const tagsByPath = new Map<string, string[]>();
    const grouping = computeGrouping(model.paths, tagsByPath, this.settings.groupBy);
    const container = root.createDiv();
    container.style.height = "100%";

    this.renderer = new GraphRenderer(container, model, grouping.groups, this.settings);
    this.renderer.start();

    this.physics = new PhysicsClient({
      count: model.count,
      edges: model.edges,
      positions: model.positions,
      params: { ...FORCE_DEFAULTS },
      onTick: (positions) => this.renderer?.updatePositions(positions),
    });

    this.wireInteraction(container);
  }

  private subgraph(full: GraphModel, rootPath: string): GraphModel {
    const keep = extractLocalGraph(full, rootPath, this.settings.localGraphDepth);
    // 인덱스 재매핑
    const oldToNew = new Map<number, number>();
    const paths: string[] = [];
    for (const oldIdx of keep) {
      oldToNew.set(oldIdx, paths.length);
      paths.push(full.paths[oldIdx]);
    }
    const resolved: Record<string, Record<string, number>> = {};
    for (let e = 0; e < full.edgeCount; e++) {
      const a = full.edges[e * 2], b = full.edges[e * 2 + 1];
      if (keep.has(a) && keep.has(b)) {
        (resolved[full.paths[a]] ??= {})[full.paths[b]] = 1;
      }
    }
    for (const p of paths) resolved[p] ??= {};
    // GraphModel 재빌드(시드/그룹은 build()와 동일 경로 사용 위해 간단 재구성)
    const { buildGraphModel, seedPositions } = require("../data/GraphModel");
    const m: GraphModel = buildGraphModel(resolved);
    seedPositions(m, 1);
    return m;
  }

  private wireInteraction(container: HTMLElement): void {
    container.addEventListener("mousemove", (ev) => {
      if (!this.renderer || !this.model || !this.settings.showLabels) return;
      const id = this.renderer.pickAt(ev.clientX, ev.clientY);
      if (id === null) { if (this.label) this.label.style.display = "none"; return; }
      if (this.label) {
        this.label.textContent = this.model.paths[id];
        this.label.style.left = ev.offsetX + 12 + "px";
        this.label.style.top = ev.offsetY + 12 + "px";
        this.label.style.display = "block";
      }
    });
    container.addEventListener("click", (ev) => {
      if (!this.renderer || !this.model) return;
      const id = this.renderer.pickAt(ev.clientX, ev.clientY);
      if (id === null) return;
      const path = this.model.paths[id];
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) this.app.workspace.getLeaf(false).openFile(file);
    });
  }

  setLocalMode(enabled: boolean): void {
    this.localMode = enabled;
    this.refresh();
  }

  refresh(): void {
    try {
      this.physics?.dispose();
      this.renderer?.dispose();
      this.physics = null;
      this.renderer = null;
      const root = this.contentEl;
      // label은 유지, 그래프 컨테이너만 교체
      Array.from(root.children).forEach((c) => { if (c !== this.label) c.remove(); });
      this.build(root);
    } catch (err) {
      new Notice("Fast 3D Graph: 갱신 중 오류 — 콘솔 확인");
      console.error("[fast-graph-3d]", err);
    }
  }

  async onClose(): Promise<void> {
    this.detachChange?.();
    this.resizeObserver?.disconnect();
    this.physics?.dispose();
    this.renderer?.dispose();
    this.provider.dispose();
  }
}
```

> 참고: `subgraph()`의 `require` 대신 파일 상단 import를 사용해도 된다(번들러가 처리). 명확성을 위해 상단 import로 옮기는 것을 권장: `import { buildGraphModel, seedPositions } from "../data/GraphModel";`

- [ ] **Step 2: 상단 import로 정리**

`src/view/Graph3DView.ts` 상단 import에 추가하고 `subgraph()` 내부 `require` 줄 삭제:
```ts
import { buildGraphModel, seedPositions, type GraphModel } from "../data/GraphModel";
```
(기존 `import type { GraphModel }` 줄은 위 한 줄로 대체.)

- [ ] **Step 3: 빌드 확인**

Run: `yarn build`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/view/Graph3DView.ts
git commit -m "feat: Graph3DView 조립 + 호버/클릭/로컬모드 배선"
```

---

## Task 15: main.ts + settings — 플러그인 등록

**Files:**
- Modify: `src/main.ts`
- Create: `src/settings.ts`

**Interfaces:**
- Consumes: `Graph3DView`/`VIEW_TYPE_3D_GRAPH`(14), `RenderSettings`/`RENDER_DEFAULTS`(types).
- Produces:
  - `src/main.ts`: 기본 export 플러그인. onload에서 뷰/리본/커맨드/설정탭 등록, `activateView()`.
  - `src/settings.ts`: `class FastGraphSettingTab extends PluginSettingTab`.

- [ ] **Step 1: `src/settings.ts` 작성**

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type FastGraphPlugin from "./main";
import type { GroupBy } from "./types";

export class FastGraphSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: FastGraphPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("색상 그룹 기준")
      .setDesc("노드 색상을 폴더/태그/없음 중 무엇으로 묶을지")
      .addDropdown((d) =>
        d
          .addOptions({ folder: "폴더", tag: "태그", none: "없음" })
          .setValue(this.plugin.settings.groupBy)
          .onChange(async (v) => {
            this.plugin.settings.groupBy = v as GroupBy;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("로컬 그래프 깊이")
      .setDesc("로컬 모드에서 펼칠 이웃 단계 수")
      .addSlider((s) =>
        s
          .setLimits(1, 4, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.localGraphDepth)
          .onChange(async (v) => {
            this.plugin.settings.localGraphDepth = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("노드 크기 (degree 스케일)")
      .addSlider((s) =>
        s
          .setLimits(0, 3, 0.1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.nodeDegreeScale)
          .onChange(async (v) => {
            this.plugin.settings.nodeDegreeScale = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("호버 라벨 표시")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showLabels).onChange(async (v) => {
          this.plugin.settings.showLabels = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("최대 노드 수")
      .setDesc("이 수를 넘으면 경고를 표시")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.maxNodes)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.maxNodes = n;
            await this.plugin.saveSettings();
          }
        })
      );
  }
}
```

- [ ] **Step 2: `src/main.ts` 작성**

```ts
import { Plugin, WorkspaceLeaf } from "obsidian";
import { Graph3DView, VIEW_TYPE_3D_GRAPH } from "./view/Graph3DView";
import { FastGraphSettingTab } from "./settings";
import { RENDER_DEFAULTS, type RenderSettings } from "./types";

export default class FastGraphPlugin extends Plugin {
  settings: RenderSettings = { ...RENDER_DEFAULTS };

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_3D_GRAPH, (leaf: WorkspaceLeaf) => new Graph3DView(leaf, this.settings));

    this.addRibbonIcon("git-fork", "Fast 3D Graph 열기", () => this.activateView(false));

    this.addCommand({
      id: "open-fast-3d-graph",
      name: "3D 그래프 열기",
      callback: () => this.activateView(false),
    });

    this.addCommand({
      id: "open-fast-3d-graph-local",
      name: "3D 로컬 그래프 열기",
      callback: () => this.activateView(true),
    });

    this.addSettingTab(new FastGraphSettingTab(this.app, this));
  }

  async activateView(local: boolean): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_3D_GRAPH)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_3D_GRAPH, active: true });
    }
    workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof Graph3DView) view.setLocalMode(local);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, RENDER_DEFAULTS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_3D_GRAPH)) {
      if (leaf.view instanceof Graph3DView) leaf.view.refresh();
    }
  }

  onunload(): void {}
}
```

- [ ] **Step 3: 빌드 + 전체 테스트 확인**

Run: `yarn build && yarn test`
Expected: 빌드 성공, 모든 vitest 통과.

- [ ] **Step 4: 실제 vault 수동 검증**

1. 빌드 산출물(`main.js`, `manifest.json`)을 테스트 vault의 `.obsidian/plugins/fast-graph-3d/`에 복사(또는 심볼릭 링크).
2. Obsidian에서 플러그인 활성화 → 리본 아이콘 클릭.
3. 확인: 3D 그래프가 뜨고, 마우스 드래그로 회전/줌, 노드 호버 시 경로 라벨, 클릭 시 노트 열림, 폴더별 색상 구분, 잠시 후 시뮬레이션이 안정되어 멈춤.
4. "3D 로컬 그래프 열기" 커맨드 → 활성 노트 주변만 표시 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/main.ts src/settings.ts
git commit -m "feat: 플러그인 등록(뷰/리본/커맨드) + 설정 탭"
```

---

## Task 16: 성능 하니스 — 합성 10k 벤치마크

**Files:**
- Create: `tests/perf/benchmark.test.ts`

**Interfaces:**
- Consumes: `buildGraphModel`/`seedPositions`(2), `PhysicsEngine`(7).
- Produces: 합성 10k 그래프에서 평균 tick 시간을 측정하고 임계 이내인지 검증(회귀 가드).

- [ ] **Step 1: 벤치마크 테스트 작성 — `tests/perf/benchmark.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildGraphModel, seedPositions } from "../../src/data/GraphModel";
import { PhysicsEngine } from "../../src/physics/PhysicsEngine";
import { FORCE_DEFAULTS } from "../../src/types";

function syntheticLinks(n: number, avgDeg: number): Record<string, Record<string, number>> {
  const links: Record<string, Record<string, number>> = {};
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < n; i++) links[`n${i}.md`] = {};
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < avgDeg; k++) {
      const j = Math.floor(rand() * n);
      if (j !== i) links[`n${i}.md`][`n${j}.md`] = 1;
    }
  }
  return links;
}

describe("perf harness", () => {
  it("ticks a 10k-node graph within a sane time budget", () => {
    const model = buildGraphModel(syntheticLinks(10000, 3));
    seedPositions(model, 1);
    const engine = new PhysicsEngine({
      count: model.count,
      edges: model.edges,
      positions: model.positions,
      params: { ...FORCE_DEFAULTS },
    });
    // 워밍업
    for (let i = 0; i < 3; i++) engine.tick();
    const start = performance.now();
    const N = 10;
    for (let i = 0; i < N; i++) engine.tick();
    const perTick = (performance.now() - start) / N;
    console.log(`[perf] 10k nodes avg tick = ${perTick.toFixed(2)} ms`);
    // CI 환경 편차를 고려한 느슨한 회귀 가드(목표는 << 100ms)
    expect(perTick).toBeLessThan(250);
  });
});
```

- [ ] **Step 2: 벤치마크 실행**

Run: `yarn vitest run tests/perf/benchmark.test.ts`
Expected: PASS, 콘솔에 `[perf] 10k nodes avg tick = N ms` 출력. (수치를 README/이슈에 기록.)

- [ ] **Step 3: 커밋**

```bash
git add tests/perf/benchmark.test.ts
git commit -m "test: 10k 노드 물리 tick 성능 하니스"
```

---

## Self-Review 결과 (계획 작성자 점검)

**Spec coverage:**
- 대규모 탐색/10k/실시간 물리 → Task 6,7,8,16 ✓
- Three.js+워커 스택 → Task 8,9,10,12 ✓
- 노드 클릭→노트 열기 + 호버 라벨 → Task 11,13,14 ✓
- 폴더/태그 색상 그룹화 → Task 3,9 ✓
- 로컬 그래프 모드 → Task 4,14,15 ✓
- 설정 탭 → Task 15 ✓
- 디커플링/typed array/alpha decay 정지 → Task 7,8,12 ✓
- 에러 처리(워커 실패 폴백, 빈 vault, 갱신 오류) → Task 8(PhysicsClient 폴백),14(refresh try/catch) ✓
- 증분 갱신(Patch) → **v1에서는 onChange 시 전체 재빌드(refresh)로 단순화**. 진정한 증분 `Patch` 메시지는 이후 최적화로 미룸(범위 경계의 "성능 최적화" 항목). 이 단순화는 의도적이며 스펙의 디커플링/정지 목표에는 영향 없음.
- SharedArrayBuffer 무복사 경로 → **v1은 transferable double-buffer만 구현**(PhysicsClient/worker). SAB는 이후 최적화로 미룸. 폴백 규약은 충족.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 문구 없음. ✓

**Type consistency:** `GraphModel` 필드/`ForceParams` 키/`PhysicsEngine`·`PhysicsClient` 메서드명/`NodeLayer`·`EdgeLayer`·`Picker` 시그니처가 태스크 간 일치. `initMessage` 반환형이 worker `init` 처리와 일치. ✓

**의도적 v1 단순화(스펙 대비 명시):**
- 증분 `Patch` → 전체 refresh로 대체(이후 최적화).
- SharedArrayBuffer 무복사 → transferable만(이후 최적화).
- WebGL 컨텍스트 손실 복구 → v1 미구현(이후). 워커/갱신 실패 폴백은 구현.

이 단순화들은 모두 스펙 "범위 경계" 표의 *이후(deferred)* 정신에 부합하며, v1의 동작 가능·테스트 가능 소프트웨어 목표를 해치지 않는다.
