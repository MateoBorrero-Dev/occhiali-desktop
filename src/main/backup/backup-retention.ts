import { lstat, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const BACKUP_NAME = /^occhiali-backup-(\d{17})\.ocbackup$/;

export interface RetentionResult {
  deleted: string[];
  skippedUnsafe: number;
  warning: boolean;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function recognizedBackup(path: string): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    const metadata = value.metadata as Record<string, unknown> | undefined;
    const kdf = value.kdf as Record<string, unknown> | undefined;
    const cipher = value.cipher as Record<string, unknown> | undefined;
    const match = BACKUP_NAME.exec(basename(path));
    const createdAt = typeof metadata?.createdAt === 'string' ? new Date(metadata.createdAt) : null;
    const createdTimestamp =
      createdAt && Number.isFinite(createdAt.getTime())
        ? createdAt.toISOString().replace(/\D/g, '').slice(0, 17)
        : null;
    return (
      !!match &&
      value.magic === 'OCCHIALI_BACKUP' &&
      metadata?.formatVersion === 1 &&
      createdTimestamp === match[1] &&
      typeof metadata.appVersion === 'string' &&
      Array.isArray(metadata.schemaMigrations) &&
      metadata.schemaMigrations.every((id) => typeof id === 'string') &&
      kdf?.name === 'scrypt' &&
      typeof kdf.salt === 'string' &&
      kdf.N === 32_768 &&
      kdf.r === 8 &&
      kdf.p === 1 &&
      cipher?.name === 'aes-256-gcm' &&
      typeof cipher.nonce === 'string' &&
      typeof cipher.tag === 'string' &&
      typeof value.payload === 'string'
    );
  } catch {
    return false;
  }
}

export async function applySafeLocalRetention(
  directory: string,
  retentionCount: number,
  protectedNames: ReadonlySet<string>,
): Promise<RetentionResult> {
  const result: RetentionResult = { deleted: [], skippedUnsafe: 0, warning: false };
  const root = resolve(directory);
  let entries;
  try {
    const rootInformation = await lstat(root);
    if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink())
      return { ...result, skippedUnsafe: 1, warning: true };
    if (!samePath(await realpath(root), root))
      return { ...result, skippedUnsafe: 1, warning: true };
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { ...result, skippedUnsafe: 1, warning: true };
  }

  const eligible: Array<{
    name: string;
    device: bigint | number;
    inode: bigint | number;
    size: bigint | number;
    modifiedAt: bigint | number;
  }> = [];
  for (const entry of entries) {
    if (!BACKUP_NAME.test(entry.name)) continue;
    const path = join(root, entry.name);
    try {
      const information = await lstat(path);
      if (
        basename(path) !== entry.name ||
        entry.isSymbolicLink() ||
        information.isSymbolicLink() ||
        !information.isFile() ||
        !samePath(await realpath(path), path) ||
        !(await recognizedBackup(path))
      ) {
        result.skippedUnsafe += 1;
        result.warning = true;
        continue;
      }
      eligible.push({
        name: entry.name,
        device: information.dev,
        inode: information.ino,
        size: information.size,
        modifiedAt: information.mtimeMs,
      });
    } catch {
      result.skippedUnsafe += 1;
      result.warning = true;
    }
  }

  eligible.sort((left, right) => right.name.localeCompare(left.name));
  const keep = Math.max(1, retentionCount);
  for (const candidate of eligible.slice(keep)) {
    if (protectedNames.has(candidate.name)) {
      result.skippedUnsafe += 1;
      result.warning = true;
      continue;
    }
    const path = join(root, candidate.name);
    try {
      const information = await lstat(path);
      if (
        information.isSymbolicLink() ||
        !information.isFile() ||
        !samePath(await realpath(path), path) ||
        information.dev !== candidate.device ||
        information.ino !== candidate.inode ||
        information.size !== candidate.size ||
        information.mtimeMs !== candidate.modifiedAt
      ) {
        result.skippedUnsafe += 1;
        result.warning = true;
        continue;
      }
      await rm(path);
      result.deleted.push(candidate.name);
    } catch {
      result.skippedUnsafe += 1;
      result.warning = true;
    }
  }
  return result;
}
