const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  // Build main entries (index.ts and plugin.ts)
  const mainCtx = await esbuild.context({
    entryPoints: ["src/index.ts", "src/plugin.ts"],
    bundle: true,
    format: "esm",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node18",
    outdir: "dist",
    // Keep @ai-sdk/openai-compatible as external since it's a peer-like dependency
    // that OpenCode will resolve
    external: ["@ai-sdk/openai-compatible"],
    logLevel: "info",
    // Size optimization options
    treeShaking: true,
    legalComments: "none",
    ...(production && { drop: ["debugger"] }),
  });

  // Build CLI separately with shebang preserved from source
  const cliCtx = await esbuild.context({
    entryPoints: ["src/cli.ts"],
    bundle: true,
    format: "esm",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node18",
    outdir: "dist",
    external: ["@ai-sdk/openai-compatible"],
    logLevel: "info",
    treeShaking: true,
    legalComments: "none",
    ...(production && { drop: ["debugger"] }),
  });
  if (watch) {
    await mainCtx.watch();
    await cliCtx.watch();
    console.log("Watching for changes...");
  } else {
    await mainCtx.rebuild();
    await cliCtx.rebuild();
    await mainCtx.dispose();
    await cliCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
