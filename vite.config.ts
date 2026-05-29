import { defineConfig } from 'vite';
import path from 'node:path';
import solid from 'vite-plugin-solid';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  plugins: [
    solid(),
    electron([
      {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              // bufferutil / utf-8-validate are OPTIONAL native addons of
              // `ws` (pulled in transitively by the sarvamai SDK). They
              // aren't installed; `ws` already wraps their require() in a
              // try/catch and falls back to pure JS. Marking them external
              // keeps them as runtime requires instead of letting Rollup
              // emit a hard-failing resolve stub.
              external: [
                'electron',
                'electron-store',
                'active-win',
                // Loaded from node_modules at runtime (shipped in app
                // dependencies); bundling it pulls in dynamic requires.
                'electron-updater',
                'bufferutil',
                'utf-8-validate',
              ],
            },
          },
        },
      },
      {
        entry: 'src/main/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'src/renderer/overlay/index.html'),
        toolbar: path.resolve(__dirname, 'src/renderer/toolbar/index.html'),
      },
    },
  },
});
