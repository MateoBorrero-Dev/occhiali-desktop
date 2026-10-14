import { app, dialog, shell } from 'electron';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { ApplicationDatabase } from '../database';
import type { BackupService } from '../backup/backup-service';
import { BackupError } from '../backup/backup-service';
import { RestoreCoordinator } from '../backup/restore-recovery';
import type { SecurityManager } from '../security/security-manager';
import {
  AuthenticationRequiredError,
  SecurityConfigurationError,
} from '../security/security-manager';
import type { SecurityResult } from '../../shared/ipc-contracts';
import type {
  BackupMetadata,
  BackupOperationResult,
  BackupStatus,
  SecurityStatus,
} from '../../shared/database-models';

function result<T>(operation: () => T | Promise<T>): Promise<SecurityResult<T>> {
  return Promise.resolve()
    .then(operation)
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: {
        code:
          error instanceof SecurityConfigurationError ||
          error instanceof AuthenticationRequiredError
            ? 'SECURITY'
            : error instanceof BackupError
              ? 'BACKUP'
              : 'INTERNAL',
        message:
          error instanceof AuthenticationRequiredError
            ? 'La sesión está bloqueada. Volvé a ingresar tu contraseña.'
            : error instanceof SecurityConfigurationError || error instanceof BackupError
              ? error.message
              : 'No se pudo completar la operación.',
      },
    }));
}

export function createSecurityIpcHandlers(
  security: SecurityManager,
  backups: BackupService,
  database: ApplicationDatabase,
  activeDatabasePath: string,
) {
  return {
    status: (): Promise<SecurityResult<SecurityStatus>> => result(() => security.status()),
    setup: (password: unknown, minutes: unknown) => result(() => security.setup(password, minutes)),
    login: (password: unknown) => result(() => security.login(password)),
    logout: () => result(() => security.logout()),
    touch: () => result(() => security.touchSession()),
    changePassword: (current: unknown, next: unknown) =>
      result(async () => {
        await security.changePassword(current, next);
        return true as const;
      }),
    setInactivity: (minutes: unknown) => result(() => security.setInactivity(minutes)),
    backupStatus: (): Promise<SecurityResult<BackupStatus>> =>
      result(() => {
        security.requireAuthenticated();
        return backups.status();
      }),
    configureBackup: (input: unknown) =>
      result(() => {
        security.requireAuthenticated();
        return backups.configure(input);
      }),
    selectExportDirectory: () =>
      result(async () => {
        security.requireAuthenticated();
        const selected = await dialog.showOpenDialog({
          title: 'Seleccionar carpeta sincronizada',
          properties: ['openDirectory', 'createDirectory'],
        });
        return backups.setExportDirectory(
          selected.canceled ? backups.status().exportDirectory : (selected.filePaths[0] ?? null),
        );
      }),
    createBackup: (password: unknown): Promise<SecurityResult<BackupOperationResult>> =>
      result(() => {
        security.requireAuthenticated();
        return backups.create(database, password);
      }),
    openBackupDirectory: () =>
      result(async () => {
        security.requireAuthenticated();
        const error = await shell.openPath(backups.status().localDirectory);
        if (error) throw new BackupError('No se pudo abrir la carpeta de respaldos.');
        return true as const;
      }),
    selectRestoreFile: () =>
      result(async () => {
        security.requireAuthenticated();
        const selected = await dialog.showOpenDialog({
          title: 'Seleccionar respaldo de Occhiali',
          properties: ['openFile'],
          filters: [{ name: 'Respaldo de Occhiali', extensions: ['ocbackup'] }],
        });
        const path = selected.canceled ? null : (selected.filePaths[0] ?? null);
        backups.setSelectedRestorePath(path);
        return path ? { fileName: basename(path) } : null;
      }),
    verifyBackup: (password: unknown): Promise<SecurityResult<BackupMetadata>> =>
      result(() => {
        security.requireAuthenticated();
        return backups.verifySelected(password);
      }),
    restoreBackup: (password: unknown, confirmed: unknown) =>
      result(async () => {
        security.requireAuthenticated();
        if (confirmed !== true)
          throw new BackupError('La restauración requiere confirmación explícita.');
        const prepared = await backups.prepareRestore(password);
        const coordinator = new RestoreCoordinator(activeDatabasePath);
        let databaseClosed = false;
        try {
          await backups.create(database, password);
          coordinator.begin(prepared.sqlitePath);
          prepared.transferOwnership();
          database.close();
          databaseClosed = true;
          coordinator.moveActiveToRollback();
          await rm(`${activeDatabasePath}-wal`, { force: true });
          await rm(`${activeDatabasePath}-shm`, { force: true });
          coordinator.placeCandidate();
          const verified = ApplicationDatabase.open(activeDatabasePath);
          try {
            if (verified.integrityCheck() !== 'ok' || verified.foreignKeyViolations().length > 0)
              throw new BackupError('La base restaurada no superó la verificación final.');
          } finally {
            verified.close();
          }
          coordinator.markVerified();
          coordinator.confirmAndCleanup();
        } catch (error: unknown) {
          let recovered: boolean;
          try {
            const recovery = coordinator.rollbackPending();
            recovered = recovery.action === 'rolled-back' || recovery.action === 'none';
          } catch {
            recovered = false;
          }
          await prepared.cleanup().catch(() => undefined);
          if (databaseClosed) {
            setTimeout(() => {
              app.relaunch();
              app.exit(1);
            }, 250);
          }
          if (!recovered)
            throw new BackupError(
              'La restauración se interrumpió y requiere revisión técnica. No vuelvas a intentarla antes de reiniciar.',
            );
          throw error instanceof BackupError
            ? error
            : new BackupError('No se pudo recuperar la información. Se conservó la base anterior.');
        } finally {
          await prepared.cleanup().catch(() => undefined);
        }
        setTimeout(() => {
          app.relaunch();
          app.exit(0);
        }, 250);
        return { restartRequired: true as const };
      }),
  };
}
