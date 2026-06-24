import { describe, it, expect } from "vitest";
import { buildGraphModel, seedPositions } from "../../src/data/GraphModel";
import { PhysicsEngine } from "../../src/physics/PhysicsEngine";
import { WasmPhysics } from "../../src/physics/WasmPhysics";
import { FORCE_DEFAULTS } from "../../src/types";

function synth(n: number, hubs: number) {
  let s = 7;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const links: Record<string, Record<string, number>> = {};
  for (let i = 0; i < n; i++) links[`n${i}`] = {};
  for (let i = 0; i < n; i++) { const d = 1 + Math.floor(r() * 3); for (let k = 0; k < d; k++) { const j = Math.floor(r() * n); if (j !== i) links[`n${i}`][`n${j}`] = 1; } }
  for (let h = 0; h < hubs; h++) for (let k = 0; k < 250; k++) { const j = Math.floor(r() * n); if (j !== h) links[`n${h}`][`n${j}`] = 1; }
  return links;
}

async function bench(n: number) {
  const model = buildGraphModel(synth(n, 5));
  seedPositions(model, 1);
  const params = { ...FORCE_DEFAULTS };

  const js = new PhysicsEngine({ count: model.count, edges: model.edges, positions: model.positions.slice(), groupId: model.groupId, params });
  for (let i = 0; i < 3; i++) js.tick();
  let t = performance.now();
  for (let i = 0; i < 10; i++) js.tick();
  const jsMs = (performance.now() - t) / 10;

  const wp = await WasmPhysics.create({ count: model.count, edges: model.edges, positions: model.positions.slice(), groupId: model.groupId, params });
  for (let i = 0; i < 3; i++) wp.tick();
  t = performance.now();
  for (let i = 0; i < 10; i++) wp.tick();
  const wasmMs = (performance.now() - t) / 10;

  return { n: model.count, jsMs, wasmMs, speedup: jsMs / wasmMs };
}

describe("PERF: WASM vs JS tick", () => {
  it("20k", async () => {
    const r = await bench(20000);
    console.log(`[bench] 20k  JS=${r.jsMs.toFixed(1)}ms  WASM=${r.wasmMs.toFixed(1)}ms  speedup=${r.speedup.toFixed(2)}x`);
    expect(r.wasmMs).toBeLessThan(r.jsMs); // WASM가 더 빠름
  });
  it("50k", async () => {
    const r = await bench(50000);
    console.log(`[bench] 50k  JS=${r.jsMs.toFixed(1)}ms  WASM=${r.wasmMs.toFixed(1)}ms  speedup=${r.speedup.toFixed(2)}x`);
    expect(r.wasmMs).toBeLessThan(r.jsMs);
  });
});
