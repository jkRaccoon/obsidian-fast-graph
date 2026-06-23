import { describe, it, expect } from "vitest";
import { buildGraphModel, seedPositions } from "../../src/data/GraphModel";

describe("buildGraphModel", () => {
  it("collects all nodes from sources and targets", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1 }, "b.md": {} });
    expect(m.count).toBe(2);
    expect(new Set(m.paths)).toEqual(new Set(["a.md", "b.md"]));
  });

  it("includes target-only nodes", () => {
    const m = buildGraphModel({ "a.md": { "c.md": 1 } });
    expect(m.count).toBe(2);
    expect(m.pathToIndex.has("c.md")).toBe(true);
  });

  it("builds one undirected edge per source-target pair", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1 } });
    expect(m.edgeCount).toBe(1);
    const a = m.pathToIndex.get("a.md")!;
    const b = m.pathToIndex.get("b.md")!;
    expect([m.edges[0], m.edges[1]].sort()).toEqual([a, b].sort());
  });

  it("dedupes reciprocal links into a single edge", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1 }, "b.md": { "a.md": 1 } });
    expect(m.edgeCount).toBe(1);
  });

  it("computes degree per node", () => {
    const m = buildGraphModel({ "a.md": { "b.md": 1, "c.md": 1 }, "b.md": {}, "c.md": {} });
    expect(m.degree[m.pathToIndex.get("a.md")!]).toBe(2);
    expect(m.degree[m.pathToIndex.get("b.md")!]).toBe(1);
  });

  it("seedPositions is deterministic for a given seed", () => {
    const m1 = buildGraphModel({ "a.md": { "b.md": 1 } });
    const m2 = buildGraphModel({ "a.md": { "b.md": 1 } });
    seedPositions(m1, 42);
    seedPositions(m2, 42);
    expect(Array.from(m1.positions)).toEqual(Array.from(m2.positions));
    expect(m1.positions.some((v) => v !== 0)).toBe(true);
  });
});
