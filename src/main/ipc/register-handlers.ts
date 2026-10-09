import { app, ipcMain } from 'electron';
import { assertNoArguments, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppInfo } from '../../shared/ipc-contracts';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appInfo, (_event, ...args: unknown[]): AppInfo => {
    assertNoArguments(IPC_CHANNELS.appInfo, args);

    return Object.freeze({
      name: 'OCCHIALI',
      version: app.getVersion(),
    });
  });
}
