import * as THREE from "three";

export class Picker {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(private camera: THREE.Camera, private mesh: THREE.InstancedMesh) {}

  pick(ndcX: number, ndcY: number): number | null {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    for (const h of hits) {
      if (h.instanceId !== undefined && h.instanceId !== null) return h.instanceId;
    }
    return null;
  }
}
