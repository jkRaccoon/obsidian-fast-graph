import * as THREE from "three";

export class NodeLayer {
  mesh: THREE.InstancedMesh;
  private geometry: THREE.SphereGeometry;
  private material: THREE.MeshBasicMaterial;
  private dummy = new THREE.Object3D();
  private sizes: Float32Array;
  private hoverIndex: number | null = null;
  private baseColors: Float32Array | null = null;
  private white = new THREE.Color(0xffffff);

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
    const count = groupId.length;
    this.baseColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      c.set(groups[groupId[i]]?.color ?? "#888888");
      this.mesh.setColorAt(i, c);
      this.baseColors[i * 3] = c.r;
      this.baseColors[i * 3 + 1] = c.g;
      this.baseColors[i * 3 + 2] = c.b;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setHover(index: number | null): void {
    if (this.hoverIndex === index) return;
    const prev = this.hoverIndex;
    this.hoverIndex = index;
    if (!this.mesh.instanceColor || !this.baseColors) return;
    const c = new THREE.Color();
    // restore previous hovered node
    if (prev !== null) {
      c.setRGB(this.baseColors[prev * 3], this.baseColors[prev * 3 + 1], this.baseColors[prev * 3 + 2]);
      this.mesh.setColorAt(prev, c);
    }
    // highlight new hovered node
    if (index !== null) {
      c.setRGB(this.baseColors[index * 3], this.baseColors[index * 3 + 1], this.baseColors[index * 3 + 2]);
      c.lerp(this.white, 0.5);
      this.mesh.setColorAt(index, c);
    }
    this.mesh.instanceColor.needsUpdate = true;
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
