import { app, ipcMain } from 'electron';
import type { ApplicationDatabase } from '../database';
import { assertNoArguments, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppInfo } from '../../shared/ipc-contracts';
import { createClientIpcHandlers } from './client-handlers';
import { createPrescriptionIpcHandlers } from './prescription-handlers';

export function registerIpcHandlers(database: ApplicationDatabase): void {
  ipcMain.handle(IPC_CHANNELS.appInfo, (_event, ...args: unknown[]): AppInfo => {
    assertNoArguments(IPC_CHANNELS.appInfo, args);
    return Object.freeze({ name: 'OCCHIALI', version: app.getVersion() });
  });

  const clients = createClientIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.clientsList, (_event, ...args: unknown[]) => clients.list(...args));
  ipcMain.handle(IPC_CHANNELS.clientsGet, (_event, ...args: unknown[]) => clients.get(...args));
  ipcMain.handle(IPC_CHANNELS.clientsCreate, (_event, ...args: unknown[]) =>
    clients.create(...args),
  );
  ipcMain.handle(IPC_CHANNELS.clientsUpdate, (_event, ...args: unknown[]) =>
    clients.update(...args),
  );
  ipcMain.handle(IPC_CHANNELS.clientsArchive, (_event, ...args: unknown[]) =>
    clients.archive(...args),
  );
  ipcMain.handle(IPC_CHANNELS.clientsRestore, (_event, ...args: unknown[]) =>
    clients.restore(...args),
  );

  const prescriptions = createPrescriptionIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.prescriptionsList, (_event, ...args: unknown[]) =>
    prescriptions.list(...args),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsListByClient, (_event, ...args: unknown[]) =>
    prescriptions.listByClient(...args),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsGet, (_event, ...args: unknown[]) =>
    prescriptions.get(...args),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsCreate, (_event, ...args: unknown[]) =>
    prescriptions.create(...args),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsCorrect, (_event, ...args: unknown[]) =>
    prescriptions.correct(...args),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsRevisions, (_event, ...args: unknown[]) =>
    prescriptions.revisions(...args),
  );
}
