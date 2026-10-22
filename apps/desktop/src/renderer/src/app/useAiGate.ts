import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { api } from '@/api';
import { createAiAvailabilityStore, type AiAvailabilityState } from './aiAvailabilityStore';
import { gateAi, type AiGate } from './aiGate';

/** The single AI availability of the app, bound to the real local service. */
export const aiAvailability = createAiAvailabilityStore(api);

export function useAiAvailability<T>(selector: (state: AiAvailabilityState) => T): T {
  return useStore(aiAvailability, selector);
}

/** Current AI gating for any control that offers AI. */
export function useAiGate(): AiGate {
  const availability = useAiAvailability((state) => state.availability);
  const transient = useAiAvailability((state) => state.transient);
  const [now, setNow] = useState(Date.now);
  const until = transient?.until;

  // A quota/overload notice lapses on its own once the retry time has passed.
  useEffect(() => {
    if (until === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, until - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [until]);

  return gateAi({ availability, transient }, now);
}

export const retryAiStatus = () => aiAvailability.getState().load();
