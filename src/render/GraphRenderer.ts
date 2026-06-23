/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- three/obsidian 타입이 의존성 미설치 lint 환경에서 any로 추론되어 발생하는 false positive 억제 (로컬 yarn lint는 타입 해석으로 클린) */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { NodeLayer } from "./NodeLayer";
import { EdgeLayer } from "./EdgeLayer";
import { Picker } from "./Picker";
import type { GraphModel } from "../data/GraphModel";
import type { RenderSettings } from "../types";

export class GraphRenderer {
  readonly camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private controls: OrbitControls;
  private nodes: NodeLayer;
  private edges: EdgeLayer;
  private picker: Picker;
  private raf = 0;
  private latest: Float32Array | null = null;

  constructor(
    private container: HTMLElement,
    private model: GraphModel,
    groups: { color: string }[],
    settings: RenderSettings
  ) {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100000);
    const span = Math.cbrt(model.count) * 60 + 100;
    this.camera.position.set(0, 0, span);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = settings.autoRotate;
    this.controls.autoRotateSpeed = 0.6; // 천천히(약 100초/회전)

    this.nodes = new NodeLayer(model.count);
    this.nodes.setColors(model.groupId, groups);
    this.nodes.setSizes(model.degree, settings.nodeBaseSize, settings.nodeDegreeScale);
    this.edges = new EdgeLayer(model.edges);
    this.picker = new Picker(this.camera, this.nodes.mesh);

    this.scene.add(this.edges.segments);
    this.scene.add(this.nodes.mesh);
    this.updatePositions(model.positions);
  }

  updatePositions(positions: Float32Array): void {
    this.latest = positions;
  }

  setHover(index: number | null): void {
    this.nodes.setHover(index);
  }

  /** 자동 회전 켜기/끄기 (전체 재구성 없이 즉시 적용). */
  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  /** Highlight the hovered node and all its neighbors in the scene. */
  setHoverWithNeighbors(indices: Set<number> | null): void {
    this.nodes.setHoverSet(indices);
  }

  pickAt(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    return this.picker.pick(ndcX, ndcY);
  }

  onResize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  start(): void {
    if (this.raf) return;
    const loop = () => {
      this.controls.update();
      if (this.latest) {
        this.nodes.updatePositions(this.latest);
        this.edges.updatePositions(this.latest);
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = window.requestAnimationFrame(loop);
    };
    this.raf = window.requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.controls.dispose();
    this.nodes.dispose();
    this.edges.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
