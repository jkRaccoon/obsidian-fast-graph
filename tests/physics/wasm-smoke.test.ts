import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

describe("wasm toolchain", () => {
  let exports: {
    allocate(count: number, edgeCount: number, numGroups: number): void;
    tick(): number;
    getAlpha(): number;
  };

  beforeAll(async () => {
    const bytes = readFileSync("build/physics.wasm");
    const imports = {
      env: {
        abort: (_msg: unknown, _file: unknown, _line: unknown, _col: unknown) => {
          throw new Error("wasm abort");
        },
      },
    };
    const { instance } = await WebAssembly.instantiate(bytes, imports);
    exports = instance.exports as unknown as typeof exports;
  });

  it("instantiates and runs exported physics functions", () => {
    exports.allocate(1, 0, 1);
    const alpha = exports.tick();
    // alpha should have decayed from 1.0 by ALPHA_DECAY
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });
});
