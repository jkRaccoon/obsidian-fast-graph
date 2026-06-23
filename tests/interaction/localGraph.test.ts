import { describe, it, expect } from "vitest";
import { buildGraphModel } from "../../src/data/GraphModel";
import { extractLocalGraph } from "../../src/interaction/localGraph";

// a - b - c - d (체인)
const model = buildGraphModel({
  "a.md": { "b.md": 1 },
  "b.md": { "c.md": 1 },
  "c.md": { "d.md": 1 },
});
const idx = (p: string) => model.pathToIndex.get(p)!;

describe("extractLocalGraph", () => {
  it("depth 0 returns only the root", () => {
    expect(extractLocalGraph(model, "a.md", 0)).toEqual(new Set([idx("a.md")]));
  });

  it("depth 1 returns root + direct neighbors", () => {
    expect(extractLocalGraph(model, "b.md", 1)).toEqual(
      new Set([idx("a.md"), idx("b.md"), idx("c.md")])
    );
  });

  it("depth 2 reaches two hops", () => {
    const s = extractLocalGraph(model, "a.md", 2);
    expect(s.has(idx("c.md"))).toBe(true);
    expect(s.has(idx("d.md"))).toBe(false);
  });

  it("unknown root yields empty set", () => {
    expect(extractLocalGraph(model, "zzz.md", 2).size).toBe(0);
  });
});
