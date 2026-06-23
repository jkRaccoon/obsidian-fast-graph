/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- three/obsidian 타입이 의존성 미설치 lint 환경에서 any로 추론되어 발생하는 false positive 억제 (로컬 yarn lint는 타입 해석으로 클린) */
import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { GraphDataProvider } from "../data/GraphDataProvider";
import { PALETTE } from "../data/grouping";
import { PhysicsClient } from "../physics/PhysicsClient";
import { GraphRenderer } from "../render/GraphRenderer";
import { extractLocalGraph } from "../interaction/localGraph";
import { buildGraphModel, seedPositions, type GraphModel } from "../data/GraphModel";
import { neighborsOf } from "../interaction/hover";
import { FORCE_DEFAULTS, type RenderSettings } from "../types";

export const VIEW_TYPE_3D_GRAPH = "fast-graph-3d-view";

export class Graph3DView extends ItemView {
  private provider: GraphDataProvider;
  private renderer: GraphRenderer | null = null;
  private physics: PhysicsClient | null = null;
  private model: GraphModel | null = null;
  private detachChange: (() => void) | null = null;
  private localMode = false;
  private resizeObserver: ResizeObserver | null = null;
  private label: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private settings: RenderSettings) {
    super(leaf);
    this.provider = new GraphDataProvider(this.app, settings);
  }

  getViewType(): string { return VIEW_TYPE_3D_GRAPH; }
  getDisplayText(): string { return "Fast 3D Graph"; }
  getIcon(): string { return "git-fork"; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("fast-graph-3d-root");

    // 정적 스타일은 styles.css의 .fast-graph-3d-label에 정의됨
    this.label = root.createDiv({ cls: "fast-graph-3d-label" });

    this.build(root);

    this.detachChange = this.provider.onChange(() => this.refresh());
    this.resizeObserver = new ResizeObserver(() => this.renderer?.onResize());
    this.resizeObserver.observe(root);
  }

  private build(root: HTMLElement): void {
    const full = this.provider.build();
    let model = full;
    if (this.localMode) {
      const file = this.app.workspace.getActiveFile();
      if (file) model = this.subgraph(full, file.path);
    }
    this.model = model;

    // model.groupId is populated correctly: by GraphDataProvider.build() for the full
    // model, and by subgraph() (which copies from the full model) for local mode.
    // Derive the palette from the existing groupId instead of re-computing with an
    // empty tagsByPath map.
    const maxGroupId = model.groupId.reduce((m, id) => Math.max(m, id), 0);
    const groups = Array.from({ length: maxGroupId + 1 }, (_, i) => ({
      id: i,
      key: String(i),
      color: PALETTE[i % PALETTE.length],
    }));
    const container = root.createDiv({ cls: "fast-graph-3d-canvas" });

    this.renderer = new GraphRenderer(container, model, groups, this.settings);
    this.renderer.start();

    this.physics = new PhysicsClient({
      count: model.count,
      edges: model.edges,
      positions: model.positions,
      groupId: model.groupId,
      params: { ...FORCE_DEFAULTS },
      onTick: (positions) => this.renderer?.updatePositions(positions),
    });

    this.wireInteraction(container);
  }

  private subgraph(full: GraphModel, rootPath: string): GraphModel {
    const keep = extractLocalGraph(full, rootPath, this.settings.localGraphDepth);
    // 인덱스 재매핑
    const paths: string[] = [];
    for (const oldIdx of keep) {
      paths.push(full.paths[oldIdx]);
    }
    const resolved: Record<string, Record<string, number>> = {};
    for (let e = 0; e < full.edgeCount; e++) {
      const a = full.edges[e * 2], b = full.edges[e * 2 + 1];
      if (keep.has(a) && keep.has(b)) {
        (resolved[full.paths[a]] ??= {})[full.paths[b]] = 1;
      }
    }
    for (const p of paths) resolved[p] ??= {};
    // GraphModel 재빌드
    const m: GraphModel = buildGraphModel(resolved);
    seedPositions(m, 1);
    // groupId는 full 모델에서 이미 GraphDataProvider.build()가 채워뒀으므로
    // 서브그래프의 각 노드 경로로 원본 인덱스를 조회하여 복사한다.
    for (let i = 0; i < m.count; i++) {
      const origIdx = full.pathToIndex.get(m.paths[i]);
      if (origIdx !== undefined) m.groupId[i] = full.groupId[origIdx];
    }
    return m;
  }

  private wireInteraction(container: HTMLElement): void {
    container.addEventListener("mousemove", (ev) => {
      if (!this.renderer || !this.model) return;
      const id = this.renderer.pickAt(ev.clientX, ev.clientY);
      if (id === null) {
        this.renderer.setHoverWithNeighbors(null);
        this.label?.removeClass("is-visible");
        return;
      }
      // Highlight hovered node and its neighbors in the 3D scene.
      const highlighted = neighborsOf(this.model, id);
      this.renderer.setHoverWithNeighbors(highlighted);
      if (this.settings.showLabels && this.label) {
        this.label.textContent = this.model.paths[id];
        this.label.setCssStyles({ left: `${ev.offsetX + 12}px`, top: `${ev.offsetY + 12}px` });
        this.label.addClass("is-visible");
      }
    });
    container.addEventListener("mouseleave", () => {
      this.renderer?.setHoverWithNeighbors(null);
      this.label?.removeClass("is-visible");
    });
    container.addEventListener("click", (ev) => {
      if (!this.renderer || !this.model) return;
      const id = this.renderer.pickAt(ev.clientX, ev.clientY);
      if (id === null) return;
      const path = this.model.paths[id];
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
    });
  }

  setLocalMode(enabled: boolean): void {
    this.localMode = enabled;
    this.refresh();
  }

  /** 자동 회전 토글 — 전체 재구성 없이 렌더러에 즉시 반영. */
  setAutoRotate(on: boolean): void {
    this.settings.autoRotate = on;
    this.renderer?.setAutoRotate(on);
  }

  refresh(): void {
    try {
      this.physics?.dispose();
      this.renderer?.dispose();
      this.physics = null;
      this.renderer = null;
      const root = this.contentEl;
      // label은 유지, 그래프 컨테이너만 교체
      Array.from(root.children).forEach((c) => { if (c !== this.label) c.remove(); });
      this.build(root);
    } catch (err) {
      new Notice("Fast 3D Graph: 갱신 중 오류 — 콘솔 확인");
      console.error("[fast-graph-3d]", err);
    }
  }

  async onClose(): Promise<void> {
    this.detachChange?.();
    this.resizeObserver?.disconnect();
    this.physics?.dispose();
    this.renderer?.dispose();
    this.provider.dispose();
  }
}
