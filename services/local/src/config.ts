import { homedir } from 'node:os';
import { join } from 'node:path';

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 4318;
export const DB_FILE_NAME = 'forma.sqlite';

/** Returns a TCP port in 1..65535; throws a message naming `FORMA_PORT` otherwise. */
export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid FORMA_PORT "${raw}": expected an integer between 1 and 65535.`);
  }
  return port;
}

export function resolveDataDir(
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  if (env.FORMA_DATA_DIR) return env.FORMA_DATA_DIR;
  if (env.APPDATA) return join(env.APPDATA, 'FormaStudio');
  return join(home, '.forma-studio');
}
