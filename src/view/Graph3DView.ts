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
    // 현재 강조 중인 대상(호버 또는 선택). 동일하면 재구성하지 않아 파티클 진행이 끊기지 않게 한다.
    let shown: number | null = null;
    let selected: number | null = null;
    const display = (idx: number | null) => {
      if (idx === shown) return;
      shown = idx;
      if (idx === null || !this.model) {
        this.renderer?.setHoverWithNeighbors(null, null);
        return;
      }
      this.renderer?.setHoverWithNeighbors(idx, neighborsOf(this.model, idx));
    };

    container.addEventListener("mousemove", (ev) => {
      if (!this.renderer || !this.model) return;
      const id = this.renderer.pickAt(ev.clientX, ev.clientY);
      if (id === null) {
        // 호버에서 벗어나면 선택된 노드가 있을 때 그 강조를 유지한다.
        display(selected);
        this.label?.removeClass("is-visible");
        return;
      }
      display(id);
      if (this.settings.showLabels && this.label) {
        this.label.textContent = this.model.paths[id];
        this.label.setCssStyles({ left: `${ev.offsetX + 12}px`, top: `${ev.offsetY + 12}px` });
        this.label.addClass("is-visible");
      }
    });
    container.addEventListener("mouseleave", () => {
      display(selected);
      this.label?.removeClass("is-visible");
    });

    // 드래그(카메라 회전)와 클릭을 구분: mousedown 위치를 기억해, 거의 안 움직였을 때만 클릭 처리.
    let downX = 0;
    let downY = 0;
    container.addEventListener("mousedown", (ev) => {
      downX = ev.clientX;
      downY = ev.clientY;
    });
    container.addEventListener("click", (ev) => {
      if (!this.renderer || !this.model) return;
      const dx = ev.clientX - downX;
      const dy = ev.clientY - downY;
      if (dx * dx + dy * dy > 25) return; // 드래그 → 무시
      const id = this.renderer.pickAt(ev.clientX, ev.clientY);
      if (id === null) {
        // 빈 공간 클릭 → 선택 해제
        selected = null;
        display(null);
        return;
      }
      if (id === selected) {
        // 이미 선택된 노드를 다시 클릭 → 문서 열기
        const path = this.model.paths[id];
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
        return;
      }
      // 첫 클릭: 노드 선택(강조/파티클 유지), 열지 않음
      selected = id;
      display(id);
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
