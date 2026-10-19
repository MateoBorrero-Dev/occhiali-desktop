import { createCipheriv, createDecipheriv, randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ApplicationDatabase } from '../database';
import { getMigrationIds } from '../database/migrations';
import { BackupHistoryStore } from './backup-history';
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
  localDirectory: string;
  exportDirectory: string | null;
  lastBackupAt: string | null;
  lastBackupFile: string | null;
  lastBackupSizeBytes: number | null;
  lastErrorAt: string | null;
  lastExternalCopyAt: string | null;
  lastExternalCopyFile: string | null;
  lastExternalCopyStatus: 'UNKNOWN' | 'COPIED' | 'FAILED';
  lastRestoreAt: string | null;
  monitoringStartedAt: string;
  automaticEnabled: boolean;
  automaticHour: number;
  retentionCount: number;
}

export class BackupError extends Error {}

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

function validateRecoveryPassword(value: unknown): asserts value is string {
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
  const cutoff = new Date(now);
  cutoff.setHours(automaticHour, 0, 0, 0);
  if (now < cutoff) cutoff.setDate(cutoff.getDate() - 1);
  const monitoring = validDate(monitoringStartedAt) ?? now;
  if (cutoff < monitoring) return false;
  const last = validDate(lastBackupAt);
  return !last || last < cutoff;
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
  private selectedRestorePath: string | null = null;

  public constructor(
    private readonly settingsPath: string,
    private readonly appVersion: string,
    private readonly now: () => Date = () => new Date(),
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
      lastRestoreAt: this.settings.lastRestoreAt,
      automaticEnabled: this.settings.automaticEnabled,
      automaticHour: this.settings.automaticHour,
      retentionCount: this.settings.retentionCount,
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
      busy: this.busy,
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
    this.settings = {
      ...this.settings,
      automaticEnabled: value.automaticEnabled,
      automaticHour: value.automaticHour,
      retentionCount: value.retentionCount,
    };
    this.save();
    return this.status();
  }

  public setExportDirectory(path: string | null): BackupStatus {
    const next = path ? resolve(path) : null;
    if (next !== this.settings.exportDirectory) {
      this.settings.lastExternalCopyAt = null;
      this.settings.lastExternalCopyFile = null;
      this.settings.lastExternalCopyStatus = 'UNKNOWN';
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
  ): Promise<BackupOperationResult> {
    validateRecoveryPassword(recoveryPassword);
    if (this.busy) throw new BackupError('Ya hay una copia de seguridad en curso.');
    this.busy = true;
    const now = this.now();
    const fileName = `occhiali-backup-${safeTimestamp(now)}.ocbackup`;
    const temporarySqlite = join(this.settings.localDirectory, `.${fileName}.sqlite.tmp`);
    const partial = join(this.settings.localDirectory, `${fileName}.partial`);
    const finalPath = join(this.settings.localDirectory, fileName);
    try {
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
      if (this.settings.exportDirectory) {
        const exportPartial = join(this.settings.exportDirectory, `${fileName}.partial`);
        try {
          if (!existsSync(this.settings.exportDirectory)) throw new Error('unavailable');
          await copyFile(finalPath, exportPartial);
          await rename(exportPartial, join(this.settings.exportDirectory, fileName));
          exportedToSyncFolder = true;
        } catch {
          exportError = true;
          await rm(exportPartial, { force: true }).catch(() => undefined);
        }
      }
      const sizeBytes = (await stat(finalPath)).size;
      this.settings.lastBackupAt = metadata.createdAt;
      this.settings.lastBackupFile = fileName;
      this.settings.lastBackupSizeBytes = sizeBytes;
      this.settings.lastErrorAt = exportError ? metadata.createdAt : null;
      if (this.settings.exportDirectory) {
        this.settings.lastExternalCopyAt = metadata.createdAt;
        this.settings.lastExternalCopyFile = fileName;
        this.settings.lastExternalCopyStatus = exportError ? 'FAILED' : 'COPIED';
      }
      this.save();
      await this.applyRetention();
      this.recordHistory({
        occurredAt: metadata.createdAt,
        operation: 'CREATE',
        result: exportError ? 'PARTIAL' : 'SUCCESS',
        localState: 'VALID',
        externalState: this.historyExternalState(exportError, exportedToSyncFolder),
        fileName,
        sizeBytes,
        ...(exportError
          ? { error: 'El respaldo local es válido, pero falló la copia externa.' }
          : {}),
      });
      if (this.settings.exportDirectory) {
        this.recordHistory({
          occurredAt: metadata.createdAt,
          operation: 'EXPORT',
          result: exportError ? 'FAILURE' : 'SUCCESS',
          localState: 'VALID',
          externalState: exportError ? 'FAILED' : 'COPIED',
          fileName,
          sizeBytes,
          ...(exportError ? { error: 'No se pudo copiar el respaldo al destino externo.' } : {}),
        });
      }
      return {
        fileName,
        createdAt: metadata.createdAt,
        exportedToSyncFolder,
        exportError,
        remoteSyncVerified: false,
      };
    } catch (error: unknown) {
      const occurredAt = this.now().toISOString();
      this.settings.lastErrorAt = occurredAt;
      this.save();
      const localExists = existsSync(finalPath);
      this.recordHistory({
        occurredAt,
        operation: 'CREATE',
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
      await rm(temporarySqlite, { force: true }).catch(() => undefined);
      await rm(partial, { force: true }).catch(() => undefined);
    }
  }

  public async verifySelected(recoveryPassword: unknown): Promise<BackupMetadata> {
    validateRecoveryPassword(recoveryPassword);
    if (!this.selectedRestorePath) throw new BackupError('Seleccioná un archivo de respaldo.');
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

  private async applyRetention(): Promise<void> {
    const files = (await readdir(this.settings.localDirectory))
      .filter((name) => /^occhiali-backup-.*\.ocbackup$/.test(name))
      .sort()
      .reverse();
    for (const name of files.slice(Math.max(1, this.settings.retentionCount)))
      await rm(join(this.settings.localDirectory, name), { force: true });
  }
  private load(defaultDirectory: string): Settings {
    const now = this.now().toISOString();
    const defaults: Settings = {
      localDirectory: defaultDirectory,
      exportDirectory: null,
      lastBackupAt: null,
      lastBackupFile: null,
      lastBackupSizeBytes: null,
      lastErrorAt: null,
      lastExternalCopyAt: null,
      lastExternalCopyFile: null,
      lastExternalCopyStatus: 'UNKNOWN',
      lastRestoreAt: null,
      monitoringStartedAt: now,
      automaticEnabled: false,
      automaticHour: 20,
      retentionCount: 14,
    };
    if (!existsSync(this.settingsPath)) return defaults;
    try {
      return {
        ...defaults,
        ...(JSON.parse(readFileSync(this.settingsPath, 'utf8')) as Partial<Settings>),
        localDirectory: defaultDirectory,
      };
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
    if (this.settings.lastExternalCopyStatus === 'FAILED') return 'FAILED';
    if (this.settings.lastExternalCopyStatus !== 'COPIED') return 'UNKNOWN';
    const fileName = safeBackupFileName(this.settings.lastExternalCopyFile);
    return fileName && existsSync(join(this.settings.exportDirectory, fileName))
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
}
