// tests/_mocks/obsidian.ts
export const moment = {
  locale: () => "en",
};

export class FakeMetadataCache {
  resolvedLinks: Record<string, Record<string, number>> = {};
  /** Per-path tag overrides for tag-grouping tests. */
  tagsByPath: Record<string, { tag: string }[]> = {};
  private handlers: Record<string, Function[]> = {};
  on(evt: string, cb: Function) { (this.handlers[evt] ??= []).push(cb); return { evt, cb }; }
  offref() {}
  trigger(evt: string) { (this.handlers[evt] ?? []).forEach((h) => h()); }
  getCache(path: string) { return { tags: this.tagsByPath[path] ?? [] }; }
}
export class FakeVault {
  /** Obsidian 비공식 config 저장소(getConfig 대상). */
  config: Record<string, unknown> = {};
  private handlers: Record<string, Function[]> = {};
  on(evt: string, cb: Function) { (this.handlers[evt] ??= []).push(cb); return { evt, cb }; }
  offref() {}
  trigger(evt: string) { (this.handlers[evt] ?? []).forEach((h) => h()); }
  getConfig(key: string) { return this.config[key]; }
}
export class FakeApp {
  metadataCache = new FakeMetadataCache();
  vault = new FakeVault();
}
