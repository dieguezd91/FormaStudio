/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORMA_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface FormaBridge {
  platform?: string;
  /** Present only inside Electron (exposed by the preload script). */
  pickFolder?: () => Promise<string | null>;
}

interface Window {
  forma?: FormaBridge;
}
