export const IPC_CHANNELS = {
  appInfo: 'app:get-info',
} as const;

export interface AppInfo {
  name: string;
  version: string;
}

export function assertNoArguments(channel: string, args: readonly unknown[]): void {
  if (args.length !== 0) {
    throw new TypeError(`El canal ${channel} no acepta argumentos.`);
  }
}
