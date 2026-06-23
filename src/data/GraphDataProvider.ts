import type { App, EventRef } from "obsidian";
import { buildGraphModel, seedPositions, type GraphModel } from "./GraphModel";
import { computeGrouping } from "./grouping";
import type { RenderSettings } from "../types";

type BoundRef = { source: "metadataCache" | "vault"; ref: EventRef };

export class GraphDataProvider {
  private boundRefs: BoundRef[] = [];
  // Per-subscription timers are held in closure locals inside onChange().
  // This set lets dispose() cancel any pending debounced calls.
  private timers: Set<ReturnType<typeof setTimeout>> = new Set();

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
    // Each subscription gets its own timer to avoid races when multiple
    // subscribers co-exist on the same GraphDataProvider instance.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) { clearTimeout(timer); this.timers.delete(timer); }
      timer = setTimeout(() => { this.timers.delete(timer!); cb(); }, 300);
      this.timers.add(timer);
    };
    const localRefs: BoundRef[] = [
      { source: "metadataCache", ref: this.app.metadataCache.on("resolved", debounced) },
      { source: "vault", ref: this.app.vault.on("rename", debounced) },
      { source: "vault", ref: this.app.vault.on("delete", debounced) },
      { source: "vault", ref: this.app.vault.on("create", debounced) },
    ];
    for (const br of localRefs) this.boundRefs.push(br);
    return () => {
      for (const br of localRefs) this._offref(br);
      for (const br of localRefs) {
        const idx = this.boundRefs.indexOf(br);
        if (idx !== -1) this.boundRefs.splice(idx, 1);
      }
    };
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const br of this.boundRefs) this._offref(br);
    this.boundRefs = [];
  }

  private _offref(br: BoundRef): void {
    if (br.source === "metadataCache") {
      this.app.metadataCache.offref(br.ref);
    } else {
      this.app.vault.offref(br.ref);
    }
  }
}
