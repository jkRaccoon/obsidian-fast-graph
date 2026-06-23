import { describe, it, expect } from "vitest";
import { computeGrouping } from "../../src/data/grouping";

describe("computeGrouping", () => {
  const tags = new Map<string, string[]>();

  it("groups by top-level folder", () => {
    const r = computeGrouping(["work/a.md", "work/b.md", "personal/c.md"], tags, "folder");
    const idA = r.groupId[0];
    const idB = r.groupId[1];
    const idC = r.groupId[2];
    expect(idA).toBe(idB);
    expect(idA).not.toBe(idC);
    expect(r.groups.length).toBe(2);
  });

  it("groups root files under a shared key", () => {
    const r = computeGrouping(["a.md", "b.md"], tags, "folder");
    expect(r.groupId[0]).toBe(r.groupId[1]);
  });

  it("groups by first tag", () => {
    const t = new Map<string, string[]>([
      ["a.md", ["#x"]],
      ["b.md", ["#y"]],
      ["c.md", ["#x"]],
    ]);
    const r = computeGrouping(["a.md", "b.md", "c.md"], t, "tag");
    expect(r.groupId[0]).toBe(r.groupId[2]);
    expect(r.groupId[0]).not.toBe(r.groupId[1]);
  });

  it("assigns every node to group 0 when mode is none", () => {
    const r = computeGrouping(["a.md", "b.md"], tags, "none");
    expect(Array.from(r.groupId)).toEqual([0, 0]);
    expect(r.groups.length).toBe(1);
  });

  it("assigns a color string to each group", () => {
    const r = computeGrouping(["work/a.md", "personal/c.md"], tags, "folder");
    for (const g of r.groups) expect(g.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
