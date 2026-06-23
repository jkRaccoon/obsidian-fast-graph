/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- three/obsidian 타입이 의존성 미설치 lint 환경에서 any로 추론되어 발생하는 false positive 억제 (로컬 yarn lint는 타입 해석으로 클린) */
import type { App, EventRef } from "obsidian";
import { buildGraphModel, seedPositions, type GraphModel } from "./GraphModel";
import { computeGrouping } from "./grouping";
import { filterResolvedLinks } from "./exclude";
import type { RenderSettings } from "../types";

type BoundRef = { source: "metadataCache" | "vault"; ref: EventRef };

export class GraphDataProvider {
  private boundRefs: BoundRef[] = [];
  // Per-subscription timers are held in closure locals inside onChange().
  // This set lets dispose() cancel any pending debounced calls.
  private timers: Set<number> = new Set();

  constructor(private app: App, private settings: RenderSettings) {}

  build(): GraphModel {
    let links = this.app.metadataCache.resolvedLinks;
    if (this.settings.respectObsidianExclusions) {
      // Obsidian "제외할 파일"(Settings → Files and links → Excluded files)을 반영.
      // getConfig는 비공식 API라 방어적으로 접근한다.
      const filters = (this.app.vault as unknown as { getConfig?: (k: string) => unknown })
        .getConfig?.("userIgnoreFilters");
      if (Array.isArray(filters) && filters.length > 0) {
        links = filterResolvedLinks(links, filters as string[]);
      }
    }
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
    let timer: number | null = null;
    const debounced = () => {
      if (timer) { window.clearTimeout(timer); this.timers.delete(timer); }
      timer = window.setTimeout(() => { this.timers.delete(timer!); cb(); }, 300);
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
    for (const t of this.timers) window.clearTimeout(t);
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
