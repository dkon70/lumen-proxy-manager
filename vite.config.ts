import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build as esbuild } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';
import { packageOf, thirdPartyNotices } from './scripts/licenses.mjs';
import { buildManifest } from './scripts/manifest.mjs';

type Target = 'chrome' | 'firefox';

function extensionFiles(target: Target, outDir: string): Plugin {
  return {
    name: 'lumen-extension-files',
    apply: 'build',
    generateBundle(_options, bundle) {
      const packages = new Set<string>();
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        for (const id of item.moduleIds) {
          const name = packageOf(id);
          if (name) packages.add(name);
        }
      }
      this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: thirdPartyNotices(packages) });
    },
    async closeBundle() {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(buildManifest(target), null, 2) + '\n');
      if (target !== 'chrome') return;
      copyFileSync('static/chrome/sandbox.html', resolve(outDir, 'sandbox.html'));
      const sandbox = await esbuild({
        metafile: true,
        entryPoints: ['src/sandbox/sandbox.ts'],
        bundle: true,
        format: 'iife',
        target: 'chrome116',
        minify: true,
        outfile: resolve(outDir, 'sandbox.js'),
      });
      const external = Object.keys(sandbox.metafile.inputs).map(packageOf).filter(Boolean);
      if (external.length) throw new Error(`Sandbox bundles third-party code; add it to LICENSE.txt: ${external.join(', ')}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const target: Target = mode === 'firefox' ? 'firefox' : 'chrome';
  const outDir = `dist/${target}`;
  const input: Record<string, string> = {
    popup: 'popup.html',
    options: 'options.html',
    background: 'src/background/index.ts',
  };
  if (target === 'chrome') input.offscreen = 'offscreen.html';

  return {
    plugins: [svelte(), extensionFiles(target, outDir)],
    define: { __TARGET__: JSON.stringify(target) },
    resolve: { alias: { '#platform': resolve(__dirname, `src/platform/${target}.ts`) } },
    build: {
      outDir,
      emptyOutDir: true,
      target: target === 'chrome' ? 'chrome116' : 'firefox140',
      modulePreload: { polyfill: false },
      sourcemap: false,
      rollupOptions: {
        input,
        output: {
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        },
      },
    },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
