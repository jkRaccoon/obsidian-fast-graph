import * as THREE from "three";

const MAX = 80; // 동시 파티클 상한(고차수 허브 대비)
const SPEED = 0.45; // 진행 속도 (t/초) ≈ 2.2초/엣지 — 천천히
const tmpColor = new THREE.Color();

/** 부드러운 원형 글로우 스프라이트 텍스처를 절차적으로 생성. */
function makeGlowTexture(): THREE.Texture {
  const size = 64;
  // popout 창 호환을 위해 activeDocument 사용(Obsidian 전역)
  const c = activeDocument.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.85)");
    g.addColorStop(0.6, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 호버한 노드에서 연결된 이웃으로 엣지를 따라 흐르는 "데이터" 파티클.
 * 위치는 ease-in-out으로 보간하고, 색은 시간·진행도에 따라 시퀀셜 그라디언트로 변한다.
 */
export class ParticleLayer {
  readonly points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private texture: THREE.Texture;
  private positions = new Float32Array(MAX * 3);
  private colors = new Float32Array(MAX * 3);
  private src = new Int32Array(MAX);
  private dst = new Int32Array(MAX);
  private prog = new Float32Array(MAX); // 0..1 진행도
  private count = 0;
  private time = 0;

  constructor() {
    this.texture = makeGlowTexture();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.PointsMaterial({
      size: 8,
      map: this.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  /** 호버 노드와 이웃 목록으로 파티클을 구성. hovered가 null이면 비활성화. */
  setSource(hovered: number | null, neighbors: number[]): void {
    if (hovered === null || neighbors.length === 0) {
      this.count = 0;
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const n = Math.min(neighbors.length, MAX);
    this.count = n;
    for (let i = 0; i < n; i++) {
      this.src[i] = hovered;
      this.dst[i] = neighbors[i];
      this.prog[i] = i / n; // 시작 위상을 흩어 스트림처럼 보이게
    }
    this.geometry.setDrawRange(0, n);
  }

  /** 매 프레임 호출: 파티클 위치/색 갱신. dt는 초 단위. */
  update(nodePositions: Float32Array, dt: number): void {
    if (this.count === 0) return;
    this.time += dt;
    for (let i = 0; i < this.count; i++) {
      this.prog[i] = (this.prog[i] + dt * SPEED) % 1;
      const p = this.prog[i];
      // ease-in-out (가속→감속)으로 데이터가 흐르는 느낌
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const s = this.src[i];
      const d = this.dst[i];
      const sx = nodePositions[s * 3];
      const sy = nodePositions[s * 3 + 1];
      const sz = nodePositions[s * 3 + 2];
      const dx = nodePositions[d * 3];
      const dy = nodePositions[d * 3 + 1];
      const dz = nodePositions[d * 3 + 2];
      this.positions[i * 3] = sx + (dx - sx) * e;
      this.positions[i * 3 + 1] = sy + (dy - sy) * e;
      this.positions[i * 3 + 2] = sz + (dz - sz) * e;
      // 시퀀셜 그라디언트: 시간·진행도에 따라 hue가 청록↔파랑↔보라↔분홍 대역을 순환
      const hue = 0.5 + 0.32 * Math.sin((this.time * 0.6 + p * 2.2 + i * 0.12) * Math.PI);
      tmpColor.setHSL(hue, 0.9, 0.62);
      this.colors[i * 3] = tmpColor.r;
      this.colors[i * 3 + 1] = tmpColor.g;
      this.colors[i * 3 + 2] = tmpColor.b;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
