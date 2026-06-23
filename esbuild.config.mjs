import esbuild from "esbuild";

const prod = process.argv[2] === "production";

// Pass 1: 워커를 자체 완결 IIFE 문자열로 번들
async function buildWorker() {
  const result = await esbuild.build({
    entryPoints: ["src/physics/physics.worker.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: prod,
    write: false,
    tsconfig: "tsconfig.esbuild.json",
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
    tsconfig: "tsconfig.esbuild.json",
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
