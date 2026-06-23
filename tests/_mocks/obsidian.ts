// tests/_mocks/obsidian.ts
export class FakeMetadataCache {
  resolvedLinks: Record<string, Record<string, number>> = {};
  private handlers: Record<string, Function[]> = {};
  on(evt: string, cb: Function) { (this.handlers[evt] ??= []).push(cb); return { evt, cb }; }
  offref() {}
  trigger(evt: string) { (this.handlers[evt] ?? []).forEach((h) => h()); }
  getCache() { return { tags: [] }; }
}
export class FakeVault {
  on() { return {}; }
}
export class FakeApp {
  metadataCache = new FakeMetadataCache();
  vault = new FakeVault();
}
