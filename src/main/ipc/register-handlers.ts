import { app, ipcMain } from 'electron';
import type { ApplicationDatabase } from '../database';
import { assertNoArguments, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppInfo } from '../../shared/ipc-contracts';
import { createClientIpcHandlers } from './client-handlers';
import { createPrescriptionIpcHandlers } from './prescription-handlers';
import { createOpticalJobIpcHandlers } from './optical-job-handlers';
import { createQueryIpcHandlers } from './query-handlers';

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

  const opticalJobs = createOpticalJobIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.opticalJobsList, (_event, ...args: unknown[]) =>
    opticalJobs.list(...args),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsListByClient, (_event, ...args: unknown[]) =>
    opticalJobs.listByClient(...args),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsListByPrescription, (_event, ...args: unknown[]) =>
    opticalJobs.listByPrescription(...args),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsGet, (_event, ...args: unknown[]) =>
    opticalJobs.get(...args),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsCreate, (_event, ...args: unknown[]) =>
    opticalJobs.create(...args),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsUpdate, (_event, ...args: unknown[]) =>
    opticalJobs.update(...args),
  );
  ipcMain.handle(IPC_CHANNELS.treatmentsList, (_event, ...args: unknown[]) =>
    opticalJobs.treatments(...args),
  );

  const queries = createQueryIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.dashboardSummary, (_event, ...args: unknown[]) =>
    queries.dashboard(...args),
  );
  ipcMain.handle(IPC_CHANNELS.globalSearch, (_event, ...args: unknown[]) =>
    queries.globalSearch(...args),
  );
}
