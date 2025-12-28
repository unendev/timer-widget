/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  electron: {
    send: (channel: string, data?: any) => void;
    receive: (channel: string, func: (...args: any[]) => void) => () => void;
  };
}
