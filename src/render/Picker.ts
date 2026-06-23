/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- three/obsidian 타입이 의존성 미설치 lint 환경에서 any로 추론되어 발생하는 false positive 억제 (로컬 yarn lint는 타입 해석으로 클린) */
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
