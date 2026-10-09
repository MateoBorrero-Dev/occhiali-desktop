/// <reference types="vite/client" />

import type { AppInfo, ClientApi } from '../../shared/ipc-contracts';

declare global {
  interface Window {
    optica: {
      getAppInfo: () => Promise<AppInfo>;
      clients: ClientApi;
    };
  }
}

export {};
