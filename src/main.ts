import { Plugin, WorkspaceLeaf } from "obsidian";
import { Graph3DView, VIEW_TYPE_3D_GRAPH } from "./view/Graph3DView";
import { FastGraphSettingTab } from "./settings";
import { RENDER_DEFAULTS, type RenderSettings } from "./types";

export default class FastGraphPlugin extends Plugin {
  settings: RenderSettings = { ...RENDER_DEFAULTS };

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_3D_GRAPH, (leaf: WorkspaceLeaf) => new Graph3DView(leaf, this.settings));

    this.addRibbonIcon("git-fork", "Fast 3D Graph 열기", () => this.activateView(false));

    this.addCommand({
      id: "open-fast-3d-graph",
      name: "3D 그래프 열기",
      callback: () => this.activateView(false),
    });

    this.addCommand({
      id: "open-fast-3d-graph-local",
      name: "3D 로컬 그래프 열기",
      callback: () => this.activateView(true),
    });

    this.addSettingTab(new FastGraphSettingTab(this.app, this));
  }

  async activateView(local: boolean): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_3D_GRAPH)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_3D_GRAPH, active: true });
    }
    await workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof Graph3DView) view.setLocalMode(local);
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<RenderSettings> | null;
    this.settings = Object.assign({}, RENDER_DEFAULTS, saved);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_3D_GRAPH)) {
      if (leaf.view instanceof Graph3DView) leaf.view.refresh();
    }
  }

  /** 자동 회전만 라이브로 토글(시뮬레이션 재시작 없이). */
  async updateAutoRotate(on: boolean): Promise<void> {
    this.settings.autoRotate = on;
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_3D_GRAPH)) {
      if (leaf.view instanceof Graph3DView) leaf.view.setAutoRotate(on);
    }
  }

  onunload(): void {}
}
