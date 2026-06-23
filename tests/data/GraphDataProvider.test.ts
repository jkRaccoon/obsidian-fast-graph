import { describe, it, expect, vi } from "vitest";
import { GraphDataProvider } from "../../src/data/GraphDataProvider";
import { FakeApp } from "../_mocks/obsidian";
import { RENDER_DEFAULTS } from "../../src/types";

function makeProvider() {
  const app = new FakeApp();
  app.metadataCache.resolvedLinks = { "a.md": { "b.md": 1 }, "b.md": {} };
  const provider = new GraphDataProvider(app as any, { ...RENDER_DEFAULTS });
  return { app, provider };
}

describe("GraphDataProvider", () => {
  it("builds a model from resolvedLinks with seeded positions", () => {
    const { provider } = makeProvider();
    const m = provider.build();
    expect(m.count).toBe(2);
    expect(m.positions.some((v) => v !== 0)).toBe(true);
  });

  it("applies grouping to the model", () => {
    const { app, provider } = makeProvider();
    app.metadataCache.resolvedLinks = { "work/a.md": {}, "home/b.md": {} };
    const m = provider.build();
    expect(m.groupId[0]).not.toBe(m.groupId[1]);
  });

  it("debounced onChange fires after a cache event", async () => {
    const { app, provider } = makeProvider();
    const cb = vi.fn();
    provider.onChange(cb);
    app.metadataCache.trigger("resolved");
    await new Promise((r) => setTimeout(r, 350));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
