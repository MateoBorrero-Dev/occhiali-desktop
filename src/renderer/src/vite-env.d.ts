/// <reference types="vite/client" />

import type { AppInfo } from '../../shared/ipc-contracts';

declare global {
  interface Window {
    optica: {
      getAppInfo: () => Promise<AppInfo>;
    };
  }
}

export {};
