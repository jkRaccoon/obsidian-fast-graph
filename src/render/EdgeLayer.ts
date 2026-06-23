import * as THREE from "three";

export class EdgeLayer {
  segments: THREE.LineSegments;
  private edges: Int32Array;
  private positions: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;

  constructor(edges: Int32Array) {
    this.edges = edges;
    const vertexCount = edges.length; // edges.length/2 엣지 * 2 정점 = edges.length 정점
    this.positions = new Float32Array(vertexCount * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.4 });
    this.segments = new THREE.LineSegments(this.geometry, this.material);
  }

  updatePositions(nodePositions: Float32Array): void {
    const out = this.positions;
    const edges = this.edges;
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      const o = e * 3;
      out[o] = nodePositions[a * 3];
      out[o + 1] = nodePositions[a * 3 + 1];
      out[o + 2] = nodePositions[a * 3 + 2];
      out[o + 3] = nodePositions[b * 3];
      out[o + 4] = nodePositions[b * 3 + 1];
      out[o + 5] = nodePositions[b * 3 + 2];
    }
    this.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
