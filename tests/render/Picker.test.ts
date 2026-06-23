import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { NodeLayer } from "../../src/render/NodeLayer";
import { Picker } from "../../src/render/Picker";

describe("Picker", () => {
  it("picks the instance under the camera center", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const layer = new NodeLayer(2);
    layer.setSizes(Uint16Array.from([0, 0]), 3, 0); // 반지름 3
    // 0번은 원점, 1번은 화면 밖 멀리
    layer.updatePositions(new Float32Array([0, 0, 0, 1000, 1000, 0]));

    const picker = new Picker(camera, layer.mesh);
    expect(picker.pick(0, 0)).toBe(0);
  });

  it("returns null when nothing is hit", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const layer = new NodeLayer(1);
    layer.setSizes(Uint16Array.from([0]), 1, 0);
    layer.updatePositions(new Float32Array([0, 0, 0]));
    const picker = new Picker(camera, layer.mesh);
    expect(picker.pick(0.99, 0.99)).toBeNull();
  });
});
