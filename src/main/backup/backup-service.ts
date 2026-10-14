import { createCipheriv, createDecipheriv, randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ApplicationDatabase } from '../database';
import { getMigrationIds } from '../database/migrations';
import type {
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
  lastErrorAt: string | null;
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
  private busy = false;
  private selectedRestorePath: string | null = null;

  public constructor(
    private readonly settingsPath: string,
    private readonly appVersion: string,
  ) {
    const defaultDirectory = join(dirname(settingsPath), 'backups');
    this.settings = this.load(defaultDirectory);
    mkdirSync(this.settings.localDirectory, { recursive: true });
  }

  public status(): BackupStatus {
    const today = new Date().toISOString().slice(0, 10);
    return {
      ...this.settings,
      due: this.settings.automaticEnabled && this.settings.lastBackupAt?.slice(0, 10) !== today,
      busy: this.busy,
      remoteSyncVerified: false,
    };
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
    this.settings.exportDirectory = path ? resolve(path) : null;
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
    const now = new Date();
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
      this.settings.lastBackupAt = metadata.createdAt;
      this.settings.lastBackupFile = fileName;
      this.settings.lastErrorAt = null;
      this.save();
      await this.applyRetention();
      return {
        fileName,
        createdAt: metadata.createdAt,
        exportedToSyncFolder,
        exportError,
        remoteSyncVerified: false,
      };
    } catch (error: unknown) {
      this.settings.lastErrorAt = new Date().toISOString();
      this.save();
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
    const prepared = await this.decryptAndValidate(this.selectedRestorePath, recoveryPassword);
    try {
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
    const defaults: Settings = {
      localDirectory: defaultDirectory,
      exportDirectory: null,
      lastBackupAt: null,
      lastBackupFile: null,
      lastErrorAt: null,
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
      return { ...defaults, lastErrorAt: new Date().toISOString() };
    }
  }
  private save(): void {
    writeFileSync(this.settingsPath, JSON.stringify(this.settings), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
