import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api';

export type ServiceStatus = 'checking' | 'up' | 'down';

const POLL_MS = 4000;

/** Pings the local service so the UI can explain, instead of failing, when it is not running. */
export function useServiceStatus(): { status: ServiceStatus; recheck: () => Promise<void> } {
  const [status, setStatus] = useState<ServiceStatus>('checking');

  const recheck = useCallback(async () => {
    try {
      await api.health();
      setStatus('up');
    } catch {
      setStatus('down');
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void recheck(), 0);
    const timer = setInterval(() => void recheck(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [recheck]);

  return { status, recheck };
}
