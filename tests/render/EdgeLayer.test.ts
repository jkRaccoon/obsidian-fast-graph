import { describe, it, expect } from "vitest";
import { EdgeLayer } from "../../src/render/EdgeLayer";

describe("EdgeLayer", () => {
  it("allocates 2 vertices (6 floats) per edge", () => {
    const layer = new EdgeLayer(Int32Array.from([0, 1, 1, 2]));
    const attr = layer.segments.geometry.getAttribute("position");
    expect(attr.count).toBe(4); // 2 edges * 2 endpoints
  });

  it("copies endpoint coordinates from node positions", () => {
    const layer = new EdgeLayer(Int32Array.from([0, 1]));
    layer.updatePositions(new Float32Array([10, 0, 0, 0, 20, 0]));
    const a = layer.segments.geometry.getAttribute("position").array as Float32Array;
    expect([a[0], a[1], a[2]]).toEqual([10, 0, 0]);
    expect([a[3], a[4], a[5]]).toEqual([0, 20, 0]);
  });
});
