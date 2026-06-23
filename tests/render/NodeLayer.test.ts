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

  it("setHover: 호버된 노드 색상이 흰색과 50% lerp로 밝아지고, 호버 해제 시 원래 색상으로 복원된다", () => {
    const layer = new NodeLayer(2);
    layer.setColors(Uint16Array.from([0, 1]), [{ color: "#ff0000" }, { color: "#0000ff" }]);

    // 호버 전: 인덱스 0은 빨간색(r=1)
    const before = new THREE.Color();
    layer.mesh.getColorAt(0, before);
    expect(before.r).toBeCloseTo(1);
    expect(before.g).toBeCloseTo(0);

    // 호버 시: r=1, g=0, b=0 에서 white(1,1,1) lerp 0.5 → r=1, g=0.5, b=0.5
    layer.setHover(0);
    const hovered = new THREE.Color();
    layer.mesh.getColorAt(0, hovered);
    expect(hovered.r).toBeCloseTo(1.0);
    expect(hovered.g).toBeCloseTo(0.5);
    expect(hovered.b).toBeCloseTo(0.5);

    // 다른 노드로 호버 이동: 이전 노드(0)는 원래 색으로 복원
    layer.setHover(1);
    const restored = new THREE.Color();
    layer.mesh.getColorAt(0, restored);
    expect(restored.r).toBeCloseTo(1);
    expect(restored.g).toBeCloseTo(0);
    expect(restored.b).toBeCloseTo(0);

    // 호버 해제(null): 노드 1 원래 색으로 복원
    layer.setHover(null);
    const restored1 = new THREE.Color();
    layer.mesh.getColorAt(1, restored1);
    expect(restored1.r).toBeCloseTo(0);
    expect(restored1.g).toBeCloseTo(0);
    expect(restored1.b).toBeCloseTo(1);
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
