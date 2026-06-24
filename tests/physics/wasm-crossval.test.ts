import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { PhysicsEngine } from "../../src/physics/PhysicsEngine";
import { FORCE_DEFAULTS, type ForceParams } from "../../src/types";

// WASM 인스턴스를 JS 친화 핸들로 감싼다.
async function loadWasm() {
  const bytes = readFileSync("build/physics.wasm");
  const imports = {
    env: {
      abort: (_msg: unknown, _file: unknown, _line: unknown, _col: unknown) => {
        throw new Error("wasm abort");
      },
    },
  };
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  const e = instance.exports as Record<string, unknown> & { memory: WebAssembly.Memory };
  return e;
}

function makeGraph() {
  // a-b-c 체인 + d 고립, 그룹 2개
  const count = 4;
  const edges = Int32Array.from([0, 1, 1, 2]);
  const groupId = Uint16Array.from([0, 0, 1, 1]);
  const positions = new Float32Array([-30, 5, 0, 10, -8, 4, 25, 12, -6, -15, -20, 9]);
  return { count, edges, groupId, positions };
}

// WASM에 그래프를 적재하고 파라미터/alpha 설정.
function loadGraphIntoWasm(e: any, g: ReturnType<typeof makeGraph>, params: ForceParams, alpha: number) {
  const numGroups = g.groupId.reduce((m, v) => Math.max(m, v), 0) + 1;
  e.allocate(g.count, g.edges.length / 2, numGroups);
  const buf = e.memory.buffer as ArrayBuffer;
  const posView = new Float32Array(buf, e.positionsPtr(), g.count * 3);
  const edgeView = new Int32Array(buf, e.edgesPtr(), g.edges.length);
  const groupView = new Uint16Array(buf, e.groupIdPtr(), g.count);
  posView.set(g.positions);
  edgeView.set(g.edges);
  groupView.set(g.groupId);
  e.setParams(params.repulsion, params.linkStrength, params.linkDistance, params.gravity,
    params.damping, params.theta, params.groupCohesion, params.groupSeparation);
  e.setAlpha(alpha);
  return () => new Float32Array(buf, e.positionsPtr(), g.count * 3); // 최신 뷰(메모리 성장 대비)
}

function jsOneTick(g: ReturnType<typeof makeGraph>, params: ForceParams, alpha: number) {
  const engine = new PhysicsEngine({
    count: g.count, edges: g.edges, positions: g.positions.slice(), groupId: g.groupId, params,
  });
  engine.alpha = alpha;
  engine.tick();
  return engine.positions;
}

function expectClose(a: Float32Array, b: Float32Array, tol: number) {
  for (let i = 0; i < a.length; i++) {
    expect(Math.abs(a[i] - b[i])).toBeLessThan(tol);
  }
}

describe("WASM vs JS 교차 검증 (1틱)", () => {
  let e: any;
  beforeAll(async () => { e = await loadWasm(); });

  const cases: Array<[string, Partial<ForceParams>]> = [
    ["gravity만", { repulsion: 0, linkStrength: 0, groupCohesion: 0, groupSeparation: 0 }],
    ["spring만", { repulsion: 0, gravity: 0, groupCohesion: 0, groupSeparation: 0 }],
    ["repulsion만", { linkStrength: 0, gravity: 0, groupCohesion: 0, groupSeparation: 0 }],
    ["group만", { repulsion: 0, linkStrength: 0, gravity: 0 }],
    ["전체", {}],
  ];

  for (const [name, override] of cases) {
    it(`${name}: 1틱 후 positions가 JS와 일치`, () => {
      const g = makeGraph();
      const params: ForceParams = { ...FORCE_DEFAULTS, ...override };
      const alpha = 0.8;
      const getPos = loadGraphIntoWasm(e, g, params, alpha);
      (e.tick as () => number)();
      const wasmPos = getPos();
      const jsPos = jsOneTick(g, params, alpha);
      expectClose(wasmPos, jsPos, 1e-3);
    });
  }
});

import { WasmPhysics } from "../../src/physics/WasmPhysics";

describe("WasmPhysics 래퍼", () => {
  it("PhysicsEngine과 동일하게 1틱 후 positions 일치 + alpha 감쇠", async () => {
    const g = makeGraph();
    const params = { ...FORCE_DEFAULTS };
    const wp = await WasmPhysics.create({
      count: g.count, edges: g.edges, positions: g.positions.slice(), groupId: g.groupId, params,
    });
    wp.reheat();
    const a0 = wp.alpha;
    wp.tick();
    expect(wp.alpha).toBeLessThan(a0);
    const js = jsOneTick(g, params, 1.0);
    expectClose(wp.positions, js, 1e-3);
  });
});
