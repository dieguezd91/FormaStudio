/** Spanish messages for AI failures; the renderer words them itself so retry times read like a person's. */

export const AI_ENV_VAR = 'GOOGLE_GENERATIVE_AI_API_KEY';
export const AI_KILL_SWITCH_VAR = 'FORMA_AI_ENABLED';

export const AI_UNAVAILABLE_MESSAGE =
  `Las funciones de IA están desactivadas porque falta la clave de Gemini. Definí la variable de entorno ${AI_ENV_VAR} ` +
  '(podés copiar .env.example a .env) y reiniciá el servicio local. El trabajo manual no se ve afectado.';

export const AI_DISABLED_MESSAGE =
  `La IA está desactivada en este equipo (${AI_KILL_SWITCH_VAR}=false). No se envía nada a Google. ` +
  'El trabajo manual no se ve afectado.';

export const AI_TIMEOUT_MESSAGE =
  'Gemini tardó demasiado en responder. Volvé a intentarlo; si el pedido es muy grande, reducilo.';

export const AI_AUTH_FAILED_MESSAGE =
  'Gemini indica que la clave no es válida o no tiene acceso al modelo. ' +
  `Revisá ${AI_ENV_VAR} (podés crear una en Google AI Studio) y reiniciá el servicio local.`;

export const AI_REQUEST_REJECTED_MESSAGE =
  'Gemini rechazó el formato del pedido (no es un problema de tu clave ni de tu cuota). ' +
  'No se reintentó. Si persiste, es un error de la aplicación: avisá con el detalle.';

export const AI_PROVIDER_ERROR_MESSAGE =
  'No se pudo completar la llamada al proveedor de IA. Revisá la conexión y volvé a intentarlo.';

/** "30 s", "~15 min", "~18 h", "~3 días": rough on purpose, retry-after is only a hint. */
export function formatRetryAfter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'unos instantes';
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  if (seconds < 86_400) return `~${Math.round(seconds / 3600)} h`;
  const days = Math.round(seconds / 86_400);
  return `~${days} ${days === 1 ? 'día' : 'días'}`;
}

/** The `retryAfterSeconds` an AI error carries in its details, when it is a usable number. */
export function retryAfterOf(details: Record<string, unknown> | undefined): number | undefined {
  const value = details?.retryAfterSeconds;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function quotaMessage(details: Record<string, unknown> | undefined): string {
  const freeTier = details?.freeTier === true;
  const daily = details?.daily === true;
  const retryAfter = retryAfterOf(details);
  return [
    freeTier
      ? `Se agotó la cuota ${daily ? 'diaria ' : ''}del nivel gratuito de la API de Gemini.`
      : 'Se agotó la cuota de la API de Gemini.',
    retryAfter === undefined
      ? 'Probá de nuevo más tarde.'
      : `Para usar la IA podés volver a intentar en ${formatRetryAfter(retryAfter)}.`,
    ...(freeTier
      ? [
          'Una suscripción a Google AI Pro o Google One no incluye cuota de API: esperá a que se renueve ' +
            'o habilitá la facturación del proyecto en Google AI Studio.',
        ]
      : []),
    'El trabajo manual no se ve afectado.',
  ].join(' ');
}

export function overloadedMessage(details: Record<string, unknown> | undefined): string {
  const retryAfter = retryAfterOf(details);
  return (
    'El modelo de Gemini está saturado. ' +
    (retryAfter === undefined
      ? 'Probá de nuevo en unos minutos.'
      : `Podés volver a intentar en ${formatRetryAfter(retryAfter)}.`)
  );
}
