import { describe, it, expect } from "vitest";
import { Octree } from "../../src/physics/Octree";

describe("Octree repulsion", () => {
  it("pushes two nodes apart along their axis", () => {
    // 노드 0 at (-1,0,0), 노드 1 at (1,0,0)
    const pos = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const tree = new Octree(2);
    tree.rebuild(pos, 2);
    const f = new Float32Array(3);
    tree.computeForce(0, 0.5, 1, f);
    expect(f[0]).toBeLessThan(0); // 0번은 -x 방향으로 밀린다
    expect(Math.abs(f[1])).toBeLessThan(1e-6);
    expect(Math.abs(f[2])).toBeLessThan(1e-6);
  });

  it("is symmetric for a symmetric pair", () => {
    const pos = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const tree = new Octree(2);
    tree.rebuild(pos, 2);
    const f0 = new Float32Array(3);
    const f1 = new Float32Array(3);
    tree.computeForce(0, 0.5, 1, f0);
    tree.computeForce(1, 0.5, 1, f1);
    expect(f0[0]).toBeCloseTo(-f1[0], 5);
  });

  it("approximates a far cluster by its center of mass (theta large)", () => {
    // 0번 노드, 그리고 멀리 떨어진 군집(100 근방 2개)
    const pos = new Float32Array([0, 0, 0, 100, 0, 0, 102, 0, 0]);
    const tree = new Octree(3);
    tree.rebuild(pos, 3);
    const f = new Float32Array(3);
    tree.computeForce(0, 1.5, 1, f); // theta 큼 → 군집을 한 점으로 근사
    expect(f[0]).toBeLessThan(0); // 군집 반대 방향(-x)으로 밀림
  });

  it("writes (overwrites) into out, not accumulates", () => {
    const pos = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const tree = new Octree(2);
    tree.rebuild(pos, 2);
    const f = new Float32Array([999, 999, 999]);
    tree.computeForce(0, 0.5, 1, f);
    expect(f[0]).toBeLessThan(0);
  });
});
