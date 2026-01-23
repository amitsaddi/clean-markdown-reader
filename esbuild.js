const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Copies mermaid.min.js to the assets folder for offline use
 */
function copyMermaidAsset() {
  const srcPath = path.join(__dirname, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
  const destDir = path.join(__dirname, 'out', 'assets');
  const destPath = path.join(destDir, 'mermaid.min.js');

  // Create assets directory if it doesn't exist
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copy mermaid.min.js
  fs.copyFileSync(srcPath, destPath);
  console.log('[assets] Copied mermaid.min.js to out/assets/');
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    plugins: [
      {
        name: 'esbuild-problem-matcher',
        setup(build) {
          build.onStart(() => {
            console.log('[watch] build started');
          });
          build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
              console.error(`> ${location.file}:${location.line}:${location.column}: error: ${text}`);
            });
            console.log('[watch] build finished');
          });
        },
      },
    ],
  });

  // Copy mermaid asset before build
  copyMermaidAsset();

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
