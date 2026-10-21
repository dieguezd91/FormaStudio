import type { SourceScope, SourceScopeLevel } from '@/api/types';

export interface FileClass {
  type: 'text' | 'pdf' | 'image';
  mimeType: string;
}

const BY_EXTENSION: Record<string, FileClass> = {
  txt: { type: 'text', mimeType: 'text/plain' },
  md: { type: 'text', mimeType: 'text/markdown' },
  pdf: { type: 'pdf', mimeType: 'application/pdf' },
  png: { type: 'image', mimeType: 'image/png' },
  jpg: { type: 'image', mimeType: 'image/jpeg' },
  jpeg: { type: 'image', mimeType: 'image/jpeg' },
  webp: { type: 'image', mimeType: 'image/webp' },
};

const BY_MIME: Record<string, FileClass> = {
  'text/plain': BY_EXTENSION.txt!,
  'text/markdown': BY_EXTENSION.md!,
  'application/pdf': BY_EXTENSION.pdf!,
  'image/png': BY_EXTENSION.png!,
  'image/jpeg': BY_EXTENSION.jpg!,
  'image/webp': BY_EXTENSION.webp!,
};

/** What a picked file is stored as; undefined for types the slice does not accept. */
export function classifyFile(name: string, mimeType: string): FileClass | undefined {
  const byMime = BY_MIME[mimeType.toLowerCase()];
  if (byMime) return byMime;
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return Object.hasOwn(BY_EXTENSION, extension) ? BY_EXTENSION[extension] : undefined;
}

/** Chunked so large images do not overflow the argument limit of `String.fromCharCode`. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/** Scope for the chosen level; falls back to the whole project when the target is not available. */
export function scopeFor(
  level: SourceScopeLevel,
  screenId: string | null,
  selection: readonly string[],
): SourceScope {
  if (level === 'screen' && screenId) return { level: 'screen', targetId: screenId };
  const [only] = selection;
  if (level === 'node' && selection.length === 1 && only) return { level: 'node', targetId: only };
  return { level: 'project' };
}
