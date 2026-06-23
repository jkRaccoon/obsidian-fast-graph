import { describe, it, expect } from "vitest";
import { FORCE_DEFAULTS, RENDER_DEFAULTS } from "../src/types";

describe("scaffolding smoke", () => {
  it("exposes sane defaults", () => {
    expect(FORCE_DEFAULTS.theta).toBeGreaterThan(0);
    expect(RENDER_DEFAULTS.maxNodes).toBeGreaterThan(0);
  });
});
