import { PhysicsEngine } from "./PhysicsEngine";
import { WasmPhysics } from "./WasmPhysics";
import type { MainToWorker, WorkerToMain } from "./protocol";
import type { ForceParams } from "../types";

// WASM/JS 공통으로 쓰는 최소 인터페이스
interface Engine {
  readonly positions: Float32Array;
  readonly alpha: number;
  readonly alphaMin: number;
  tick(): void;
  setParams(p: Partial<ForceParams>): void;
  pin(i: number, x: number, y: number, z: number): void;
  unpin(i: number): void;
  reheat(): void;
}

let engine: Engine | null = null;
let timer: number | null = null;

function post(msg: WorkerToMain, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}
function stopLoop() {
  if (timer !== null) { self.clearInterval(timer); timer = null; }
}
function startLoop() {
  if (timer !== null || !engine) return;
  timer = self.setInterval(() => {
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
      stopLoop();
      engine = null;
      const positions = new Float32Array(m.positions);
      const edges = new Int32Array(m.edges);
      const groupId = new Uint16Array(m.groupId);
      // WASM 우선, 실패 시 JS 폴백
      WasmPhysics.create({ count: m.count, edges, positions, groupId, params: m.params })
        .then((wp) => { console.info("[fast-graph-3d] WASM physics 활성"); engine = wp; startLoop(); })
        .catch((err: unknown) => {
          console.warn("[fast-graph-3d] WASM 물리 불가, JS 폴백:", err);
          engine = new PhysicsEngine({ count: m.count, edges, positions, groupId, params: m.params });
          startLoop();
        });
      break;
    }
    case "setParams": engine?.setParams(m.params); engine?.reheat(); startLoop(); break;
    case "pin": engine?.pin(m.index, m.x, m.y, m.z); engine?.reheat(); startLoop(); break;
    case "unpin": engine?.unpin(m.index); engine?.reheat(); startLoop(); break;
    case "reheat": engine?.reheat(); startLoop(); break;
    case "stop": stopLoop(); break;
  }
};
