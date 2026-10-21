import { describe, expect, it } from 'vitest';
import { bytesToBase64, classifyFile, scopeFor } from './files';

describe('classifyFile', () => {
  it('detects text, markdown, pdf and images by mime type or extension', () => {
    expect(classifyFile('notas.txt', '')).toEqual({ type: 'text', mimeType: 'text/plain' });
    expect(classifyFile('brief.md', '')).toEqual({ type: 'text', mimeType: 'text/markdown' });
    expect(classifyFile('spec.pdf', 'application/pdf')).toEqual({ type: 'pdf', mimeType: 'application/pdf' });
    expect(classifyFile('ref.PNG', '')).toEqual({ type: 'image', mimeType: 'image/png' });
    expect(classifyFile('ref.jpeg', 'image/jpeg')).toEqual({ type: 'image', mimeType: 'image/jpeg' });
    expect(classifyFile('ref.webp', '')).toEqual({ type: 'image', mimeType: 'image/webp' });
  });

  it('rejects anything else', () => {
    expect(classifyFile('virus.exe', 'application/octet-stream')).toBeUndefined();
    expect(classifyFile('anim.gif', 'image/gif')).toBeUndefined();
  });
});

describe('bytesToBase64', () => {
  it('encodes small and large buffers like Buffer does', () => {
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    const decoded = Uint8Array.from(atob(bytesToBase64(big)), (char) => char.charCodeAt(0));
    expect(decoded).toEqual(big);
  });
});

describe('scopeFor', () => {
  it('maps the chosen level to a service scope', () => {
    expect(scopeFor('project', 's1', ['n1'])).toEqual({ level: 'project' });
    expect(scopeFor('screen', 's1', [])).toEqual({ level: 'screen', targetId: 's1' });
    expect(scopeFor('node', 's1', ['n1'])).toEqual({ level: 'node', targetId: 'n1' });
  });

  it('falls back to project scope when the target is missing', () => {
    expect(scopeFor('screen', null, [])).toEqual({ level: 'project' });
    expect(scopeFor('node', 's1', [])).toEqual({ level: 'project' });
    expect(scopeFor('node', 's1', ['a', 'b'])).toEqual({ level: 'project' });
  });
});
