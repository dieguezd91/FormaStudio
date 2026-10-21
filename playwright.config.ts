import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Workers re-evaluate this file; the env var keeps the whole run on the same fresh data dir.
process.env.FORMA_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'forma-e2e-'));

const SERVICE_PORT = 4399;
// The service CORS allowlist only accepts the Vite dev origin (localhost/127.0.0.1:5173).
const RENDERER_PORT = 5173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${RENDERER_PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1600, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } }],
  webServer: [
    {
      command: 'npm run dev:service',
      url: `http://127.0.0.1:${SERVICE_PORT}/health`,
      reuseExistingServer: false,
      env: { FORMA_PORT: String(SERVICE_PORT), FORMA_DATA_DIR: process.env.FORMA_E2E_DATA_DIR },
    },
    {
      command: 'npm run dev:web',
      url: `http://localhost:${RENDERER_PORT}`,
      reuseExistingServer: false,
      env: { VITE_FORMA_SERVICE_URL: `http://127.0.0.1:${SERVICE_PORT}` },
    },
  ],
});
