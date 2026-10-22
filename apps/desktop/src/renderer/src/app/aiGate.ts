import { AI_DISABLED_MESSAGE, AI_UNAVAILABLE_MESSAGE, retryAfterOf } from '@/api/aiMessages';
import { isApiError } from '@/api/errors';
import type { AiStatus } from '@/api/types';

/**
 * What the renderer knows about AI. `checking` is the first status request in flight (never blocks);
 * `unknown` means the status could not be read, typically because the local service is down.
 */
export type AiAvailability = 'checking' | 'available' | 'disabled' | 'missingKey' | 'unknown';

/** A recent quota or overload failure: AI stays offered (manual work is never blocked) but flagged. */
export interface AiTransient {
  kind: 'quota' | 'overloaded';
  message: string;
  retryAfterSeconds?: number;
  /** Epoch ms after which the issue is no longer shown; absent when the service gave no retry time. */
  until?: number;
}

export interface AiAvailabilityInfo {
  availability: AiAvailability;
  transient: AiTransient | null;
}

export interface AiGate {
  state: AiAvailability;
  /** AI actions may be attempted. */
  usable: boolean;
  /** Why they cannot, for tooltips and notes. */
  reason: string | null;
  /** The same in one short line, for cards. */
  summary: string | null;
  /** The same with what to do about it, for banners. */
  detail: string | null;
  /** A recent quota/overload issue while AI is still offered. */
  notice: string | null;
  /** The kill switch is on: the AI guide strip is not shown at all. */
  hideGuide: boolean;
  /** Short label for an explicitly disabled AI. */
  offLabel: string | null;
  /** A "Reintentar" link makes sense. */
  canRetry: boolean;
}

export const AI_DISABLED_LABEL = 'IA desactivada en este equipo';
export const AI_MISSING_KEY_REASON =
  'La IA no está disponible: falta la clave de Gemini (GOOGLE_GENERATIVE_AI_API_KEY) en el servicio local.';
export const AI_MISSING_KEY_SUMMARY = 'Falta la clave de Gemini en el servicio local.';
export const AI_UNKNOWN_REASON = 'No se pudo consultar el estado de la IA porque el servicio local no responde.';
const AI_UNKNOWN_SUMMARY = 'No se pudo consultar el estado de la IA.';

/** The kill switch wins over a missing key; AI is usable only when enabled and configured. */
export function availabilityFromStatus(status: AiStatus): 'available' | 'disabled' | 'missingKey' {
  if (!status.enabled) return 'disabled';
  return status.configured ? 'available' : 'missingKey';
}

/** Permanent states an AI route can report on its own. */
export function availabilityFromError(error: unknown): 'disabled' | 'missingKey' | null {
  if (!isApiError(error)) return null;
  if (error.kind === 'aiDisabled') return 'disabled';
  if (error.kind === 'aiUnavailable') return 'missingKey';
  return null;
}

export function transientFromError(error: unknown, now: number): AiTransient | null {
  if (!isApiError(error)) return null;
  const kind = error.kind === 'aiQuota' ? 'quota' : error.kind === 'aiOverloaded' ? 'overloaded' : null;
  if (!kind) return null;
  const retryAfterSeconds = retryAfterOf(error.details);
  return {
    kind,
    message: error.message,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds, until: now + retryAfterSeconds * 1000 }),
  };
}

export function gateAi({ availability, transient }: AiAvailabilityInfo, now: number): AiGate {
  const base = {
    state: availability,
    reason: null,
    summary: null,
    detail: null,
    notice: null,
    hideGuide: false,
    offLabel: null,
    canRetry: true,
  };
  switch (availability) {
    case 'checking':
      return { ...base, usable: true, canRetry: false };
    case 'disabled':
      return {
        ...base,
        usable: false,
        reason: AI_DISABLED_LABEL,
        summary: AI_DISABLED_LABEL,
        detail: AI_DISABLED_MESSAGE,
        hideGuide: true,
        offLabel: AI_DISABLED_LABEL,
      };
    case 'missingKey':
      return {
        ...base,
        usable: false,
        reason: AI_MISSING_KEY_REASON,
        summary: AI_MISSING_KEY_SUMMARY,
        detail: AI_UNAVAILABLE_MESSAGE,
      };
    case 'unknown':
      return { ...base, usable: false, reason: AI_UNKNOWN_REASON, summary: AI_UNKNOWN_SUMMARY, detail: AI_UNKNOWN_REASON };
    case 'available': {
      const active = transient && (transient.until === undefined || transient.until > now) ? transient : null;
      return { ...base, usable: true, notice: active?.message ?? null, canRetry: active !== null };
    }
  }
}
