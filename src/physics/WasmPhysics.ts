import type { ForceParams } from "../types";

declare const process: { env: { PHYSICS_WASM_B64?: string } };

interface PhysicsExports {
  memory: WebAssembly.Memory;
  allocate(count: number, edgeCount: number, numGroups: number): void;
  positionsPtr(): number;
  velocitiesPtr(): number;
  edgesPtr(): number;
  groupIdPtr(): number;
  setParams(rep: number, ls: number, ld: number, grav: number, damp: number, th: number, gc: number, gs: number): void;
  setAlpha(a: number): void;
  getAlpha(): number;
  reheat(): void;
  pin(i: number, x: number, y: number, z: number): void;
  unpin(i: number): void;
  tick(): number;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function loadWasmBytes(): Promise<Uint8Array> {
  // esbuild가 워커 번들 시 process.env.PHYSICS_WASM_B64를 base64 문자열 리터럴로 교체.
  // 브라우저 워커에는 process가 없으므로 typeof process 가드를 쓰면 안 됨 — 직접 참조.
  const b64 = process.env.PHYSICS_WASM_B64;
  if (b64) return base64ToBytes(b64);
  // Node(테스트) 폴백: 빌드 산출물을 직접 읽는다.
  const fs = await import("node:fs");
  return new Uint8Array(fs.readFileSync("build/physics.wasm"));
}

export class WasmPhysics {
  readonly alphaMin = 0.005;
  private e: PhysicsExports;
  private count: number;
  private params: ForceParams;

  private constructor(e: PhysicsExports, count: number, params: ForceParams) {
    this.e = e;
    this.count = count;
    this.params = { ...params };
  }

  static async create(opts: {
    count: number; edges: Int32Array; positions: Float32Array; groupId: Uint16Array; params: ForceParams;
  }): Promise<WasmPhysics> {
    const bytes = await loadWasmBytes();
    const wasmResult = await (WebAssembly.instantiate as (bytes: BufferSource, importObject?: WebAssembly.Imports) => Promise<WebAssembly.WebAssemblyInstantiatedSource>)(bytes as unknown as ArrayBuffer, {
      env: { abort: (_msg: unknown, _file: unknown, line: unknown, col: unknown) => { throw new Error(`wasm abort @ ${line}:${col}`); } },
    });
    const e = wasmResult.instance.exports as unknown as PhysicsExports;
    let numGroups = 1;
    for (let i = 0; i < opts.count; i++) if (opts.groupId[i] + 1 > numGroups) numGroups = opts.groupId[i] + 1;
    e.allocate(opts.count, opts.edges.length / 2, numGroups);
    const buf = e.memory.buffer;
    new Float32Array(buf, e.positionsPtr(), opts.count * 3).set(opts.positions);
    new Int32Array(buf, e.edgesPtr(), opts.edges.length).set(opts.edges);
    new Uint16Array(buf, e.groupIdPtr(), opts.count).set(opts.groupId);
    const p = opts.params;
    e.setParams(p.repulsion, p.linkStrength, p.linkDistance, p.gravity, p.damping, p.theta, p.groupCohesion, p.groupSeparation);
    e.setAlpha(1);
    return new WasmPhysics(e, opts.count, opts.params);
  }

  get positions(): Float32Array {
    // 메모리는 allocate 이후 성장하지 않으므로 뷰는 안정적이나, 안전하게 매번 재생성.
    return new Float32Array(this.e.memory.buffer, this.e.positionsPtr(), this.count * 3);
  }

  get alpha(): number { return this.e.getAlpha(); }

  tick(): void { this.e.tick(); }

  setParams(p: Partial<ForceParams>): void {
    this.params = { ...this.params, ...p };
    const q = this.params;
    this.e.setParams(q.repulsion, q.linkStrength, q.linkDistance, q.gravity, q.damping, q.theta, q.groupCohesion, q.groupSeparation);
  }

  pin(i: number, x: number, y: number, z: number): void { this.e.pin(i, x, y, z); }
  unpin(i: number): void { this.e.unpin(i); }
  reheat(): void { this.e.reheat(); }
}
