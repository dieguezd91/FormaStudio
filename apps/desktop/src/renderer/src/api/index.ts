import { createApiClient, DEFAULT_SERVICE_URL } from './client';

export const SERVICE_URL: string = import.meta.env.VITE_FORMA_SERVICE_URL ?? DEFAULT_SERVICE_URL;

export const api = createApiClient({ baseUrl: SERVICE_URL });

export * from './aiMessages';
export * from './client';
export * from './errors';
export * from './types';
