import { defineConfig } from 'vite';
import { rendererConfig } from './vite.renderer.shared';

export default defineConfig({
  ...rendererConfig,
  server: { port: 5173, strictPort: true },
});
