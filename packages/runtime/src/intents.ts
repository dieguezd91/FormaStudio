import type { FormaDocument } from '@forma/design-core';
import { cloneJson } from './clone';
import { reconcile, tagRecords } from './records';
import type { ScreenIndex } from './screen';
import { SIMULATED_INTENTS, simulate, type SimResult } from './simulation';
import type { IntentHandler, IntentHandlers, RuntimeEvent, RuntimeState } from './types';

export interface Env {
  doc: FormaDocument;
  index: ScreenIndex;
  handlers: Partial<IntentHandlers>;
  now: () => number;
}

const isSimulated = (name: string) => (Object.values(SIMULATED_INTENTS) as string[]).includes(name);

/** The host answered `accept` with authoritative data: replace those sources wholesale. */
function applyHostData(env: Env, state: RuntimeState, data: Record<string, unknown>): void {
  for (const [id, rows] of Object.entries(data)) {
    const tagged = tagRecords(cloneJson(rows), state.nextUid);
    state.data[id] = tagged.data;
    state.nextUid = tagged.nextUid;
  }
  reconcile(state, env.index);
}

function runCustom(
  env: Env,
  state: RuntimeState,
  handler: IntentHandler,
  call: Parameters<IntentHandler>[0],
): SimResult {
  let answer: ReturnType<IntentHandler>;
  try {
    answer = handler(call);
  } catch (error) {
    return {
      ok: false,
      reason: `El manejador falló: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!answer.accept) return { ok: false, reason: answer.reason ?? 'Rechazado por el manejador.' };
  if (answer.data) {
    applyHostData(env, state, answer.data);
    return { ok: true };
  }
  return simulate(call.name, state, env.index, call.payload) ?? { ok: true };
}

/**
 * The UI expresses an intent; something decides (§10.5). A custom handler wins, else the
 * simulated game answers for the intents it knows, else nobody does. The event always carries
 * the intent's real `connection` from the document.
 */
export function emitIntent(
  env: Env,
  state: RuntimeState,
  intentId: string,
  payload: Record<string, unknown>,
): void {
  const intent = env.doc.intents.find((i) => i.id === intentId);
  const name = intent?.name ?? intentId;
  const connection = intent?.connection ?? 'unconnected';
  const custom = env.handlers[name];

  let handledBy: RuntimeEvent['handledBy'];
  let result: SimResult;
  if (custom) {
    handledBy = 'custom';
    result = runCustom(env, state, custom, {
      intentId,
      name,
      payload,
      connection,
      data: cloneJson(state.data),
    });
  } else if (isSimulated(name)) {
    handledBy = 'simulated';
    result = simulate(name, state, env.index, payload) ?? { ok: true };
  } else {
    handledBy = 'none';
    result = { ok: false, reason: `Sin manejador: nadie atiende «${name}».` };
  }

  state.log.push({
    type: 'intent',
    at: env.now(),
    intentId,
    name,
    payload,
    connection,
    handledBy,
    outcome: result.ok ? 'applied' : 'rejected',
    ...(result.ok ? {} : { reason: result.reason }),
  });
}
