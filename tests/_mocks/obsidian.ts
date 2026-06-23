// tests/_mocks/obsidian.ts
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
  private handlers: Record<string, Function[]> = {};
  on(evt: string, cb: Function) { (this.handlers[evt] ??= []).push(cb); return { evt, cb }; }
  offref() {}
  trigger(evt: string) { (this.handlers[evt] ?? []).forEach((h) => h()); }
}
export class FakeApp {
  metadataCache = new FakeMetadataCache();
  vault = new FakeVault();
}
