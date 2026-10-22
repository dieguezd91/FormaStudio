import { APICallError } from 'ai';

export type AiProviderErrorKind =
  /** 400: the provider refused the request itself (schema, arguments). Retrying cannot help. */
  | 'rejected'
  /** 401/403 or an invalid API key. */
  | 'auth'
  /** 429: quota or rate limit exhausted. */
  | 'quota'
  /** 503 / "high demand": transient, the only kind we retry. */
  | 'overloaded'
  | 'timeout'
  | 'unknown';

export interface AiProviderErrorInfo {
  kind: AiProviderErrorKind;
  statusCode?: number;
  /** The provider's own message, truncated; safe to show (it never contains the request). */
  providerMessage?: string;
  retryAfterSeconds?: number;
  /** Quota errors only: the exhausted quota belongs to the free tier. */
  freeTier?: boolean;
  /** Quota errors only: the exhausted quota is a per-day one. */
  daily?: boolean;
}

const MAX_MESSAGE_CHARS = 500;

/** The provider call itself failed (network, quota, auth, rejected request, timeout). */
export class AiProviderError extends Error implements AiProviderErrorInfo {
  readonly kind: AiProviderErrorKind;
  readonly statusCode?: number;
  readonly providerMessage?: string;
  readonly retryAfterSeconds?: number;
  readonly freeTier?: boolean;
  readonly daily?: boolean;

  constructor(message: string, info: Partial<AiProviderErrorInfo> = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = info.kind ?? 'unknown';
    if (info.statusCode !== undefined) this.statusCode = info.statusCode;
    if (info.providerMessage !== undefined) this.providerMessage = info.providerMessage;
    if (info.retryAfterSeconds !== undefined) this.retryAfterSeconds = info.retryAfterSeconds;
    if (info.freeTier !== undefined) this.freeTier = info.freeTier;
    if (info.daily !== undefined) this.daily = info.daily;
  }
}

interface GoogleErrorBody {
  message?: string;
  status?: string;
  details: Record<string, unknown>[];
}

function parseGoogleError(body: string | undefined): GoogleErrorBody {
  const empty: GoogleErrorBody = { details: [] };
  if (body === undefined) return empty;
  try {
    const parsed: unknown = JSON.parse(body);
    const error = (parsed as { error?: unknown } | null)?.error;
    if (typeof error !== 'object' || error === null) return empty;
    const { message, status, details } = error as Record<string, unknown>;
    return {
      ...(typeof message === 'string' ? { message } : {}),
      ...(typeof status === 'string' ? { status } : {}),
      details: Array.isArray(details)
        ? details.filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
        : [],
    };
  } catch {
    return empty;
  }
}

/** "34s", "34.2s" or a bare number of seconds, rounded up. */
function parseSeconds(value: unknown): number | undefined {
  const match = typeof value === 'string' ? /^\s*(\d+(?:\.\d+)?)\s*s?\s*$/.exec(value) : null;
  const seconds = match ? Number(match[1]) : typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

function retryAfterOf(body: GoogleErrorBody, headers: Record<string, string> | undefined): number | undefined {
  for (const detail of body.details) {
    if (String(detail['@type']).endsWith('RetryInfo')) {
      const seconds = parseSeconds(detail.retryDelay);
      if (seconds !== undefined) return seconds;
    }
  }
  const fromMessage = /retry in (\d+(?:\.\d+)?)s/i.exec(body.message ?? '');
  if (fromMessage) return parseSeconds(fromMessage[1]);
  const header = headers?.['retry-after'] ?? headers?.['Retry-After'];
  return parseSeconds(header);
}

const quotaIds = (body: GoogleErrorBody): string[] =>
  body.details.flatMap((detail) =>
    Array.isArray(detail.violations)
      ? (detail.violations as { quotaId?: unknown }[]).flatMap((v) =>
          typeof v.quotaId === 'string' ? [v.quotaId] : [],
        )
      : [],
  );

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

const isApiKeyInvalid = (message: string, body: GoogleErrorBody): boolean =>
  /api key not valid|api_key_invalid/i.test(message) ||
  body.details.some((detail) => detail.reason === 'API_KEY_INVALID');

/**
 * Turns whatever the AI SDK threw into an `AiProviderError` with a stable `kind`. Only
 * `APICallError` carries HTTP semantics; everything else is `unknown` (or `timeout` for aborts).
 * Never throws and never includes request content.
 */
export function classifyProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (isTimeout(error)) {
    return new AiProviderError('The AI provider call timed out.', { kind: 'timeout' });
  }
  if (!APICallError.isInstance(error)) {
    const message = error instanceof Error ? error.message : String(error);
    return new AiProviderError(message.slice(0, MAX_MESSAGE_CHARS));
  }

  const body = parseGoogleError(error.responseBody);
  const providerMessage = (body.message ?? error.message).slice(0, MAX_MESSAGE_CHARS);
  const statusCode = error.statusCode;
  const base = { ...(statusCode === undefined ? {} : { statusCode }), providerMessage };
  const retryAfterSeconds = retryAfterOf(body, error.responseHeaders);
  const retry = retryAfterSeconds === undefined ? {} : { retryAfterSeconds };

  if (statusCode === 401 || statusCode === 403 || isApiKeyInvalid(providerMessage, body)) {
    return new AiProviderError(providerMessage, { ...base, kind: 'auth' });
  }
  if (statusCode === 429 || body.status === 'RESOURCE_EXHAUSTED') {
    const ids = quotaIds(body);
    return new AiProviderError(providerMessage, {
      ...base,
      ...retry,
      kind: 'quota',
      freeTier: ids.some((id) => /FreeTier/i.test(id)),
      daily: ids.some((id) => /PerDay/i.test(id)),
    });
  }
  if (statusCode === 503 || body.status === 'UNAVAILABLE' || /overloaded|high demand/i.test(providerMessage)) {
    return new AiProviderError(providerMessage, { ...base, ...retry, kind: 'overloaded' });
  }
  if (statusCode === 504 || body.status === 'DEADLINE_EXCEEDED') {
    return new AiProviderError(providerMessage, { ...base, kind: 'timeout' });
  }
  if (statusCode === 400) {
    return new AiProviderError(providerMessage, { ...base, kind: 'rejected' });
  }
  return new AiProviderError(providerMessage, base);
}
