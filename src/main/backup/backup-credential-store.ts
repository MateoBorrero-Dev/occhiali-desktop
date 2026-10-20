import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { BackupError, validateRecoveryPassword } from './backup-service';
import type { BackupStatus } from '../../shared/database-models';

const CREDENTIAL_VERSION = 1;

interface CredentialFile {
  version: typeof CREDENTIAL_VERSION;
  protectedValue: string;
}

export interface SafeStorageProvider {
  isEncryptionAvailable(): boolean;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

function validFile(value: unknown): value is CredentialFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CredentialFile>;
  if (candidate.version !== CREDENTIAL_VERSION || typeof candidate.protectedValue !== 'string')
    return false;
  try {
    const decoded = Buffer.from(candidate.protectedValue, 'base64');
    return decoded.length > 0 && decoded.toString('base64') === candidate.protectedValue;
  } catch {
    return false;
  }
}

function atomicWrite(path: string, contents: string): void {
  const nextPath = `${path}.next`;
  rmSync(nextPath, { force: true });
  const descriptor = openSync(nextPath, 'wx', 0o600);
  try {
    writeFileSync(descriptor, contents, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(nextPath, path);
  } catch (error: unknown) {
    rmSync(nextPath, { force: true });
    throw error;
  }
}

export class BackupCredentialStore {
  private credentialState: BackupStatus['protectedCredentialState'];
  private revision = 0;

  public constructor(
    private readonly path: string,
    private readonly storage: SafeStorageProvider,
  ) {
    this.credentialState = this.initialState();
  }

  public state(): BackupStatus['protectedCredentialState'] {
    return this.credentialState;
  }

  public async inspect(): Promise<BackupStatus['protectedCredentialState']> {
    if (!existsSync(this.path)) {
      this.credentialState = this.storage.isEncryptionAvailable() ? 'MISSING' : 'UNAVAILABLE';
      return this.credentialState;
    }
    if (!this.storage.isEncryptionAvailable()) {
      this.credentialState = 'UNAVAILABLE';
      return this.credentialState;
    }
    const revision = this.revision;
    try {
      await this.decrypt();
      if (revision !== this.revision) return this.inspect();
      this.credentialState = 'READY';
    } catch {
      this.credentialState = 'DAMAGED';
    }
    return this.credentialState;
  }

  public async store(password: unknown): Promise<void> {
    validateRecoveryPassword(password);
    if (!this.storage.isEncryptionAvailable()) {
      this.credentialState = 'UNAVAILABLE';
      throw new BackupError('El almacenamiento seguro de Windows no está disponible.');
    }
    this.revision += 1;
    try {
      const encrypted = await this.storage.encryptStringAsync(password);
      atomicWrite(
        this.path,
        JSON.stringify({
          version: CREDENTIAL_VERSION,
          protectedValue: encrypted.toString('base64'),
        } satisfies CredentialFile),
      );
      this.credentialState = 'READY';
    } catch (error: unknown) {
      if (error instanceof BackupError) throw error;
      this.credentialState = existsSync(this.path) ? this.credentialState : 'MISSING';
      throw new BackupError('No se pudo proteger la contraseña de recuperación.');
    }
  }

  public async retrieve(): Promise<string> {
    const { password } = await this.retrieveSnapshot();
    return password;
  }

  public async retrieveSnapshot(): Promise<{ password: string; revision: number }> {
    if (!this.storage.isEncryptionAvailable()) {
      this.credentialState = 'UNAVAILABLE';
      throw new BackupError('El almacenamiento seguro de Windows no está disponible.');
    }
    if (!existsSync(this.path)) {
      this.credentialState = 'MISSING';
      throw new BackupError('No hay una contraseña protegida para el respaldo automático.');
    }
    const revision = this.revision;
    try {
      const { result, shouldReEncrypt } = await this.decrypt();
      if (revision !== this.revision)
        throw new BackupError('La contraseña protegida cambió durante la operación.');
      validateRecoveryPassword(result);
      if (shouldReEncrypt) await this.store(result);
      this.credentialState = 'READY';
      return { password: result, revision: this.revision };
    } catch (error: unknown) {
      if (error instanceof BackupError && revision !== this.revision) throw error;
      this.credentialState = 'DAMAGED';
      throw new BackupError('La contraseña protegida está dañada o no puede descifrarse.');
    }
  }

  public isCurrent(revision: number): boolean {
    return revision === this.revision;
  }

  public clear(): void {
    this.revision += 1;
    try {
      rmSync(this.path, { force: true });
      rmSync(`${this.path}.next`, { force: true });
      this.credentialState = this.storage.isEncryptionAvailable() ? 'MISSING' : 'UNAVAILABLE';
    } catch {
      throw new BackupError('No se pudo eliminar la contraseña protegida.');
    }
  }

  private initialState(): BackupStatus['protectedCredentialState'] {
    if (!this.storage.isEncryptionAvailable()) return 'UNAVAILABLE';
    if (!existsSync(this.path)) return 'MISSING';
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as unknown;
      return validFile(value) ? 'READY' : 'DAMAGED';
    } catch {
      return 'DAMAGED';
    }
  }

  private async decrypt(): Promise<{ result: string; shouldReEncrypt: boolean }> {
    const value = JSON.parse(readFileSync(this.path, 'utf8')) as unknown;
    if (!validFile(value)) {
      this.credentialState = 'DAMAGED';
      throw new BackupError('La contraseña protegida está dañada o no puede descifrarse.');
    }
    return this.storage.decryptStringAsync(Buffer.from(value.protectedValue, 'base64'));
  }
}
