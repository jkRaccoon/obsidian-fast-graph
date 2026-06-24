import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

describe("wasm toolchain", () => {
  let exports: { add(a: number, b: number): number };

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
    exports = instance.exports as unknown as { add(a: number, b: number): number };
  });

  it("instantiates and runs an exported function", () => {
    expect(exports.add(2, 3)).toBe(5);
  });
});
