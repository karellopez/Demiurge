import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

/**
 * The repository is served from a GitHub Pages *project* page, so the build
 * base is the repository name, not `/`. Overridable for alternative static
 * hosts (Cloudflare Pages, Netlify) that serve from the domain root.
 *
 * @see docs/adr/0004-github-pages-base-path.md
 */
const base = process.env['DEMIURGE_BASE'] ?? '/Demiurge/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('src/app', import.meta.url)),
      '@presentation': fileURLToPath(new URL('src/presentation', import.meta.url)),
      '@features': fileURLToPath(new URL('src/features', import.meta.url)),
      '@domain': fileURLToPath(new URL('src/domain', import.meta.url)),
      '@shared': fileURLToPath(new URL('src/shared', import.meta.url)),
      '@tests': fileURLToPath(new URL('tests', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
