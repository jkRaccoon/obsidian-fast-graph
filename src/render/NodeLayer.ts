import * as THREE from "three";

export class NodeLayer {
  mesh: THREE.InstancedMesh;
  private geometry: THREE.SphereGeometry;
  private material: THREE.MeshBasicMaterial;
  private dummy = new THREE.Object3D();
  private sizes: Float32Array;

  constructor(count: number) {
    this.geometry = new THREE.SphereGeometry(1, 8, 6);
    this.material = new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.sizes = new Float32Array(count).fill(1);
  }

  setColors(groupId: Uint16Array, groups: { color: string }[]): void {
    const c = new THREE.Color();
    for (let i = 0; i < groupId.length; i++) {
      c.set(groups[groupId[i]]?.color ?? "#888888");
      this.mesh.setColorAt(i, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setSizes(degree: Uint16Array, base: number, scale: number): void {
    for (let i = 0; i < degree.length; i++) {
      this.sizes[i] = base + Math.sqrt(degree[i]) * scale;
    }
  }

  updatePositions(positions: Float32Array): void {
    const d = this.dummy;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      d.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const s = this.sizes[i];
      d.scale.set(s, s, s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
