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
