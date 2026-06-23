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

  it("tag grouping reads per-path tags from getCache", () => {
    const app = new FakeApp();
    app.metadataCache.resolvedLinks = { "a.md": {}, "b.md": {} };
    // Give each note a different tag so they land in different groups
    app.metadataCache.tagsByPath = {
      "a.md": [{ tag: "#alpha" }],
      "b.md": [{ tag: "#beta" }],
    };
    const provider = new GraphDataProvider(app as any, { ...RENDER_DEFAULTS, groupBy: "tag" });
    const m = provider.build();
    expect(m.groupId[0]).not.toBe(m.groupId[1]);
  });

  it("two onChange subscribers debounce independently (no timer race)", async () => {
    const { app, provider } = makeProvider();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    provider.onChange(cb1);
    provider.onChange(cb2);
    // Trigger only the metadataCache event which fires cb1's and cb2's debouncers
    app.metadataCache.trigger("resolved");
    await new Promise((r) => setTimeout(r, 350));
    // Both must fire exactly once — shared timer would suppress one of them
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
