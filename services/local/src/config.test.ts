import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, parsePort, resolveDataDir } from './config';

const posix = (path: string) => path.split('\\').join('/');

describe('parsePort', () => {
  it('defaults when unset or empty', () => {
    expect(parsePort(undefined)).toBe(DEFAULT_PORT);
    expect(parsePort('')).toBe(DEFAULT_PORT);
  });

  it('accepts integers in 1..65535', () => {
    expect(parsePort('1')).toBe(1);
    expect(parsePort('4318')).toBe(4318);
    expect(parsePort('65535')).toBe(65535);
  });

  it.each(['0', '65536', '-1', '1.5', 'abc', '80abc', '1e3', ' 80', '0x50', '000000080'])(
    'rejects %j with a message naming FORMA_PORT',
    (raw) => {
      expect(() => parsePort(raw)).toThrow(/FORMA_PORT/);
    },
  );
});

describe('resolveDataDir', () => {
  it('prefers FORMA_DATA_DIR', () => {
    expect(resolveDataDir({ FORMA_DATA_DIR: '/data', APPDATA: '/roaming' }, '/home/u')).toBe(
      '/data',
    );
  });

  it('uses %APPDATA%/FormaStudio when available', () => {
    expect(posix(resolveDataDir({ APPDATA: '/roaming' }, '/home/u'))).toBe('/roaming/FormaStudio');
  });

  it('falls back to ~/.forma-studio', () => {
    expect(posix(resolveDataDir({}, '/home/u'))).toBe('/home/u/.forma-studio');
  });
});
