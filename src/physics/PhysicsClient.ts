import { PhysicsEngine } from "./PhysicsEngine";
import { initMessage, type MainToWorker, type WorkerToMain } from "./protocol";
import type { ForceParams } from "../types";

declare const process: { env: { WORKER_CODE: string } };

export interface PhysicsClientOpts {
  count: number;
  edges: Int32Array;
  positions: Float32Array;
  groupId: Uint16Array;
  params: ForceParams;
  onTick: (positions: Float32Array, alpha: number) => void;
}

export class PhysicsClient {
  private worker: Worker | null = null;
  private fallback: PhysicsEngine | null = null;
  private raf = 0;

  constructor(private opts: PhysicsClientOpts) {
    try {
      const blob = new Blob([process.env.WORKER_CODE], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = (ev: MessageEvent<WorkerToMain>) => {
        const m = ev.data;
        if (m.type === "tick") this.opts.onTick(new Float32Array(m.positions), m.alpha);
        else if (m.type === "error") { console.error("[fast-graph-3d] worker:", m.message); this.startFallback(); }
      };
      this.worker.onerror = () => this.startFallback();
      const { msg, transfer } = initMessage(opts.count, opts.edges, opts.positions, opts.groupId, opts.params);
      this.worker.postMessage(msg, transfer);
    } catch (err) {
      console.warn("[fast-graph-3d] worker unavailable, using main-thread fallback:", err);
      this.startFallback();
    }
  }

  private startFallback(): void {
    if (this.fallback) return;
    this.disposeWorker();
    this.fallback = new PhysicsEngine({
      count: this.opts.count,
      edges: this.opts.edges,
      positions: this.opts.positions.slice(),
      groupId: this.opts.groupId,
      params: this.opts.params,
    });
    const loop = () => {
      if (!this.fallback) return;
      this.fallback.tick();
      this.opts.onTick(this.fallback.positions, this.fallback.alpha);
      if (this.fallback.alpha >= this.fallback.alphaMin) this.raf = requestAnimationFrame(loop);
      else { this.raf = 0; }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private send(msg: MainToWorker): void {
    this.worker?.postMessage(msg);
  }

  setParams(params: Partial<ForceParams>): void {
    if (this.worker) this.send({ type: "setParams", params });
    else if (this.fallback) { this.fallback.setParams(params); this.fallback.reheat(); this.ensureFallbackLoop(); }
  }

  pin(index: number, x: number, y: number, z: number): void {
    if (this.worker) this.send({ type: "pin", index, x, y, z });
    else if (this.fallback) { this.fallback.pin(index, x, y, z); this.fallback.reheat(); this.ensureFallbackLoop(); }
  }

  unpin(index: number): void {
    if (this.worker) this.send({ type: "unpin", index });
    else this.fallback?.unpin(index);
  }

  reheat(): void {
    if (this.worker) this.send({ type: "reheat" });
    else if (this.fallback) { this.fallback.reheat(); this.ensureFallbackLoop(); }
  }

  private ensureFallbackLoop(): void {
    if (this.fallback && this.raf === 0) {
      const loop = () => {
        if (!this.fallback) return;
        this.fallback.tick();
        this.opts.onTick(this.fallback.positions, this.fallback.alpha);
        if (this.fallback.alpha >= this.fallback.alphaMin) this.raf = requestAnimationFrame(loop);
        else this.raf = 0;
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  private disposeWorker(): void {
    if (this.worker) { this.send({ type: "stop" }); this.worker.terminate(); this.worker = null; }
  }

  dispose(): void {
    this.disposeWorker();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fallback = null;
  }
}
