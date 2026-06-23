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

  it("setSizes: updatePositions 후 인스턴스 행렬 scale이 base+sqrt(degree)*scale로 설정된다", () => {
    const layer = new NodeLayer(2);
    const base = 1.0;
    const scale = 0.5;
    // degree[0]=4 → size=1+sqrt(4)*0.5=2.0, degree[1]=9 → size=1+sqrt(9)*0.5=2.5
    layer.setSizes(Uint16Array.from([4, 9]), base, scale);
    layer.updatePositions(new Float32Array([0, 0, 0, 0, 0, 0]));

    const m0 = new THREE.Matrix4();
    const m1 = new THREE.Matrix4();
    layer.mesh.getMatrixAt(0, m0);
    layer.mesh.getMatrixAt(1, m1);

    const s0 = new THREE.Vector3();
    const s1 = new THREE.Vector3();
    m0.decompose(new THREE.Vector3(), new THREE.Quaternion(), s0);
    m1.decompose(new THREE.Vector3(), new THREE.Quaternion(), s1);

    expect(s0.x).toBeCloseTo(2.0);
    expect(s0.y).toBeCloseTo(2.0);
    expect(s0.z).toBeCloseTo(2.0);
    expect(s1.x).toBeCloseTo(2.5);
    expect(s1.y).toBeCloseTo(2.5);
    expect(s1.z).toBeCloseTo(2.5);
  });
});
