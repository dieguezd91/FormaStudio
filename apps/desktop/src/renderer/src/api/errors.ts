import {
  AI_AUTH_FAILED_MESSAGE,
  AI_DISABLED_MESSAGE,
  AI_PROVIDER_ERROR_MESSAGE,
  AI_REQUEST_REJECTED_MESSAGE,
  AI_TIMEOUT_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  overloadedMessage,
  quotaMessage,
} from './aiMessages';

export type ApiErrorKind =
  /** The service could not be reached at all. */
  | 'unavailable'
  /** 409: the document changed since the revision the request was based on. */
  | 'conflict'
  /** 422: the service understood the request but refused the change. */
  | 'rejected'
  | 'notFound'
  | 'tooLarge'
  | 'invalid'
  | 'forbidden'
  /** 503 from an AI route: no Gemini key is configured. Manual work is unaffected. */
  | 'aiUnavailable'
  /** 503 from an AI route: the kill switch (FORMA_AI_ENABLED=false) is on. */
  | 'aiDisabled'
  /** 429 from an AI route: the Gemini quota is exhausted; `details.retryAfterSeconds` may say when. */
  | 'aiQuota'
  /** 503 from an AI route: the model is overloaded right now. */
  | 'aiOverloaded'
  /** 504 from an AI route: Gemini took too long. */
  | 'aiTimeout'
  /** 502 from an AI route: the provider failed, refused the request or its output did not validate. */
  | 'aiFailed'
  /** The caller cancelled the request. */
  | 'aborted'
  | 'server';

export interface ApiErrorInit {
  kind: ApiErrorKind;
  status: number;
  code: string;
  /** Spanish, safe to show to the user. */
  message: string;
  /** Original service message (English), kept for diagnostics. */
  serverMessage?: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly serverMessage: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.serverMessage = init.serverMessage;
    this.details = init.details;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export const isServiceUnavailable = (error: unknown): boolean =>
  isApiError(error) && error.kind === 'unavailable';

export function serviceUnavailableError(): ApiError {
  return new ApiError({
    kind: 'unavailable',
    status: 0,
    code: 'unavailable',
    message: 'No se pudo conectar con el servicio local.',
  });
}

export const isAiUnavailable = (error: unknown): boolean =>
  isApiError(error) && error.kind === 'aiUnavailable';

export const isAborted = (error: unknown): boolean => isApiError(error) && error.kind === 'aborted';

export function abortedError(): ApiError {
  return new ApiError({ kind: 'aborted', status: 0, code: 'aborted', message: 'Solicitud cancelada.' });
}

const OPERATION_MESSAGES: Record<string, string> = {
  screenNotFound: 'la pantalla ya no existe',
  nodeNotFound: 'el elemento ya no existe',
  itemNotFound: 'el elemento buscado ya no existe',
  duplicateId: 'ya existe un elemento con ese identificador',
  wouldCreateCycle: 'no se puede mover un elemento dentro de sí mismo',
  locked: 'el elemento está bloqueado',
  rootImmutable: 'el elemento raíz de la pantalla no se puede modificar así',
  invalidOperation: 'la operación no es válida',
  invalidBatch: 'el lote de cambios no es válido',
  invalidDocument: 'el documento no es válido',
};

/** Spanish reason for a design-core / service operation error code. */
export const operationReason = (code: string, fallback: string): string =>
  OPERATION_MESSAGES[code] ?? fallback;

/** Kind and Spanish message of the AI route errors the service classifies (see docs/ai.md). */
function aiErrorFromCode(
  code: string,
  details: Record<string, unknown> | undefined,
): { kind: ApiErrorKind; message: string } | undefined {
  switch (code) {
    case 'aiUnavailable':
      return { kind: 'aiUnavailable', message: AI_UNAVAILABLE_MESSAGE };
    case 'aiDisabled':
      return { kind: 'aiDisabled', message: AI_DISABLED_MESSAGE };
    case 'aiQuotaExceeded':
      return { kind: 'aiQuota', message: quotaMessage(details) };
    case 'aiOverloaded':
      return { kind: 'aiOverloaded', message: overloadedMessage(details) };
    case 'aiTimeout':
      return { kind: 'aiTimeout', message: AI_TIMEOUT_MESSAGE };
    case 'aiAuthFailed':
      return { kind: 'aiFailed', message: AI_AUTH_FAILED_MESSAGE };
    case 'aiRequestRejected':
      return { kind: 'aiFailed', message: AI_REQUEST_REJECTED_MESSAGE };
    case 'aiProviderError':
      return { kind: 'aiFailed', message: AI_PROVIDER_ERROR_MESSAGE };
    default:
      return undefined;
  }
}

/** Maps the service error envelope onto a typed error with a Spanish message. */
export function errorFromResponse(
  status: number,
  body: unknown,
  /** AI routes already answer in Spanish with the exact reason, so it is shown as is. */
  options: { ai?: boolean; export?: boolean } = {},
): ApiError {
  const envelope = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)
    ?.error;
  const code = envelope?.code ?? 'unknown';
  const serverMessage = envelope?.message;
  const details = envelope?.details as Record<string, unknown> | undefined;
  const base = { status, code, ...(serverMessage ? { serverMessage } : {}), ...(details ? { details } : {}) };

  if (options.ai) {
    const ai = aiErrorFromCode(code, details);
    if (ai) return new ApiError({ ...base, ...ai });
  }
  if (options.ai && status === 502) {
    return new ApiError({
      ...base,
      kind: 'aiFailed',
      message: serverMessage ?? 'La IA no pudo completar la solicitud. No se guardó nada.',
    });
  }
  if (options.ai && status === 422 && serverMessage) {
    return new ApiError({ ...base, kind: 'rejected', message: serverMessage });
  }

  // Export routes answer 400/422 in Spanish with the exact reason (folder, manifest, document).
  if (options.export && (status === 400 || status === 422) && serverMessage) {
    return new ApiError({
      ...base,
      kind: status === 422 ? 'rejected' : 'invalid',
      message: serverMessage,
    });
  }

  if (status === 409) {
    return new ApiError({
      ...base,
      kind: 'conflict',
      message: 'El documento cambió desde la última vez que lo cargaste.',
    });
  }
  if (status === 422) {
    const reason = operationReason(code, serverMessage ?? 'el servicio lo rechazó');
    return new ApiError({ ...base, kind: 'rejected', message: `Cambio rechazado: ${reason}.` });
  }
  if (status === 404) {
    return new ApiError({ ...base, kind: 'notFound', message: 'No se encontró lo que buscabas.' });
  }
  if (status === 413) {
    return new ApiError({
      ...base,
      kind: 'tooLarge',
      message: 'El archivo es demasiado grande para guardarlo.',
    });
  }
  if (status === 403) {
    return new ApiError({
      ...base,
      kind: 'forbidden',
      message: 'El servicio local rechazó el origen de la aplicación.',
    });
  }
  if (status >= 400 && status < 500) {
    return new ApiError({
      ...base,
      kind: 'invalid',
      message: `La solicitud no es válida${serverMessage ? `: ${serverMessage}` : '.'}`,
    });
  }
  return new ApiError({
    ...base,
    kind: 'server',
    message: 'El servicio local tuvo un error inesperado.',
  });
}
