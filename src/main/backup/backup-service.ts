import { createCipheriv, createDecipheriv, randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ApplicationDatabase } from '../database';
import { getMigrationIds } from '../database/migrations';
import { BackupHistoryStore } from './backup-history';
import { applySafeLocalRetention } from './backup-retention';
import {
  ExternalBackupCopier,
  ExternalBackupCopyError,
  isSafeExternalBackupFileSync,
  validateExternalDirectorySync,
} from './external-backup-copy';
import type {
  BackupExternalState,
  BackupHistorySnapshot,
  BackupMetadata,
  BackupOperationResult,
  BackupStatus,
} from '../../shared/database-models';

const MAGIC = 'OCCHIALI_BACKUP';
const FORMAT_VERSION = 1;
const KDF = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

interface BackupEnvelope {
  magic: typeof MAGIC;
  metadata: BackupMetadata;
  kdf: { name: 'scrypt'; salt: string; N: number; r: number; p: number };
  cipher: { name: 'aes-256-gcm'; nonce: string; tag: string };
  payload: string;
}

interface AuthenticatedHeader {
  magic: typeof MAGIC;
  metadata: BackupMetadata;
  kdf: BackupEnvelope['kdf'];
  cipher: Pick<BackupEnvelope['cipher'], 'name' | 'nonce'>;
}
interface Settings {
  automationConfigurationVersion: 1;
  localDirectory: string;
  exportDirectory: string | null;
  lastBackupAt: string | null;
  lastBackupFile: string | null;
  lastBackupSizeBytes: number | null;
  lastErrorAt: string | null;
  lastExternalCopyAt: string | null;
  lastExternalCopyFile: string | null;
  lastExternalCopyStatus: 'UNKNOWN' | 'PENDING' | 'COPIED' | 'FAILED';
  pendingExternalCopyFile: string | null;
  pendingExternalTemporaryFile: string | null;
  pendingExternalAttempts: number;
  nextExternalRetryAt: string | null;
  pendingExternalSourceTrigger: 'MANUAL' | 'AUTOMATIC' | null;
  lastRestoreAt: string | null;
  lastAutomaticBackupAt: string | null;
  lastAutomaticAttemptAt: string | null;
  lastAutomaticErrorAt: string | null;
  monitoringStartedAt: string;
  automaticEnabled: boolean;
  automaticHour: number;
  retentionCount: number;
}

export class BackupError extends Error {}

export type BackupCreationTrigger = 'MANUAL' | 'AUTOMATIC' | 'RESTORE_SAFETY';
export type ExternalRetryResult = 'NONE' | 'NOT_DUE' | 'BUSY' | 'SUCCESS' | 'PENDING' | 'FAILED';

const EXTERNAL_MAX_ATTEMPTS = 3;
const EXTERNAL_RETRY_DELAYS_MS = [60_000, 5 * 60_000] as const;
const EXTERNAL_TEMPORARY_NAME = /^\.occhiali-backup-\d{17}\.ocbackup\.[a-f0-9]{16}\.partial$/;

async function removeSqliteArtifacts(path: string): Promise<void> {
  await rm(path, { force: true });
  await rm(`${path}-wal`, { force: true });
  await rm(`${path}-shm`, { force: true });
}

export class PreparedRestore {
  private transferred = false;

  public constructor(
    public readonly metadata: BackupMetadata,
    public readonly sqlitePath: string,
  ) {}

  public transferOwnership(): string {
    if (this.transferred) throw new BackupError('El archivo temporal ya fue transferido.');
    this.transferred = true;
    return this.sqlitePath;
  }

  public async cleanup(): Promise<void> {
    if (!this.transferred) await removeSqliteArtifacts(this.sqlitePath);
  }
}

export function validateRecoveryPassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    throw new BackupError('La contraseña de recuperación debe tener entre 12 y 128 caracteres.');
}
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 32, KDF, (error, key) => (error ? reject(error) : resolve(key)));
  });
}
function safeTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, '').slice(0, 17);
}

function validDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeBackupFileName(value: string | null): string | null {
  if (!value || basename(value) !== value || !/^occhiali-backup-\d{17}\.ocbackup$/.test(value))
    return null;
  return value;
}

function historyFileReference(value: string): string {
  const name = basename(value);
  return /^occhiali-backup-\d{17}\.ocbackup$/.test(name) ? name : 'respaldo-seleccionado.ocbackup';
}

function sanitizedError(error: unknown): string {
  return error instanceof BackupError
    ? error.message.slice(0, 240)
    : 'La operación no se completó.';
}

export function calculateBackupDue(
  lastBackupAt: string | null,
  automaticEnabled: boolean,
  automaticHour: number,
  monitoringStartedAt: string,
  lastBackupExists: boolean,
  now: Date,
): boolean {
  if (!automaticEnabled) return false;
  if (lastBackupAt && !lastBackupExists) return true;
  const todayCutoff = new Date(now);
  todayCutoff.setHours(automaticHour, 0, 0, 0);
  const cutoff = new Date(todayCutoff);
  const beforeTodayCutoff = now < todayCutoff;
  if (beforeTodayCutoff) cutoff.setDate(cutoff.getDate() - 1);
  const monitoring = validDate(monitoringStartedAt) ?? now;
  if (beforeTodayCutoff && cutoff < monitoring) return false;
  const last = validDate(lastBackupAt);
  return !last || last < cutoff;
}

export function scheduledBackupWindowStart(now: Date, automaticHour: number): Date {
  const cutoff = new Date(now);
  cutoff.setHours(automaticHour, 0, 0, 0);
  if (now < cutoff) cutoff.setDate(cutoff.getDate() - 1);
  return cutoff;
}

export function calculateBackupAlert(
  lastBackupAt: string | null,
  monitoringStartedAt: string,
  lastRestoreAt: string | null,
  lastBackupExists: boolean,
  now: Date,
): BackupStatus['alertLevel'] {
  if (lastBackupAt && !lastBackupExists) return 'MISSING';
  const reference =
    [validDate(lastBackupAt), validDate(monitoringStartedAt), validDate(lastRestoreAt)]
      .filter((value): value is Date => value !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? now;
  const ageHours = Math.max(0, (now.getTime() - reference.getTime()) / 3_600_000);
  if (ageHours >= 72) return 'CRITICAL';
  if (ageHours >= 24) return 'WARNING';
  return 'NONE';
}

function authenticatedHeader(envelope: Omit<BackupEnvelope, 'payload'>): Buffer {
  const header: AuthenticatedHeader = {
    magic: envelope.magic,
    metadata: envelope.metadata,
    kdf: envelope.kdf,
    cipher: { name: envelope.cipher.name, nonce: envelope.cipher.nonce },
  };
  return Buffer.from(JSON.stringify(header));
}

export class BackupService {
  private settings: Settings;
  private readonly historyStore: BackupHistoryStore;
  private busy = false;
  private restoreInProgress = false;
  private automaticRunning = false;
  private protectedCredentialState: BackupStatus['protectedCredentialState'] = 'MISSING';
  private readonly idleWaiters = new Set<() => void>();
  private selectedRestorePath: string | null = null;

  public constructor(
    private readonly settingsPath: string,
    private readonly appVersion: string,
    private readonly now: () => Date = () => new Date(),
    private readonly externalCopier: ExternalBackupCopier = new ExternalBackupCopier(),
  ) {
    const defaultDirectory = join(dirname(settingsPath), 'backups');
    this.settings = this.load(defaultDirectory);
    this.historyStore = new BackupHistoryStore(
      join(dirname(settingsPath), 'backup-history.json'),
      now,
    );
    mkdirSync(this.settings.localDirectory, { recursive: true });
    this.save();
  }

  public status(): BackupStatus {
    const now = this.now();
    const lastBackupFile = safeBackupFileName(this.settings.lastBackupFile);
    const lastBackupExists =
      !!lastBackupFile && existsSync(join(this.settings.localDirectory, lastBackupFile));
    const lastBackupDate = validDate(this.settings.lastBackupAt);
    const lastBackupAgeHours = lastBackupDate
      ? Math.max(0, (now.getTime() - lastBackupDate.getTime()) / 3_600_000)
      : null;
    const history = this.historyStore.snapshot();
    return {
      localDirectory: this.settings.localDirectory,
      exportDirectory: this.settings.exportDirectory,
      lastBackupAt: this.settings.lastBackupAt,
      lastBackupFile,
      lastBackupSizeBytes: this.settings.lastBackupSizeBytes,
      lastBackupExists,
      lastBackupAgeHours,
      lastErrorAt: this.settings.lastErrorAt,
      lastExternalCopyAt: this.settings.lastExternalCopyAt,
      nextExternalRetryAt: this.settings.nextExternalRetryAt,
      externalRetryAttempts: this.settings.pendingExternalAttempts,
      lastRestoreAt: this.settings.lastRestoreAt,
      lastAutomaticBackupAt: this.settings.lastAutomaticBackupAt,
      lastAutomaticAttemptAt: this.settings.lastAutomaticAttemptAt,
      lastAutomaticErrorAt: this.settings.lastAutomaticErrorAt,
      automaticEnabled: this.settings.automaticEnabled,
      automaticHour: this.settings.automaticHour,
      retentionCount: this.settings.retentionCount,
      protectedCredentialState: this.protectedCredentialState,
      automaticState: this.automaticState(),
      due: calculateBackupDue(
        this.settings.lastBackupAt,
        this.settings.automaticEnabled,
        this.settings.automaticHour,
        this.settings.monitoringStartedAt,
        lastBackupExists,
        now,
      ),
      alertLevel: calculateBackupAlert(
        this.settings.lastBackupAt,
        this.settings.monitoringStartedAt,
        this.settings.lastRestoreAt,
        lastBackupExists,
        now,
      ),
      externalCopyStatus: this.externalCopyStatus(),
      historyAvailable: history.available,
      historyRecoveredFromDamage: history.recoveredFromDamage,
      busy: this.isCriticalOperation(),
      remoteSyncVerified: false,
    };
  }

  public history(): BackupHistorySnapshot {
    return this.historyStore.snapshot();
  }

  public configure(input: unknown): BackupStatus {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
      throw new BackupError('La configuración no es válida.');
    const value = input as Record<string, unknown>;
    if (
      Object.keys(value).some(
        (key) => !['automaticEnabled', 'automaticHour', 'retentionCount'].includes(key),
      )
    )
      throw new BackupError('La configuración no es válida.');
    if (
      typeof value.automaticEnabled !== 'boolean' ||
      typeof value.automaticHour !== 'number' ||
      !Number.isInteger(value.automaticHour) ||
      value.automaticHour < 0 ||
      value.automaticHour > 23 ||
      typeof value.retentionCount !== 'number' ||
      !Number.isInteger(value.retentionCount) ||
      value.retentionCount < 2 ||
      value.retentionCount > 90
    )
      throw new BackupError('La configuración no es válida.');
    const scheduleChanged =
      this.settings.automaticEnabled !== value.automaticEnabled ||
      this.settings.automaticHour !== value.automaticHour;
    this.settings = {
      ...this.settings,
      automaticEnabled: value.automaticEnabled,
      automaticHour: value.automaticHour,
      retentionCount: value.retentionCount,
      ...(scheduleChanged ? { lastAutomaticAttemptAt: null, lastAutomaticErrorAt: null } : {}),
    };
    this.save();
    return this.status();
  }

  public setProtectedCredentialState(
    state: BackupStatus['protectedCredentialState'],
  ): BackupStatus {
    this.protectedCredentialState = state;
    return this.status();
  }

  public resetAutomaticAttempt(): void {
    this.settings.lastAutomaticAttemptAt = null;
    this.settings.lastAutomaticErrorAt = null;
    this.save();
  }

  public automaticAttemptedForCurrentWindow(now: Date = this.now()): boolean {
    const attempted = validDate(this.settings.lastAutomaticAttemptAt);
    return !!attempted && attempted >= scheduledBackupWindowStart(now, this.settings.automaticHour);
  }

  public recordAutomaticFailure(error: unknown): void {
    const occurredAt = this.now().toISOString();
    this.settings.lastAutomaticAttemptAt = occurredAt;
    this.settings.lastAutomaticErrorAt = occurredAt;
    this.settings.lastErrorAt = occurredAt;
    try {
      this.save();
    } catch {
      // A scheduler status error must not stop the commercial application.
    }
    this.recordHistory({
      occurredAt,
      operation: 'CREATE',
      trigger: 'AUTOMATIC',
      result: 'FAILURE',
      localState: 'FAILED',
      externalState: this.settings.exportDirectory ? 'UNKNOWN' : 'NOT_CONFIGURED',
      error: sanitizedError(error),
    });
  }

  public beginRestore(): void {
    if (this.isCriticalOperation())
      throw new BackupError('Hay otra operación de respaldo o restauración en curso.');
    this.restoreInProgress = true;
  }

  public endRestore(): void {
    this.restoreInProgress = false;
    this.notifyIdle();
  }

  public isCriticalOperation(): boolean {
    return this.busy || this.restoreInProgress;
  }

  public waitUntilIdle(): Promise<void> {
    if (!this.isCriticalOperation()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  public async setExportDirectory(path: string | null): Promise<BackupStatus> {
    if (this.isCriticalOperation())
      throw new BackupError('Hay otra operación de respaldo o restauración en curso.');
    let next: string | null;
    try {
      next = path ? validateExternalDirectorySync(path) : null;
    } catch (error: unknown) {
      if (error instanceof ExternalBackupCopyError) throw new BackupError(error.message);
      throw error;
    }
    if (next !== this.settings.exportDirectory) {
      if (
        this.settings.exportDirectory &&
        this.settings.pendingExternalCopyFile &&
        this.settings.pendingExternalTemporaryFile
      )
        await this.externalCopier.cleanupPersistedTemporary(
          this.settings.exportDirectory,
          this.settings.pendingExternalCopyFile,
          this.settings.pendingExternalTemporaryFile,
        );
      this.settings.lastExternalCopyAt = null;
      this.settings.lastExternalCopyFile = null;
      this.settings.lastExternalCopyStatus = 'UNKNOWN';
      this.clearPendingExternalCopy();
    }
    this.settings.exportDirectory = next;
    this.save();
    return this.status();
  }
  public setSelectedRestorePath(path: string | null): void {
    this.selectedRestorePath = path ? resolve(path) : null;
  }
  public selectedRestoreFileName(): string | null {
    return this.selectedRestorePath ? basename(this.selectedRestorePath) : null;
  }

  public async create(
    database: ApplicationDatabase,
    recoveryPassword: unknown,
    trigger: BackupCreationTrigger = 'MANUAL',
  ): Promise<BackupOperationResult> {
    validateRecoveryPassword(recoveryPassword);
    if (this.restoreInProgress && trigger !== 'RESTORE_SAFETY')
      throw new BackupError('Hay una restauración en curso.');
    if (this.busy) throw new BackupError('Ya hay una copia de seguridad en curso.');
    this.busy = true;
    this.automaticRunning = trigger === 'AUTOMATIC';
    const now = this.now();
    const fileName = `occhiali-backup-${safeTimestamp(now)}.ocbackup`;
    const temporarySqlite = join(this.settings.localDirectory, `.${fileName}.sqlite.tmp`);
    const partial = join(this.settings.localDirectory, `${fileName}.partial`);
    const finalPath = join(this.settings.localDirectory, fileName);
    const historyTrigger = trigger === 'AUTOMATIC' ? 'AUTOMATIC' : 'MANUAL';
    try {
      if (trigger === 'AUTOMATIC') {
        this.settings.lastAutomaticAttemptAt = now.toISOString();
        this.settings.lastAutomaticErrorAt = null;
        this.save();
        this.recordHistory({
          occurredAt: now.toISOString(),
          operation: 'CREATE',
          trigger: 'AUTOMATIC',
          result: 'STARTED',
          localState: 'NOT_APPLICABLE',
          externalState: this.settings.exportDirectory ? 'UNKNOWN' : 'NOT_CONFIGURED',
        });
      }
      await mkdir(this.settings.localDirectory, { recursive: true });
      await database.backupTo(temporarySqlite);
      const checked = ApplicationDatabase.open(temporarySqlite);
      try {
        if (checked.integrityCheck() !== 'ok' || checked.foreignKeyViolations().length > 0)
          throw new BackupError('La copia SQLite no superó la verificación de integridad.');
      } finally {
        checked.close();
      }
      const metadata: BackupMetadata = {
        formatVersion: FORMAT_VERSION,
        createdAt: now.toISOString(),
        appVersion: this.appVersion,
        schemaMigrations: database.getAppliedMigrationIds(),
      };
      const envelope = await this.encrypt(
        await readFile(temporarySqlite),
        recoveryPassword,
        metadata,
      );
      await writeFile(partial, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
      const verification = await this.decryptAndValidate(partial, recoveryPassword);
      await verification.cleanup();
      await rename(partial, finalPath);
      let exportedToSyncFolder = false;
      let exportError = false;
      let externalCopyPending = false;
      if (this.settings.exportDirectory) {
        try {
          const temporaryName = this.externalCopier.temporaryName(fileName);
          this.settings.pendingExternalCopyFile = fileName;
          this.settings.pendingExternalTemporaryFile = temporaryName;
          this.settings.pendingExternalAttempts = 1;
          this.settings.pendingExternalSourceTrigger = historyTrigger;
          this.settings.nextExternalRetryAt = null;
          this.settings.lastExternalCopyStatus = 'PENDING';
          this.save();
          await this.externalCopier.transfer(
            finalPath,
            this.settings.exportDirectory,
            fileName,
            temporaryName,
          );
          exportedToSyncFolder = true;
          this.markExternalCopySucceeded(fileName, metadata.createdAt);
          this.clearPendingExternalCopy();
        } catch {
          exportError = true;
          externalCopyPending = true;
          this.settings.lastExternalCopyAt = null;
          this.settings.lastExternalCopyFile = fileName;
          this.settings.lastExternalCopyStatus = 'PENDING';
          this.settings.nextExternalRetryAt = new Date(
            this.now().getTime() + EXTERNAL_RETRY_DELAYS_MS[0],
          ).toISOString();
        }
      }
      const sizeBytes = (await stat(finalPath)).size;
      this.settings.lastBackupAt = metadata.createdAt;
      this.settings.lastBackupFile = fileName;
      this.settings.lastBackupSizeBytes = sizeBytes;
      this.settings.lastErrorAt = exportError ? metadata.createdAt : null;
      if (trigger === 'AUTOMATIC') {
        this.settings.lastAutomaticBackupAt = metadata.createdAt;
        this.settings.lastAutomaticErrorAt = exportError ? metadata.createdAt : null;
      }
      this.save();
      await this.applyRetentionSafely();
      this.recordHistory({
        occurredAt: metadata.createdAt,
        operation: 'CREATE',
        trigger: historyTrigger,
        result: exportError ? 'PARTIAL' : 'SUCCESS',
        localState: 'VALID',
        externalState: externalCopyPending
          ? 'PENDING'
          : this.historyExternalState(exportError, exportedToSyncFolder),
        fileName,
        sizeBytes,
        ...(exportError
          ? { error: 'El respaldo local es válido; la copia externa quedó pendiente de reintento.' }
          : {}),
      });
      if (this.settings.exportDirectory) {
        this.recordHistory({
          occurredAt: metadata.createdAt,
          operation: 'EXPORT',
          trigger: historyTrigger,
          result: exportError ? 'PARTIAL' : 'SUCCESS',
          localState: 'VALID',
          externalState: exportError ? 'PENDING' : 'COPIED',
          fileName,
          sizeBytes,
          ...(exportError
            ? { error: 'La copia externa no se completó y se reintentará de forma acotada.' }
            : {}),
        });
      }
      return {
        fileName,
        createdAt: metadata.createdAt,
        exportedToSyncFolder,
        exportError,
        externalCopyPending,
        remoteSyncVerified: false,
      };
    } catch (error: unknown) {
      const occurredAt = this.now().toISOString();
      this.settings.lastErrorAt = occurredAt;
      if (trigger === 'AUTOMATIC') this.settings.lastAutomaticErrorAt = occurredAt;
      this.save();
      const localExists = existsSync(finalPath);
      this.recordHistory({
        occurredAt,
        operation: 'CREATE',
        trigger: historyTrigger,
        result: localExists ? 'PARTIAL' : 'FAILURE',
        localState: localExists ? 'VALID' : 'FAILED',
        externalState: this.settings.exportDirectory ? 'FAILED' : 'NOT_CONFIGURED',
        fileName,
        error: sanitizedError(error),
      });
      if (error instanceof BackupError) throw error;
      throw new BackupError('No se pudo crear la copia de seguridad.');
    } finally {
      this.busy = false;
      this.automaticRunning = false;
      this.notifyIdle();
      await rm(temporarySqlite, { force: true }).catch(() => undefined);
      await rm(partial, { force: true }).catch(() => undefined);
    }
  }

  public async retryPendingExternalCopy(): Promise<ExternalRetryResult> {
    const fileName = safeBackupFileName(this.settings.pendingExternalCopyFile);
    const directory = this.settings.exportDirectory;
    if (
      this.settings.lastExternalCopyStatus !== 'PENDING' ||
      !fileName ||
      !directory ||
      this.settings.pendingExternalAttempts >= EXTERNAL_MAX_ATTEMPTS
    )
      return 'NONE';
    const due = validDate(this.settings.nextExternalRetryAt);
    if (!due || due > this.now()) return 'NOT_DUE';
    if (this.isCriticalOperation()) return 'BUSY';

    this.busy = true;
    const occurredAt = this.now().toISOString();
    const sourcePath = join(this.settings.localDirectory, fileName);
    const previousTemporary = this.safeExternalTemporaryName(
      this.settings.pendingExternalTemporaryFile,
    );
    const temporaryName = this.externalCopier.temporaryName(fileName);
    this.settings.pendingExternalTemporaryFile = temporaryName;
    this.settings.pendingExternalAttempts += 1;
    this.settings.nextExternalRetryAt = null;
    this.save();
    try {
      await this.externalCopier.cleanupPersistedTemporary(directory, fileName, previousTemporary);
      await this.externalCopier.transfer(sourcePath, directory, fileName, temporaryName);
      const sizeBytes = (await stat(sourcePath)).size;
      this.markExternalCopySucceeded(fileName, occurredAt);
      if (this.settings.pendingExternalSourceTrigger === 'AUTOMATIC')
        this.settings.lastAutomaticErrorAt = null;
      this.settings.lastErrorAt = null;
      this.clearPendingExternalCopy();
      this.save();
      this.recordHistory({
        occurredAt,
        operation: 'EXPORT',
        trigger: 'RETRY',
        result: 'SUCCESS',
        localState: 'VALID',
        externalState: 'COPIED',
        fileName,
        sizeBytes,
      });
      return 'SUCCESS';
    } catch {
      const localExists = existsSync(sourcePath);
      const exhausted = this.settings.pendingExternalAttempts >= EXTERNAL_MAX_ATTEMPTS;
      this.settings.pendingExternalTemporaryFile = null;
      this.settings.lastExternalCopyStatus = exhausted ? 'FAILED' : 'PENDING';
      this.settings.lastErrorAt = occurredAt;
      if (this.settings.pendingExternalSourceTrigger === 'AUTOMATIC')
        this.settings.lastAutomaticErrorAt = occurredAt;
      this.settings.nextExternalRetryAt = exhausted
        ? null
        : new Date(
            this.now().getTime() +
              (EXTERNAL_RETRY_DELAYS_MS[
                Math.min(
                  this.settings.pendingExternalAttempts - 1,
                  EXTERNAL_RETRY_DELAYS_MS.length - 1,
                )
              ] ?? 5 * 60_000),
          ).toISOString();
      this.save();
      this.recordHistory({
        occurredAt,
        operation: 'EXPORT',
        trigger: 'RETRY',
        result: exhausted ? 'FAILURE' : 'PARTIAL',
        localState: localExists ? 'VALID' : 'MISSING',
        externalState: exhausted ? 'FAILED' : 'PENDING',
        fileName,
        error: localExists
          ? exhausted
            ? 'La copia externa agotó sus reintentos; el respaldo local sigue disponible.'
            : 'La copia externa sigue pendiente; se programó otro reintento.'
          : 'El respaldo local pendiente ya no está disponible; no se realizará otra copia.',
      });
      if (!localExists) {
        this.settings.lastExternalCopyStatus = 'FAILED';
        this.settings.nextExternalRetryAt = null;
        this.save();
        return 'FAILED';
      }
      return exhausted ? 'FAILED' : 'PENDING';
    } finally {
      this.busy = false;
      this.notifyIdle();
    }
  }

  public async verifySelected(recoveryPassword: unknown): Promise<BackupMetadata> {
    validateRecoveryPassword(recoveryPassword);
    if (!this.selectedRestorePath) throw new BackupError('Seleccioná un archivo de respaldo.');
    if (this.isCriticalOperation())
      throw new BackupError('Hay otra operación de respaldo o restauración en curso.');
    this.busy = true;
    const selectedPath = this.selectedRestorePath;
    const fileName = historyFileReference(selectedPath);
    let prepared: PreparedRestore;
    try {
      prepared = await this.decryptAndValidate(selectedPath, recoveryPassword);
    } catch (error: unknown) {
      this.recordHistory({
        occurredAt: this.now().toISOString(),
        operation: 'VERIFY',
        result: 'FAILURE',
        localState: existsSync(selectedPath) ? 'FAILED' : 'MISSING',
        externalState: 'NOT_APPLICABLE',
        fileName,
        error: sanitizedError(error),
      });
      this.busy = false;
      this.notifyIdle();
      throw error;
    }
    try {
      const sizeBytes = (await stat(selectedPath)).size;
      this.recordHistory({
        occurredAt: this.now().toISOString(),
        operation: 'VERIFY',
        result: 'SUCCESS',
        localState: 'VALID',
        externalState: 'NOT_APPLICABLE',
        fileName,
        sizeBytes,
      });
      return prepared.metadata;
    } finally {
      await prepared.cleanup();
      this.busy = false;
      this.notifyIdle();
    }
  }

  public async prepareRestore(recoveryPassword: unknown): Promise<PreparedRestore> {
    validateRecoveryPassword(recoveryPassword);
    if (!this.selectedRestorePath) throw new BackupError('Seleccioná un archivo de respaldo.');
    return this.decryptAndValidate(this.selectedRestorePath, recoveryPassword);
  }

  public recordRestore(result: 'SUCCESS' | 'FAILURE', error?: unknown): void {
    const selectedFileName = this.selectedRestoreFileName();
    const fileName = selectedFileName ? historyFileReference(selectedFileName) : undefined;
    const occurredAt = this.now().toISOString();
    if (result === 'SUCCESS') {
      this.settings.lastRestoreAt = occurredAt;
      try {
        this.save();
      } catch {
        // A status persistence failure must not reverse an already confirmed restore.
      }
    }
    this.recordHistory({
      occurredAt,
      operation: 'RESTORE',
      result,
      localState: result === 'SUCCESS' ? 'VALID' : 'FAILED',
      externalState: 'NOT_APPLICABLE',
      ...(fileName ? { fileName } : {}),
      ...(error ? { error: sanitizedError(error) } : {}),
    });
  }

  private async encrypt(
    plain: Buffer,
    password: string,
    metadata: BackupMetadata,
  ): Promise<BackupEnvelope> {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const key = await derive(password, salt);
    const kdf: BackupEnvelope['kdf'] = {
      name: 'scrypt',
      salt: salt.toString('base64'),
      N: KDF.N,
      r: KDF.r,
      p: KDF.p,
    };
    const cipherMetadata: BackupEnvelope['cipher'] = {
      name: 'aes-256-gcm',
      nonce: nonce.toString('base64'),
      tag: '',
    };
    const aad = authenticatedHeader({ magic: MAGIC, metadata, kdf, cipher: cipherMetadata });
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    const payload = Buffer.concat([cipher.update(plain), cipher.final()]);
    return {
      magic: MAGIC,
      metadata,
      kdf,
      cipher: {
        ...cipherMetadata,
        tag: cipher.getAuthTag().toString('base64'),
      },
      payload: payload.toString('base64'),
    };
  }

  private async decryptAndValidate(filePath: string, password: string): Promise<PreparedRestore> {
    let envelope: BackupEnvelope;
    let sqlitePath: string | null = null;
    try {
      envelope = JSON.parse(await readFile(filePath, 'utf8')) as BackupEnvelope;
    } catch {
      throw new BackupError('El archivo seleccionado no es un respaldo válido.');
    }
    if (
      envelope.magic !== MAGIC ||
      envelope.metadata?.formatVersion !== FORMAT_VERSION ||
      typeof envelope.metadata.createdAt !== 'string' ||
      typeof envelope.metadata.appVersion !== 'string' ||
      !Array.isArray(envelope.metadata.schemaMigrations) ||
      !envelope.metadata.schemaMigrations.every((id) => typeof id === 'string') ||
      envelope.kdf?.name !== 'scrypt' ||
      envelope.kdf.N !== KDF.N ||
      envelope.kdf.r !== KDF.r ||
      envelope.kdf.p !== KDF.p ||
      typeof envelope.kdf.salt !== 'string' ||
      envelope.cipher?.name !== 'aes-256-gcm' ||
      typeof envelope.cipher.nonce !== 'string' ||
      typeof envelope.cipher.tag !== 'string' ||
      typeof envelope.payload !== 'string'
    )
      throw new BackupError('El formato del respaldo no es compatible.');
    const known = new Set(getMigrationIds());
    if (envelope.metadata.schemaMigrations.some((id) => !known.has(id)))
      throw new BackupError('El respaldo pertenece a una versión futura no compatible.');
    try {
      const key = await derive(password, Buffer.from(envelope.kdf.salt, 'base64'));
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(envelope.cipher.nonce, 'base64'),
      );
      decipher.setAAD(authenticatedHeader(envelope));
      decipher.setAuthTag(Buffer.from(envelope.cipher.tag, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.payload, 'base64')),
        decipher.final(),
      ]);
      sqlitePath = join(
        dirname(this.settingsPath),
        `.restore-staging-${randomBytes(8).toString('hex')}.sqlite3`,
      );
      await writeFile(sqlitePath, plain, { flag: 'wx', mode: 0o600 });
      const checked = ApplicationDatabase.open(sqlitePath);
      try {
        if (checked.integrityCheck() !== 'ok' || checked.foreignKeyViolations().length > 0)
          throw new BackupError('El respaldo no superó la verificación de integridad.');
      } finally {
        checked.close();
      }
      return new PreparedRestore(envelope.metadata, sqlitePath);
    } catch (error: unknown) {
      if (sqlitePath) await removeSqliteArtifacts(sqlitePath).catch(() => undefined);
      if (error instanceof BackupError) throw error;
      throw new BackupError(
        'La contraseña de recuperación es incorrecta o el archivo está dañado.',
      );
    }
  }

  private async applyRetentionSafely(): Promise<void> {
    const protectedNames = new Set<string>();
    for (const value of [
      this.settings.lastBackupFile,
      this.settings.pendingExternalCopyFile,
      this.selectedRestoreFileName(),
    ]) {
      const safe = safeBackupFileName(value);
      if (safe) protectedNames.add(safe);
    }
    const result = await applySafeLocalRetention(
      this.settings.localDirectory,
      this.settings.retentionCount,
      protectedNames,
    ).catch(() => ({ deleted: [], skippedUnsafe: 1, warning: true }));
    if (result.warning)
      this.recordHistory({
        occurredAt: this.now().toISOString(),
        operation: 'RETENTION',
        result: 'PARTIAL',
        localState: 'VALID',
        externalState: 'NOT_APPLICABLE',
        error: 'La retención omitió archivos que no pudo validar de forma segura.',
      });
  }

  private markExternalCopySucceeded(fileName: string, occurredAt: string): void {
    this.settings.lastExternalCopyAt = occurredAt;
    this.settings.lastExternalCopyFile = fileName;
    this.settings.lastExternalCopyStatus = 'COPIED';
  }

  private clearPendingExternalCopy(): void {
    this.settings.pendingExternalCopyFile = null;
    this.settings.pendingExternalTemporaryFile = null;
    this.settings.pendingExternalAttempts = 0;
    this.settings.nextExternalRetryAt = null;
    this.settings.pendingExternalSourceTrigger = null;
  }

  private safeExternalTemporaryName(value: string | null): string | null {
    return value && basename(value) === value && EXTERNAL_TEMPORARY_NAME.test(value) ? value : null;
  }
  private load(defaultDirectory: string): Settings {
    const now = this.now().toISOString();
    const defaults: Settings = {
      automationConfigurationVersion: 1,
      localDirectory: defaultDirectory,
      exportDirectory: null,
      lastBackupAt: null,
      lastBackupFile: null,
      lastBackupSizeBytes: null,
      lastErrorAt: null,
      lastExternalCopyAt: null,
      lastExternalCopyFile: null,
      lastExternalCopyStatus: 'UNKNOWN',
      pendingExternalCopyFile: null,
      pendingExternalTemporaryFile: null,
      pendingExternalAttempts: 0,
      nextExternalRetryAt: null,
      pendingExternalSourceTrigger: null,
      lastRestoreAt: null,
      lastAutomaticBackupAt: null,
      lastAutomaticAttemptAt: null,
      lastAutomaticErrorAt: null,
      monitoringStartedAt: now,
      automaticEnabled: false,
      automaticHour: 20,
      retentionCount: 14,
    };
    if (!existsSync(this.settingsPath)) return defaults;
    try {
      const stored = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as Partial<Settings>;
      const merged: Settings = {
        ...defaults,
        ...stored,
        automationConfigurationVersion: 1,
        automaticEnabled:
          stored.automationConfigurationVersion === 1 && stored.automaticEnabled === true,
        localDirectory: defaultDirectory,
      };
      merged.lastBackupFile = safeBackupFileName(merged.lastBackupFile);
      merged.lastExternalCopyFile = safeBackupFileName(merged.lastExternalCopyFile);
      merged.pendingExternalCopyFile = safeBackupFileName(merged.pendingExternalCopyFile);
      merged.pendingExternalTemporaryFile = this.safeExternalTemporaryName(
        merged.pendingExternalTemporaryFile,
      );
      merged.pendingExternalAttempts = Number.isInteger(merged.pendingExternalAttempts)
        ? Math.max(0, Math.min(EXTERNAL_MAX_ATTEMPTS, merged.pendingExternalAttempts))
        : 0;
      merged.nextExternalRetryAt = validDate(merged.nextExternalRetryAt)?.toISOString() ?? null;
      if (
        merged.lastExternalCopyStatus !== 'PENDING' ||
        !merged.pendingExternalCopyFile ||
        !merged.exportDirectory ||
        merged.pendingExternalAttempts < 1
      ) {
        merged.pendingExternalCopyFile = null;
        merged.pendingExternalTemporaryFile = null;
        merged.pendingExternalAttempts = 0;
        merged.nextExternalRetryAt = null;
        merged.pendingExternalSourceTrigger = null;
      }
      return merged;
    } catch {
      return { ...defaults, lastErrorAt: now };
    }
  }
  private save(): void {
    writeFileSync(this.settingsPath, JSON.stringify(this.settings), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  private externalCopyStatus(): BackupStatus['externalCopyStatus'] {
    if (!this.settings.exportDirectory) return 'NOT_CONFIGURED';
    if (this.settings.lastExternalCopyStatus === 'PENDING') return 'PENDING';
    if (this.settings.lastExternalCopyStatus === 'FAILED') return 'FAILED';
    if (this.settings.lastExternalCopyStatus !== 'COPIED') return 'UNKNOWN';
    const fileName = safeBackupFileName(this.settings.lastExternalCopyFile);
    return fileName && isSafeExternalBackupFileSync(this.settings.exportDirectory, fileName)
      ? 'COPIED'
      : 'MISSING';
  }

  private historyExternalState(
    exportError: boolean,
    exportedToSyncFolder: boolean,
  ): BackupExternalState {
    if (!this.settings.exportDirectory) return 'NOT_CONFIGURED';
    if (exportError) return 'FAILED';
    return exportedToSyncFolder ? 'COPIED' : 'UNKNOWN';
  }

  private recordHistory(input: Parameters<BackupHistoryStore['append']>[0]): void {
    try {
      this.historyStore.append(input);
    } catch {
      // Observability must never invalidate a completed backup or restore.
    }
  }

  private automaticState(): BackupStatus['automaticState'] {
    if (!this.settings.automaticEnabled) return 'DISABLED';
    if (this.automaticRunning) return 'RUNNING';
    if (this.protectedCredentialState !== 'READY') return 'BLOCKED';
    const error = validDate(this.settings.lastAutomaticErrorAt);
    const success = validDate(this.settings.lastAutomaticBackupAt);
    if (error && (!success || error >= success)) return 'ERROR';
    const lastBackupFile = safeBackupFileName(this.settings.lastBackupFile);
    if (!lastBackupFile || !existsSync(join(this.settings.localDirectory, lastBackupFile)))
      return 'PENDING';
    if (this.statusDueWithoutRecursion()) return 'PENDING';
    return 'READY';
  }

  private statusDueWithoutRecursion(): boolean {
    const fileName = safeBackupFileName(this.settings.lastBackupFile);
    const exists = !!fileName && existsSync(join(this.settings.localDirectory, fileName));
    return calculateBackupDue(
      this.settings.lastBackupAt,
      this.settings.automaticEnabled,
      this.settings.automaticHour,
      this.settings.monitoringStartedAt,
      exists,
      this.now(),
    );
  }

  private notifyIdle(): void {
    if (this.isCriticalOperation()) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
}
