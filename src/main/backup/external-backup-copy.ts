import { createHash, randomBytes } from 'node:crypto';
import { constants, lstatSync, realpathSync } from 'node:fs';
import { access, copyFile, lstat, open, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const BACKUP_NAME = /^occhiali-backup-\d{17}\.ocbackup$/;
const TEMPORARY_NAME = /^\.occhiali-backup-\d{17}\.ocbackup\.[a-f0-9]{16}\.partial$/;

export class ExternalBackupCopyError extends Error {}

export interface ExternalCopyResult {
  sizeBytes: number;
  sha256: string;
  alreadyPresent: boolean;
}

export interface ExternalBackupCopyHooks {
  afterTemporaryCreated?: (path: string) => void | Promise<void>;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function hashFile(path: string): Promise<string> {
  const handle = await open(path, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

async function regularFile(path: string): Promise<boolean> {
  try {
    const information = await lstat(path);
    return information.isFile() && !information.isSymbolicLink();
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export function isSafeExternalBackupFileSync(directory: string, fileName: string): boolean {
  if (!BACKUP_NAME.test(fileName)) return false;
  try {
    const root = validateExternalDirectorySync(directory);
    const path = join(root, fileName);
    const information = lstatSync(path);
    return (
      information.isFile() &&
      !information.isSymbolicLink() &&
      samePath(realpathSync.native(path), path)
    );
  } catch {
    return false;
  }
}

export function validateExternalDirectorySync(path: string): string {
  const resolved = resolve(path);
  try {
    const information = lstatSync(resolved);
    if (!information.isDirectory() || information.isSymbolicLink())
      throw new ExternalBackupCopyError('La carpeta externa no es un directorio seguro.');
    const actual = realpathSync.native(resolved);
    if (!samePath(actual, resolved))
      throw new ExternalBackupCopyError(
        'La carpeta externa no puede ser un enlace simbólico ni una unión de directorios.',
      );
    return actual;
  } catch (error: unknown) {
    if (error instanceof ExternalBackupCopyError) throw error;
    throw new ExternalBackupCopyError('La carpeta externa no existe o no está accesible.');
  }
}

export class ExternalBackupCopier {
  public constructor(private readonly hooks: ExternalBackupCopyHooks = {}) {}

  public temporaryName(fileName: string): string {
    if (!BACKUP_NAME.test(fileName))
      throw new ExternalBackupCopyError('El nombre del respaldo local no es válido.');
    return `.${fileName}.${randomBytes(8).toString('hex')}.partial`;
  }

  public async transfer(
    sourcePath: string,
    directory: string,
    fileName: string,
    temporaryName = this.temporaryName(fileName),
  ): Promise<ExternalCopyResult> {
    if (basename(sourcePath) !== fileName || !BACKUP_NAME.test(fileName))
      throw new ExternalBackupCopyError('El archivo local no pertenece a Occhiali.');
    if (!TEMPORARY_NAME.test(temporaryName) || !temporaryName.startsWith(`.${fileName}.`))
      throw new ExternalBackupCopyError('El archivo temporal externo no es válido.');
    if (!(await regularFile(sourcePath)))
      throw new ExternalBackupCopyError('El respaldo local pendiente no está disponible.');

    const destination = await this.validateDirectory(directory);
    const finalPath = join(destination, fileName);
    const temporaryPath = join(destination, temporaryName);
    const sourceSize = (await stat(sourcePath)).size;
    const sourceHash = await hashFile(sourcePath);

    const existing = await this.verifyMatchingFile(finalPath, sourceSize, sourceHash);
    if (existing) return { sizeBytes: sourceSize, sha256: sourceHash, alreadyPresent: true };
    if (await pathExists(finalPath))
      throw new ExternalBackupCopyError(
        'Ya existe una copia externa diferente con el mismo nombre. No se sobrescribió.',
      );

    let ownsTemporary = false;
    try {
      const reservation = await open(temporaryPath, 'wx', 0o600);
      ownsTemporary = true;
      await reservation.close();
      await this.hooks.afterTemporaryCreated?.(temporaryPath);
      await copyFile(sourcePath, temporaryPath);
      const temporaryHandle = await open(temporaryPath, 'r+');
      try {
        await temporaryHandle.sync();
      } finally {
        await temporaryHandle.close();
      }
      if (!(await this.verifyMatchingFile(temporaryPath, sourceSize, sourceHash)))
        throw new ExternalBackupCopyError('La copia externa no superó la verificación SHA-256.');
      await rename(temporaryPath, finalPath);
      ownsTemporary = false;
      if (!(await this.verifyMatchingFile(finalPath, sourceSize, sourceHash)))
        throw new ExternalBackupCopyError('La copia externa publicada no superó la verificación.');
      return { sizeBytes: sourceSize, sha256: sourceHash, alreadyPresent: false };
    } catch (error: unknown) {
      if (ownsTemporary) await this.removeOwnedTemporary(temporaryPath);
      if (error instanceof ExternalBackupCopyError) throw error;
      throw new ExternalBackupCopyError('No se pudo copiar el respaldo al destino externo.');
    }
  }

  public async cleanupPersistedTemporary(
    directory: string,
    fileName: string,
    temporaryName: string | null,
  ): Promise<void> {
    if (
      !temporaryName ||
      !BACKUP_NAME.test(fileName) ||
      !TEMPORARY_NAME.test(temporaryName) ||
      !temporaryName.startsWith(`.${fileName}.`)
    )
      return;
    let destination: string;
    try {
      destination = await this.validateDirectory(directory);
    } catch {
      return;
    }
    await this.removeOwnedTemporary(join(destination, temporaryName));
  }

  private async validateDirectory(path: string): Promise<string> {
    const resolved = resolve(path);
    try {
      const information = await lstat(resolved);
      if (!information.isDirectory() || information.isSymbolicLink())
        throw new ExternalBackupCopyError('La carpeta externa no es un directorio seguro.');
      const actual = await realpath(resolved);
      if (!samePath(actual, resolved))
        throw new ExternalBackupCopyError(
          'La carpeta externa no puede ser un enlace simbólico ni una unión de directorios.',
        );
      await access(actual, constants.R_OK | constants.W_OK);
      return actual;
    } catch (error: unknown) {
      if (error instanceof ExternalBackupCopyError) throw error;
      throw new ExternalBackupCopyError('La carpeta externa no existe o no está accesible.');
    }
  }

  private async verifyMatchingFile(
    path: string,
    expectedSize: number,
    expectedHash: string,
  ): Promise<boolean> {
    if (!(await regularFile(path))) return false;
    const information = await stat(path);
    return information.size === expectedSize && (await hashFile(path)) === expectedHash;
  }

  private async removeOwnedTemporary(path: string): Promise<void> {
    try {
      const information = await lstat(path);
      if (information.isFile() && !information.isSymbolicLink()) await rm(path, { force: true });
    } catch {
      // A missing or replaced temporary is left untouched.
    }
  }
}
