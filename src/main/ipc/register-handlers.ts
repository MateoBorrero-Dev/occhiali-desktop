import { app, ipcMain } from 'electron';
import type { ApplicationDatabase } from '../database';
import { assertArgumentCount, assertNoArguments, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppInfo } from '../../shared/ipc-contracts';
import { createClientIpcHandlers } from './client-handlers';
import { createPrescriptionIpcHandlers } from './prescription-handlers';
import { createOpticalJobIpcHandlers } from './optical-job-handlers';
import { createQueryIpcHandlers } from './query-handlers';
import { createSecurityIpcHandlers } from './security-handlers';
import type { SecurityManager } from '../security/security-manager';
import type { BackupService } from '../backup/backup-service';
import type { BackupCredentialStore } from '../backup/backup-credential-store';
import { createDeliveryReceiptIpcHandlers } from './delivery-receipt-handlers';
import { ElectronDeliveryReceiptPdfExporter } from '../documents/delivery-receipt-pdf';

export function registerIpcHandlers(
  database: ApplicationDatabase,
  security: SecurityManager,
  backups: BackupService,
  databasePath: string,
  credentials: BackupCredentialStore,
  onAutomationChanged: () => Promise<unknown>,
): void {
  const authorized = <T>(operation: () => T): T => {
    security.requireAuthenticated();
    return operation();
  };
  ipcMain.handle(IPC_CHANNELS.appInfo, (_event, ...args: unknown[]): AppInfo => {
    assertNoArguments(IPC_CHANNELS.appInfo, args);
    return Object.freeze({ name: 'OCCHIALI', version: app.getVersion() });
  });

  const clients = createClientIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.clientsList, (_event, ...args: unknown[]) =>
    authorized(() => clients.list(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.clientsGet, (_event, ...args: unknown[]) =>
    authorized(() => clients.get(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.clientsCreate, (_event, ...args: unknown[]) =>
    authorized(() => clients.create(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.clientsUpdate, (_event, ...args: unknown[]) =>
    authorized(() => clients.update(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.clientsArchive, (_event, ...args: unknown[]) =>
    authorized(() => clients.archive(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.clientsRestore, (_event, ...args: unknown[]) =>
    authorized(() => clients.restore(...args)),
  );

  const prescriptions = createPrescriptionIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.prescriptionsList, (_event, ...args: unknown[]) =>
    authorized(() => prescriptions.list(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsListByClient, (_event, ...args: unknown[]) =>
    authorized(() => prescriptions.listByClient(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsGet, (_event, ...args: unknown[]) =>
    authorized(() => prescriptions.get(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsCreate, (_event, ...args: unknown[]) =>
    authorized(() => prescriptions.create(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsCreateIntegrated, (_event, ...args: unknown[]) =>
    authorized(() => prescriptions.createIntegrated(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsCorrect, (_event, ...args: unknown[]) =>
    authorized(() => prescriptions.correct(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.prescriptionsRevisions, (_event, ...args: unknown[]) =>
    authorized(() => prescriptions.revisions(...args)),
  );

  const opticalJobs = createOpticalJobIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.opticalJobsList, (_event, ...args: unknown[]) =>
    authorized(() => opticalJobs.list(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsListByClient, (_event, ...args: unknown[]) =>
    authorized(() => opticalJobs.listByClient(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsListByPrescription, (_event, ...args: unknown[]) =>
    authorized(() => opticalJobs.listByPrescription(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsGet, (_event, ...args: unknown[]) =>
    authorized(() => opticalJobs.get(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsCreate, (_event, ...args: unknown[]) =>
    authorized(() => opticalJobs.create(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.opticalJobsUpdate, (_event, ...args: unknown[]) =>
    authorized(() => opticalJobs.update(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.treatmentsList, (_event, ...args: unknown[]) =>
    authorized(() => opticalJobs.treatments(...args)),
  );

  const deliveryReceipts = createDeliveryReceiptIpcHandlers(
    database,
    new ElectronDeliveryReceiptPdfExporter(),
  );
  ipcMain.handle(IPC_CHANNELS.deliveryReceiptsGet, (_event, ...args: unknown[]) =>
    authorized(() => deliveryReceipts.get(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.deliveryReceiptsGetByJob, (_event, ...args: unknown[]) =>
    authorized(() => deliveryReceipts.getByJob(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.deliveryReceiptsCreate, (_event, ...args: unknown[]) =>
    authorized(() => deliveryReceipts.create(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.deliveryReceiptsAddEvent, (_event, ...args: unknown[]) =>
    authorized(() => deliveryReceipts.addEvent(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.deliveryReceiptsExportPdf, (_event, ...args: unknown[]) =>
    authorized(() => deliveryReceipts.exportPdf(...args)),
  );

  const queries = createQueryIpcHandlers(database);
  ipcMain.handle(IPC_CHANNELS.dashboardSummary, (_event, ...args: unknown[]) =>
    authorized(() => queries.dashboard(...args)),
  );
  ipcMain.handle(IPC_CHANNELS.globalSearch, (_event, ...args: unknown[]) =>
    authorized(() => queries.globalSearch(...args)),
  );

  const secure = createSecurityIpcHandlers(
    security,
    backups,
    database,
    databasePath,
    credentials,
    onAutomationChanged,
  );
  const strict = (
    channel: string,
    expected: number,
    operation: (...args: unknown[]) => unknown,
  ): void => {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      assertArgumentCount(channel, args, expected);
      return operation(...args);
    });
  };
  strict(IPC_CHANNELS.securityStatus, 0, () => secure.status());
  strict(IPC_CHANNELS.securitySetup, 2, (password, minutes) => secure.setup(password, minutes));
  strict(IPC_CHANNELS.securityLogin, 1, (password) => secure.login(password));
  strict(IPC_CHANNELS.securityLogout, 0, () => secure.logout());
  strict(IPC_CHANNELS.securityTouch, 0, () => secure.touch());
  strict(IPC_CHANNELS.securityChangePassword, 2, (current, next) =>
    secure.changePassword(current, next),
  );
  strict(IPC_CHANNELS.securitySetInactivity, 1, (minutes) => secure.setInactivity(minutes));
  strict(IPC_CHANNELS.backupStatus, 0, () => secure.backupStatus());
  strict(IPC_CHANNELS.backupHistory, 0, () => secure.backupHistory());
  strict(IPC_CHANNELS.backupConfigure, 1, (input) => secure.configureBackup(input));
  strict(IPC_CHANNELS.backupSetAutomaticCredential, 1, (password) =>
    secure.setAutomaticCredential(password),
  );
  strict(IPC_CHANNELS.backupClearAutomaticCredential, 0, () => secure.clearAutomaticCredential());
  strict(IPC_CHANNELS.backupSelectExportDirectory, 0, () => secure.selectExportDirectory());
  strict(IPC_CHANNELS.backupCreate, 1, (password) => secure.createBackup(password));
  strict(IPC_CHANNELS.backupOpenDirectory, 0, () => secure.openBackupDirectory());
  strict(IPC_CHANNELS.backupSelectRestoreFile, 0, () => secure.selectRestoreFile());
  strict(IPC_CHANNELS.backupVerify, 1, (password) => secure.verifyBackup(password));
  strict(IPC_CHANNELS.backupRestore, 2, (password, confirmed) =>
    secure.restoreBackup(password, confirmed),
  );
}
