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
});
