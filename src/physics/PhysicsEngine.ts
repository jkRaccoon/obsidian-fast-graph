import { Octree } from "./Octree";
import type { ForceParams } from "../types";

const ALPHA_DECAY = 0.0228;
const ALPHA_TARGET = 0;

export class PhysicsEngine {
  alpha = 1;
  readonly alphaMin = 0.001;

  private count: number;
  private edges: Int32Array;
  private pos: Float32Array;
  private vel: Float32Array;
  private params: ForceParams;
  private force: Float32Array;
  private pinned: Uint8Array;
  private scratch = new Float32Array(3);
  private tree: Octree;  // 재사용 — tick마다 new 하지 않음

  constructor(opts: { count: number; edges: Int32Array; positions: Float32Array; params: ForceParams }) {
    this.count = opts.count;
    this.edges = opts.edges;
    this.pos = opts.positions;
    this.vel = new Float32Array(opts.count * 3);
    this.params = { ...opts.params };
    this.force = new Float32Array(opts.count * 3);
    this.pinned = new Uint8Array(opts.count);
    this.tree = new Octree(opts.count);  // 한 번만 생성, tick마다 rebuild
  }

  get positions(): Float32Array {
    return this.pos;
  }

  setParams(p: Partial<ForceParams>): void {
    this.params = { ...this.params, ...p };
  }

  pin(i: number, x: number, y: number, z: number): void {
    this.pinned[i] = 1;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = 0; this.vel[i * 3 + 1] = 0; this.vel[i * 3 + 2] = 0;
  }

  unpin(i: number): void {
    this.pinned[i] = 0;
  }

  reheat(): void {
    this.alpha = 1;
  }

  tick(): void {
    const { repulsion, linkStrength, linkDistance, gravity, damping, theta } = this.params;
    const f = this.force;
    f.fill(0);

    // 1) 척력 (Barnes-Hut) — 핫 루프에서 JS 객체 생성 금지: tree 재사용
    this.tree.rebuild(this.pos, this.count);
    const s = this.scratch;
    for (let i = 0; i < this.count; i++) {
      this.tree.computeForce(i, theta, repulsion, s);
      f[i * 3] += s[0]; f[i * 3 + 1] += s[1]; f[i * 3 + 2] += s[2];
    }

    // 2) 인력 (spring, 엣지)
    for (let e = 0; e < this.edges.length; e += 2) {
      const a = this.edges[e], b = this.edges[e + 1];
      let dx = this.pos[b * 3] - this.pos[a * 3];
      let dy = this.pos[b * 3 + 1] - this.pos[a * 3 + 1];
      let dz = this.pos[b * 3 + 2] - this.pos[a * 3 + 2];
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      const k = linkStrength * (d - linkDistance) / d;
      const fx = dx * k, fy = dy * k, fz = dz * k;
      f[a * 3] += fx; f[a * 3 + 1] += fy; f[a * 3 + 2] += fz;
      f[b * 3] -= fx; f[b * 3 + 1] -= fy; f[b * 3 + 2] -= fz;
    }

    // 3) 중심화(gravity) + 적분
    // 발산 방지: per-tick 변위(속도) 크기를 maxStep으로 제한한다. 고차수 허브 노드는
    // 스프링 강성(≈degree*linkStrength)이 매우 커서 명시적 Euler 적분이 불안정해지고
    // (√k·dt > ~2) 좌표가 폭발한다. 변위 상한이 적분 스텝을 유계로 만들어 강성/차수와
    // 무관하게 안정성을 보장한다.
    const maxStep = linkDistance;
    const maxStep2 = maxStep * maxStep;
    for (let i = 0; i < this.count; i++) {
      if (this.pinned[i]) continue;
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      f[ix] -= this.pos[ix] * gravity;
      f[iy] -= this.pos[iy] * gravity;
      f[iz] -= this.pos[iz] * gravity;

      let vx = (this.vel[ix] + f[ix] * this.alpha) * damping;
      let vy = (this.vel[iy] + f[iy] * this.alpha) * damping;
      let vz = (this.vel[iz] + f[iz] * this.alpha) * damping;

      const sp2 = vx * vx + vy * vy + vz * vz;
      if (sp2 > maxStep2) {
        const scale = maxStep / Math.sqrt(sp2);
        vx *= scale; vy *= scale; vz *= scale;
      }

      this.vel[ix] = vx; this.vel[iy] = vy; this.vel[iz] = vz;
      this.pos[ix] += vx;
      this.pos[iy] += vy;
      this.pos[iz] += vz;
    }

    // alpha 감쇠
    this.alpha += (ALPHA_TARGET - this.alpha) * ALPHA_DECAY;
  }
}
