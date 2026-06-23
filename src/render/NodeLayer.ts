import * as THREE from "three";

export class NodeLayer {
  mesh: THREE.InstancedMesh;
  private geometry: THREE.SphereGeometry;
  private material: THREE.MeshBasicMaterial;
  private dummy = new THREE.Object3D();
  private sizes: Float32Array;
  private hoverIndex: number | null = null;
  private _prevHighlighted: Set<number> | undefined;
  private baseColors: Float32Array | null = null;
  private white = new THREE.Color(0xffffff);
  private _tmp = new THREE.Color();

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
    this.setHoverSet(index === null ? null : new Set([index]));
  }

  /** Highlight a set of node indices (hovered node + its neighbors). */
  setHoverSet(indices: Set<number> | null): void {
    if (!this.mesh.instanceColor || !this.baseColors) return;
    const c = this._tmp;
    // restore all previously highlighted nodes to their base colors
    if (this.hoverIndex !== null) {
      const prevHighlighted = this._prevHighlighted ?? new Set([this.hoverIndex]);
      for (const i of prevHighlighted) {
        c.setRGB(this.baseColors[i * 3], this.baseColors[i * 3 + 1], this.baseColors[i * 3 + 2]);
        this.mesh.setColorAt(i, c);
      }
    }
    this._prevHighlighted = indices ?? undefined;

    if (indices === null || indices.size === 0) {
      this.hoverIndex = null;
      this.mesh.instanceColor.needsUpdate = true;
      return;
    }

    // Use the first element as the primary hovered node for change-detection
    this.hoverIndex = indices.values().next().value ?? null;

    // highlight all nodes in the set
    for (const i of indices) {
      c.setRGB(this.baseColors[i * 3], this.baseColors[i * 3 + 1], this.baseColors[i * 3 + 2]);
      c.lerp(this.white, 0.5);
      this.mesh.setColorAt(i, c);
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
