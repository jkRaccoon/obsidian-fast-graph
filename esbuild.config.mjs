import esbuild from "esbuild";
import { readFileSync, existsSync } from "node:fs";

const prod = process.argv[2] === "production";

// Pass 1: 워커를 자체 완결 IIFE 문자열로 번들
async function buildWorker() {
  if (!existsSync("build/physics.wasm")) {
    throw new Error(
      "build/physics.wasm 없음 — 먼저 `yarn asbuild`를 실행하세요."
    );
  }
  const wasmB64 = readFileSync("build/physics.wasm").toString("base64");

  const result = await esbuild.build({
    entryPoints: ["src/physics/physics.worker.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: prod,
    write: false,
    define: { "process.env.PHYSICS_WASM_B64": JSON.stringify(wasmB64) },
  });
  return result.outputFiles[0].text;
}

// Pass 2: 메인 번들. 워커 코드를 define으로 주입.
async function buildMain(workerCode) {
  const ctx = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
    define: { "process.env.WORKER_CODE": JSON.stringify(workerCode) },
    outfile: "main.js",
    sourcemap: prod ? false : "inline",
    minify: prod,
    logLevel: "info",
  });
  if (prod) {
    await ctx.rebuild();
    await ctx.dispose();
  } else {
    await ctx.watch();
  }
}

const workerCode = await buildWorker();
await buildMain(workerCode);
