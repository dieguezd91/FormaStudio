import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from './server';
import { PNG_BASE64 } from './testing';

describe('persistence', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('keeps projects, documents and blobs across restarts when given a dataDir', async () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), 'forma-persist-')), 'nested', 'data');
    dirs.push(join(dataDir, '..', '..'));

    const first = buildServer({ dataDir });
    const project = (
      await first.inject({
        method: 'POST',
        url: '/projects',
        payload: { name: 'Persisted', target: { platform: 'unity', ui: 'ugui' } },
      })
    ).json();
    const source = (
      await first.inject({
        method: 'POST',
        url: `/projects/${project.id}/sources`,
        payload: {
          kind: 'reference',
          title: 'shot',
          mimeType: 'image/png',
          dataBase64: PNG_BASE64,
          scope: { level: 'project' },
        },
      })
    ).json();
    await first.close();
    expect(existsSync(join(dataDir, 'forma.sqlite'))).toBe(true);

    const second = buildServer({ dataDir });
    try {
      const got = await second.inject({ method: 'GET', url: `/projects/${project.id}` });
      expect(got.statusCode).toBe(200);
      expect(got.json().name).toBe('Persisted');
      const blob = await second.inject({
        method: 'GET',
        url: `/projects/${project.id}/sources/${source.id}/blob`,
      });
      expect(blob.rawPayload.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
    } finally {
      await second.close();
    }
  });

  it('prefers an explicit dbPath over dataDir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forma-dbpath-'));
    dirs.push(dir);
    const dbPath = join(dir, 'custom.sqlite');
    const app = buildServer({ dbPath, dataDir: join(dir, 'ignored') });
    await app.close();
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(join(dir, 'ignored', 'forma.sqlite'))).toBe(false);
  });
});
