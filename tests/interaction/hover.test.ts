import { describe, it, expect } from "vitest";
import { buildGraphModel } from "../../src/data/GraphModel";
import { neighborsOf } from "../../src/interaction/hover";

const model = buildGraphModel({ "a.md": { "b.md": 1, "c.md": 1 }, "b.md": {}, "c.md": {} });
const idx = (p: string) => model.pathToIndex.get(p)!;

describe("neighborsOf", () => {
  it("includes self and direct neighbors", () => {
    expect(neighborsOf(model, idx("a.md"))).toEqual(
      new Set([idx("a.md"), idx("b.md"), idx("c.md")])
    );
  });

  it("returns just self for an isolated-from-others node's leaf", () => {
    expect(neighborsOf(model, idx("b.md"))).toEqual(new Set([idx("b.md"), idx("a.md")]));
  });
});
