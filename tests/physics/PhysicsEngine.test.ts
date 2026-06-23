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

  it("stays numerically bounded with high-degree hub nodes (no explosion)", () => {
    // 실제 노트 vault엔 degree가 큰 허브(MOC/인덱스)가 있다. 허브는 스프링 강성이
    // degree*linkStrength로 매우 커서, per-tick 변위 상한이 없으면 explicit Euler가
    // 발산해 좌표가 ~1e30까지 폭발한다(실제 vault 첫 실행 버그 재현).
    const count = 400;
    const positions = new Float32Array(count * 3);
    let s = 1;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rnd() * 2 - 1) * 200;
      positions[i * 3 + 1] = (rnd() * 2 - 1) * 200;
      positions[i * 3 + 2] = (rnd() * 2 - 1) * 200;
    }
    const edges: number[] = [];
    for (let i = 1; i < count; i++) edges.push(0, i); // 노드 0 = degree 399 허브
    const engine = new PhysicsEngine({
      count,
      edges: Int32Array.from(edges),
      positions,
      params: { ...FORCE_DEFAULTS },
    });
    for (let i = 0; i < 400; i++) engine.tick();
    let max = 0;
    for (let i = 0; i < positions.length; i++) {
      expect(Number.isFinite(positions[i])).toBe(true);
      const a = Math.abs(positions[i]);
      if (a > max) max = a;
    }
    expect(max).toBeLessThan(1e5);
  });
});
