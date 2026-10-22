import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ApiClient } from '@/api/client';
import type { AiStatus } from '@/api/types';
import { availabilityFromError, availabilityFromStatus, transientFromError, type AiAvailability, type AiTransient } from './aiGate';

export type AiStatusApi = Pick<ApiClient, 'getAiStatus'>;

export interface AiAvailabilityState {
  availability: AiAvailability;
  status: AiStatus | null;
  transient: AiTransient | null;

  /** Reads `GET /ai/status`; also the "Reintentar" action (it clears any transient issue). */
  load: () => Promise<void>;
  /** An AI call failed: record a permanent state or a transient quota/overload issue. Other errors are ignored. */
  reportError: (error: unknown) => void;
  /** An AI call worked: AI is available and nothing is degraded. */
  reportSuccess: () => void;
}

/** Whether AI can be used at all, app-wide; loaded on start and refreshed on demand. */
export function createAiAvailabilityStore(
  api: AiStatusApi,
  now: () => number = Date.now,
): StoreApi<AiAvailabilityState> {
  return createStore<AiAvailabilityState>()((set) => ({
    availability: 'checking',
    status: null,
    transient: null,

    async load() {
      try {
        const status = await api.getAiStatus();
        set({ status, availability: availabilityFromStatus(status), transient: null });
      } catch {
        set({ availability: 'unknown', transient: null });
      }
    },

    reportError(error) {
      const permanent = availabilityFromError(error);
      if (permanent) {
        set({ availability: permanent, transient: null });
        return;
      }
      const transient = transientFromError(error, now());
      if (transient) set({ transient });
    },

    reportSuccess: () => set({ availability: 'available', transient: null }),
  }));
}
