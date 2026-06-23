import type { App, EventRef } from "obsidian";
import { buildGraphModel, seedPositions, type GraphModel } from "./GraphModel";
import { computeGrouping } from "./grouping";
import type { RenderSettings } from "../types";

export class GraphDataProvider {
  private refs: EventRef[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private app: App, private settings: RenderSettings) {}

  build(): GraphModel {
    const links = this.app.metadataCache.resolvedLinks;
    const model = buildGraphModel(links);

    const tagsByPath = new Map<string, string[]>();
    if (this.settings.groupBy === "tag") {
      for (const path of model.paths) {
        const cache = this.app.metadataCache.getCache(path);
        const tags = cache?.tags?.map((t: { tag: string }) => t.tag) ?? [];
        tagsByPath.set(path, tags);
      }
    }

    const grouping = computeGrouping(model.paths, tagsByPath, this.settings.groupBy);
    model.groupId.set(grouping.groupId);
    seedPositions(model, 1);
    return model;
  }

  onChange(cb: () => void): () => void {
    const debounced = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(cb, 300);
    };
    this.refs.push(this.app.metadataCache.on("resolved", debounced));
    this.refs.push(this.app.vault.on("rename", debounced));
    this.refs.push(this.app.vault.on("delete", debounced));
    this.refs.push(this.app.vault.on("create", debounced));
    return () => {
      for (const r of this.refs) this.app.metadataCache.offref(r);
      this.refs = [];
    };
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const r of this.refs) this.app.metadataCache.offref(r);
    this.refs = [];
  }
}
