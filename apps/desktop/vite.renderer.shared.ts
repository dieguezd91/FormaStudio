import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { UserConfig } from 'vite';

const rendererRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/renderer');

/** Renderer config shared by the Electron build and the plain-browser `dev:web` server. */
export const rendererConfig: UserConfig = {
  root: rendererRoot,
  resolve: {
    alias: { '@': resolve(rendererRoot, 'src') },
  },
  plugins: [react(), tailwindcss()],
};
