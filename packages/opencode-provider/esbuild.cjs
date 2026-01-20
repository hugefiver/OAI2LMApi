const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
    const ctx = await esbuild.context({
        entryPoints: ['src/index.ts'],
        bundle: true,
        format: 'esm',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        target: 'node18',
        outfile: 'dist/index.js',
        // External dependencies that should NOT be bundled:
        // - peer dependencies (ai)
        // - @ai-sdk/* packages (consumed at runtime)
        external: [
            'ai',
            '@ai-sdk/openai-compatible',
            '@ai-sdk/provider',
            '@ai-sdk/provider-utils',
        ],
        logLevel: 'info',
        // Size optimization options
        treeShaking: true,
        legalComments: 'none',
        ...(production && { drop: ['console', 'debugger'] }),
    });
    if (watch) {
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
