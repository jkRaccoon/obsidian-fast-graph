import { describe, it, expect } from "vitest";
import { isExcluded, filterResolvedLinks } from "../../src/data/exclude";

describe("isExcluded", () => {
  it("matches a folder filter as a substring", () => {
    expect(isExcluded("node_modules/x.md", ["node_modules/"])).toBe(true);
    expect(isExcluded("src/a.md", ["node_modules/"])).toBe(false);
  });

  it("matches nested folder paths", () => {
    expect(isExcluded("issues/7_complete/done.md", ["issues/7_complete/"])).toBe(true);
  });

  it("is case-insensitive for plain filters", () => {
    expect(isExcluded("Scripts/build.md", ["scripts/"])).toBe(true);
  });

  it("supports regex filters wrapped in slashes", () => {
    expect(isExcluded("a.excalidraw.md", ["/\\.excalidraw\\.md$/"])).toBe(true);
    expect(isExcluded("notes/a.md", ["/\\.excalidraw\\.md$/"])).toBe(false);
  });

  it("ignores an invalid regex filter gracefully", () => {
    expect(isExcluded("a.md", ["/[/"])).toBe(false);
  });

  it("returns false when there are no filters", () => {
    expect(isExcluded("a.md", [])).toBe(false);
  });
});

describe("filterResolvedLinks", () => {
  it("drops excluded sources and targets", () => {
    const links = {
      "a.md": { "b.md": 1, "node_modules/x.md": 1 },
      "b.md": {},
      "node_modules/x.md": { "a.md": 1 },
    };
    const out = filterResolvedLinks(links, ["node_modules/"]);
    expect(Object.keys(out).sort()).toEqual(["a.md", "b.md"]);
    expect(out["a.md"]).toEqual({ "b.md": 1 });
  });

  it("returns the same links object when there are no filters", () => {
    const links = { "a.md": { "b.md": 1 }, "b.md": {} };
    expect(filterResolvedLinks(links, [])).toBe(links);
  });
});
