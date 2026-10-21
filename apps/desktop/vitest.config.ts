import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rendererSrc = resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/renderer/src');

export default defineConfig({
  resolve: { alias: { '@': rendererSrc } },
  test: {
    name: 'desktop',
    include: ['src/**/*.test.ts'],
  },
});
