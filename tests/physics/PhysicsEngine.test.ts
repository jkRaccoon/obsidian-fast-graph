import { describe, it, expect } from "vitest";
import { PhysicsEngine } from "../../src/physics/PhysicsEngine";
import { FORCE_DEFAULTS } from "../../src/types";

function dist(p: Float32Array, a: number, b: number): number {
  const dx = p[a * 3] - p[b * 3];
  const dy = p[a * 3 + 1] - p[b * 3 + 1];
  const dz = p[a * 3 + 2] - p[b * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function maxDistFromCentroid(p: Float32Array, count: number): number {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < count; i++) { cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; }
  cx /= count; cy /= count; cz /= count;
  let max = 0;
  for (let i = 0; i < count; i++) {
    const dx = p[i * 3] - cx, dy = p[i * 3 + 1] - cy, dz = p[i * 3 + 2] - cz;
    max = Math.max(max, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  return max;
}

function groupCentroidDist(p: Float32Array, g: Uint16Array, count: number): number {
  const s: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < count; i++) {
    const gi = g[i];
    s[gi][0] += p[i * 3]; s[gi][1] += p[i * 3 + 1]; s[gi][2] += p[i * 3 + 2]; s[gi][3]++;
  }
  const dx = s[0][0] / s[0][3] - s[1][0] / s[1][3];
  const dy = s[0][1] / s[0][3] - s[1][1] / s[1][3];
  const dz = s[0][2] / s[0][3] - s[1][2] / s[1][3];
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

  it("group cohesion contracts a scattered same-group cluster toward its centroid", () => {
    const count = 5;
    const positions = new Float32Array([
      -100, 0, 0, 100, 0, 0, 0, 100, 0, 0, -100, 0, 0, 0, 100,
    ]);
    const groupId = Uint16Array.from([0, 0, 0, 0, 0]);
    const engine = new PhysicsEngine({
      count,
      edges: new Int32Array(0),
      positions,
      groupId,
      params: { ...FORCE_DEFAULTS, repulsion: 0, gravity: 0, linkStrength: 0, groupSeparation: 0, groupCohesion: 0.2 },
    });
    const before = maxDistFromCentroid(positions, count);
    for (let i = 0; i < 100; i++) engine.tick();
    expect(maxDistFromCentroid(positions, count)).toBeLessThan(before);
  });

  it("group separation pushes two distinct groups farther apart", () => {
    const count = 4;
    // group 0 centroid ≈ (0,0,0), group 1 centroid ≈ (10,0,0)
    const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 9, 0, 0, 11, 0, 0]);
    const groupId = Uint16Array.from([0, 0, 1, 1]);
    const engine = new PhysicsEngine({
      count,
      edges: new Int32Array(0),
      positions,
      groupId,
      params: { ...FORCE_DEFAULTS, repulsion: 0, gravity: 0, linkStrength: 0, groupCohesion: 0, groupSeparation: 300 },
    });
    const before = groupCentroidDist(positions, groupId, count);
    for (let i = 0; i < 100; i++) engine.tick();
    expect(groupCentroidDist(positions, groupId, count)).toBeGreaterThan(before + 10);
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
