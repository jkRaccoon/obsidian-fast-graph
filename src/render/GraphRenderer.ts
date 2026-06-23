import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { NodeLayer } from "./NodeLayer";
import { EdgeLayer } from "./EdgeLayer";
import { ParticleLayer } from "./ParticleLayer";
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
  private particles: ParticleLayer;
  private picker: Picker;
  private raf = 0;
  private latest: Float32Array | null = null;
  private lastTime = 0;
  private positionsDirty = true; // 새 위치 버퍼가 도착했을 때만 인스턴스/엣지 갱신
  private needsRender = true;     // 한 프레임 렌더가 필요함(이벤트로 set)
  private disposed = false;

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
    // 레티나에서 픽셀 2배까지만(프래그먼트 부하 절감)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100000);
    const span = Math.cbrt(model.count) * 60 + 100;
    this.camera.position.set(0, 0, span);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = settings.autoRotate;
    this.controls.autoRotateSpeed = 0.6; // 천천히(약 100초/회전)
    // 사용자 조작/감쇠/자동회전으로 카메라가 바뀌면 'change'가 발생 → 렌더 요청
    this.controls.addEventListener("change", this.requestRender);

    this.nodes = new NodeLayer(model.count);
    this.nodes.setColors(model.groupId, groups);
    this.nodes.setSizes(model.degree, settings.nodeBaseSize, settings.nodeDegreeScale);
    this.edges = new EdgeLayer(model.edges);
    this.particles = new ParticleLayer();
    this.picker = new Picker(this.camera, this.nodes.mesh);

    this.scene.add(this.edges.segments);
    this.scene.add(this.nodes.mesh);
    this.scene.add(this.particles.points);
    this.updatePositions(model.positions);
  }

  /** 새 위치 버퍼 도착(워커 tick 또는 초기). */
  updatePositions(positions: Float32Array): void {
    this.latest = positions;
    this.positionsDirty = true;
    this.requestRender();
  }

  setHover(index: number | null): void {
    this.nodes.setHover(index);
    this.requestRender();
  }

  /** 자동 회전 켜기/끄기 (전체 재구성 없이 즉시 적용). */
  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
    if (on) this.requestRender();
  }

  /** Highlight the hovered node and its neighbors, and stream data particles along the edges. */
  setHoverWithNeighbors(hovered: number | null, indices: Set<number> | null): void {
    this.nodes.setHoverSet(indices);
    if (hovered !== null && indices) {
      const neighbors: number[] = [];
      for (const idx of indices) if (idx !== hovered) neighbors.push(idx);
      this.particles.setSource(hovered, neighbors);
    } else {
      this.particles.setSource(null, []);
    }
    this.requestRender();
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
    this.requestRender();
  }

  /** 다음 프레임에 한 번 렌더가 필요함을 표시(외부 이벤트용). */
  private requestRender = (): void => {
    this.needsRender = true;
  };

  start(): void {
    if (this.raf) return;
    // lazy-render: RAF 루프는 항상 돌지만(OrbitControls damping 요구 충족),
    // 변화가 없는 프레임에선 무거운 render()/updatePositions를 생략한다.
    const loop = () => {
      if (this.disposed) return;
      const now = performance.now() / 1000;
      const dt = this.lastTime ? Math.min(now - this.lastTime, 0.05) : 0;
      this.lastTime = now;

      // controls.update()는 감쇠/자동회전/드래그로 카메라가 바뀌면 'change'를 발생시켜
      // 아래에서 읽을 this.needsRender를 set한다.
      this.controls.update();

      const particlesActive = this.particles.active;
      let render = this.needsRender || particlesActive || this.controls.autoRotate;
      this.needsRender = false;

      if (this.latest) {
        // 위치가 바뀐 프레임에서만 2만 인스턴스 행렬/엣지 정점 재계산(수렴 후 헛수고 제거).
        if (this.positionsDirty) {
          this.nodes.updatePositions(this.latest);
          this.edges.updatePositions(this.latest);
          this.positionsDirty = false;
          render = true;
        }
        // 파티클은 활성일 때 매 프레임 흐른다(노드 위치가 고정이어도 이동).
        if (particlesActive) this.particles.update(this.latest, dt);
      }

      // 변화가 없으면 GPU 렌더를 건너뛴다(idle 시 GPU 0).
      if (render) this.renderer.render(this.scene, this.camera);

      this.raf = window.requestAnimationFrame(loop);
    };
    this.raf = window.requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.controls.removeEventListener("change", this.requestRender);
    this.stop();
    this.controls.dispose();
    this.nodes.dispose();
    this.edges.dispose();
    this.particles.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
