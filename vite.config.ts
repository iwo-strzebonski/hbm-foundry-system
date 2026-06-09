import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';

const SYSTEM_ID = 'hbm-rpg-v3';

export default defineConfig(({ mode }) => ({
  build: {
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/hbm.ts'),
      formats: ['es'],
      fileName: () => 'hbm.mjs',
    },
    rollupOptions: {
      external: [],
      output: {
        assetFileNames: 'styles/[name][extname]',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'system.json', dest: '.' },
        { src: 'LICENSE.txt', dest: '.' },
        { src: 'lang', dest: '.' },
        { src: 'templates', dest: '.' },
        { src: 'styles', dest: '.' },
        { src: 'assets', dest: '.' },
        { src: 'packs', dest: '.' },
      ],
    }),
  ],
  // Vite dev server is unused; Foundry serves the built files.
  server: { open: false },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  define: {
    __SYSTEM_ID__: JSON.stringify(SYSTEM_ID),
  },
}));
