import { PhysicsEngine } from "./PhysicsEngine";
import type { MainToWorker, WorkerToMain } from "./protocol";

let engine: PhysicsEngine | null = null;
let timer: number | null = null;

function post(msg: WorkerToMain, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

function stopLoop() {
  // Web Worker 컨텍스트라 window가 없어 self의 타이머 API를 사용한다.
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
      const positions = new Float32Array(m.positions);
      const edges = new Int32Array(m.edges);
      const groupId = new Uint16Array(m.groupId);
      engine = new PhysicsEngine({ count: m.count, edges, positions, groupId, params: m.params });
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
