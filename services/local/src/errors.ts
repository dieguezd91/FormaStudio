import type { FastifyError, FastifyInstance } from 'fastify';

export interface ErrorIssue {
  path: string;
  message: string;
}

/** An error that is safe to show to API clients. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly issues?: ErrorIssue[],
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'notFound', `${what} not found.`);

export const badRequest = (message: string, issues?: ErrorIssue[]) =>
  new AppError(400, 'badRequest', message, issues);

export const unprocessable = (
  code: string,
  message: string,
  issues?: ErrorIssue[],
  details?: Record<string, unknown>,
) => new AppError(422, code, message, issues, details);

export const revisionConflict = (currentRevision: number) =>
  new AppError(
    409,
    'revisionConflict',
    `The document changed since the revision it was based on; current revision is ${currentRevision}.`,
    undefined,
    { currentRevision },
  );

export const payloadTooLarge = (limitBytes: number) =>
  new AppError(413, 'payloadTooLarge', `Content exceeds the ${limitBytes} byte limit.`);

export const forbiddenOrigin = () =>
  new AppError(403, 'forbiddenOrigin', 'Requests from this origin are not allowed.');

export const aiUnavailable = () =>
  new AppError(
    503,
    'aiUnavailable',
    'Las funciones de IA están desactivadas porque falta la clave de la API de Gemini. ' +
      'Define la variable de entorno GOOGLE_GENERATIVE_AI_API_KEY (puedes copiar .env.example a .env) ' +
      'y reinicia el servicio local. El resto de la aplicación sigue funcionando sin IA.',
  );

export const aiDisabled = () =>
  new AppError(
    503,
    'aiDisabled',
    'Las funciones de IA están desactivadas (FORMA_AI_ENABLED=false). ' +
      'Quita la variable o ponla en true y reinicia el servicio local para volver a usarlas. ' +
      'El resto de la aplicación sigue funcionando sin IA.',
  );

/** Splits `path: message` strings produced by the AI validators into error issues. */
const toIssue = (issue: string): ErrorIssue => {
  const at = issue.indexOf(': ');
  return at < 0 ? { path: '', message: issue } : { path: issue.slice(0, at), message: issue.slice(at + 2) };
};

export const aiInvalidOutput = (issues: string[]) =>
  new AppError(
    502,
    'aiInvalidOutput',
    'La IA devolvió una respuesta que no supera la validación, incluso tras reintentar. No se guardó nada.',
    issues.slice(0, 20).map(toIssue),
  );

export const aiProviderError = (reason: string) =>
  new AppError(
    502,
    'aiProviderError',
    'No se pudo completar la llamada al proveedor de IA. Revisa la conexión y vuelve a intentarlo.',
    undefined,
    { reason: reason.slice(0, 300) },
  );

/** 400 from the provider: the request itself was refused, so retrying cannot help. */
export const aiRequestRejected = (providerMessage: string | undefined) =>
  new AppError(
    502,
    'aiRequestRejected',
    'Gemini rechazó el formato del pedido (no es un problema de tu clave ni de tu cuota). ' +
      'No se reintentó. Si persiste, es un error de la aplicación: avisa con el detalle.',
    undefined,
    { ...(providerMessage === undefined ? {} : { providerMessage }) },
  );

export const aiAuthFailed = () =>
  new AppError(
    502,
    'aiAuthFailed',
    'Gemini indica que la clave no es válida o no tiene acceso al modelo. ' +
      'Revisa GOOGLE_GENERATIVE_AI_API_KEY (puedes crear una en Google AI Studio) y reinicia el servicio local.',
  );

export interface QuotaInfo {
  freeTier?: boolean | undefined;
  daily?: boolean | undefined;
  retryAfterSeconds?: number | undefined;
}

export const aiQuotaExceeded = ({ freeTier = false, daily = false, retryAfterSeconds }: QuotaInfo) =>
  new AppError(
    429,
    'aiQuotaExceeded',
    [
      freeTier
        ? `Se agotó la cuota ${daily ? 'diaria ' : ''}del nivel gratuito de la API de Gemini.`
        : 'Se agotó la cuota de la API de Gemini.',
      ...(retryAfterSeconds === undefined ? [] : [`Puedes reintentar en ${retryAfterSeconds} s.`]),
      'Una suscripción a Google AI Pro o Google One no incluye cuota de API:',
      'espera a que se renueve o habilita la facturación del proyecto en Google AI Studio.',
    ].join(' '),
    undefined,
    { freeTier, daily, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) },
  );

export const aiOverloaded = (retryAfterSeconds?: number) =>
  new AppError(
    503,
    'aiOverloaded',
    'El modelo de Gemini está saturado, probá en unos minutos.' +
      (retryAfterSeconds === undefined ? '' : ` Google sugiere esperar ${retryAfterSeconds} s.`),
    undefined,
    retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
  );

export const aiTimeout = () =>
  new AppError(
    504,
    'aiTimeout',
    'Gemini tardó demasiado en responder. Vuelve a intentarlo; si el pedido es muy grande, redúcelo.',
  );

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    issues?: ErrorIssue[];
    details?: Record<string, unknown>;
  };
}

function toBody(error: AppError): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.issues ? { issues: error.issues } : {}),
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

/** Maps errors raised by Fastify itself (bad JSON, oversized body, ...) onto the envelope. */
function fromFastify(error: FastifyError): AppError | undefined {
  const status = error.statusCode;
  if (status === undefined || status < 400 || status >= 500) return undefined;
  if (status === 413) return new AppError(413, 'payloadTooLarge', error.message);
  if (status === 415) return new AppError(415, 'unsupportedMediaType', error.message);
  return new AppError(status, 'badRequest', error.message);
}

/** Consistent `{ error: { code, message, issues? } }` bodies; stack traces never leave the process. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof AppError ? error : fromFastify(error as FastifyError);
    if (known) return reply.code(known.statusCode).send(toBody(known));
    request.log.error(error);
    return reply
      .code(500)
      .send({ error: { code: 'internalError', message: 'Internal server error.' } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(toBody(notFound(`Route ${request.method} ${request.url.split('?')[0]}`))),
  );
}
