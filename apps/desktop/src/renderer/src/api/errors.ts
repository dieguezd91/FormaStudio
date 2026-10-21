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

/** Maps the service error envelope onto a typed error with a Spanish message. */
export function errorFromResponse(status: number, body: unknown): ApiError {
  const envelope = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)
    ?.error;
  const code = envelope?.code ?? 'unknown';
  const serverMessage = envelope?.message;
  const details = envelope?.details as Record<string, unknown> | undefined;
  const base = { status, code, ...(serverMessage ? { serverMessage } : {}), ...(details ? { details } : {}) };

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
