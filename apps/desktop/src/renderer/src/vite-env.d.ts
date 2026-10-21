/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORMA_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
