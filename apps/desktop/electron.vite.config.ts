import { defineConfig } from 'electron-vite';
import { rendererConfig } from './vite.renderer.shared';

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: rendererConfig,
});
