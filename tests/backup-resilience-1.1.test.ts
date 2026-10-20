import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySafeLocalRetention } from '../src/main/backup/backup-retention';
import {
  ExternalBackupCopier,
  ExternalBackupCopyError,
} from '../src/main/backup/external-backup-copy';
import { BackupService } from '../src/main/backup/backup-service';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

const RECOVERY_PASSWORD = 'Recuperacion-Resiliente-2026';

function backupEnvelope(fileName: string): string {
  const stamp = /occhiali-backup-(\d{17})\.ocbackup/.exec(fileName)?.[1];
  if (!stamp) throw new Error('Nombre de fixture inválido');
  const createdAt = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}.${stamp.slice(14, 17)}Z`;
  return JSON.stringify({
    magic: 'OCCHIALI_BACKUP',
    metadata: { formatVersion: 1, createdAt, appVersion: '1.0.0', schemaMigrations: [] },
    kdf: { name: 'scrypt', salt: 'c2FsdA==', N: 32_768, r: 8, p: 1 },
    cipher: { name: 'aes-256-gcm', nonce: 'bm9uY2U=', tag: 'dGFn' },
    payload: 'cifrado',
  });
}

describe('copias externas robustas y retención segura', () => {
  let context: TestDatabase | null = null;
  const directories: string[] = [];

  afterEach(() => {
    if (context) {
      destroyTestDatabase(context);
      context = null;
    }
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  function directory(prefix: string): string {
    const value = mkdtempSync(join(tmpdir(), prefix));
    directories.push(value);
    return value;
  }

  it('publica una copia externa idéntica y no deja temporales propios', async () => {
    const root = directory('occhiali-external-copy-');
    const destination = join(root, 'externo');
    mkdirSync(destination);
    const fileName = 'occhiali-backup-20261020010000000.ocbackup';
    const source = join(root, fileName);
    writeFileSync(source, 'contenido cifrado de prueba');

    const result = await new ExternalBackupCopier().transfer(source, destination, fileName);

    expect(result).toMatchObject({
      alreadyPresent: false,
      sizeBytes: Buffer.byteLength('contenido cifrado de prueba'),
    });
    expect(readFileSync(join(destination, fileName), 'utf8')).toBe('contenido cifrado de prueba');
    expect(readdirSync(destination).filter((name) => name.endsWith('.partial'))).toEqual([]);
  });

  it('limpia sólo su temporal tras una interrupción simulada', async () => {
    const root = directory('occhiali-external-interrupted-');
    const destination = join(root, 'externo');
    mkdirSync(destination);
    const fileName = 'occhiali-backup-20261020010100000.ocbackup';
    const source = join(root, fileName);
    writeFileSync(source, 'respaldo');
    writeFileSync(join(destination, 'archivo-personal.partial'), 'conservar');
    const copier = new ExternalBackupCopier({
      afterTemporaryCreated: () => {
        throw new Error('interrupción de prueba');
      },
    });

    await expect(copier.transfer(source, destination, fileName)).rejects.toBeInstanceOf(
      ExternalBackupCopyError,
    );
    expect(readdirSync(destination)).toEqual(['archivo-personal.partial']);
  });

  it('rechaza destinos indirectos y nunca sigue un enlace para publicar', async () => {
    const root = directory('occhiali-external-link-');
    const target = join(root, 'objetivo');
    const linked = join(root, 'enlace');
    mkdirSync(target);
    symlinkSync(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
    const fileName = 'occhiali-backup-20261020010200000.ocbackup';
    const source = join(root, fileName);
    writeFileSync(source, 'respaldo');

    await expect(
      new ExternalBackupCopier().transfer(source, linked, fileName),
    ).rejects.toBeInstanceOf(ExternalBackupCopyError);
    expect(readdirSync(target)).toEqual([]);
  });

  it('reintenta sin generar otro respaldo local y persiste el pendiente entre reinicios', async () => {
    context = createTestDatabase();
    const root = directory('occhiali-external-retry-');
    const external = join(root, 'externo');
    mkdirSync(external);
    let now = new Date('2026-10-20T04:00:00.000Z');
    const settings = join(root, 'backup-settings.json');
    const service = new BackupService(settings, '1.0.0', () => now);
    await service.setExportDirectory(external);
    rmSync(external, { recursive: true });

    const created = await service.create(context.database, RECOVERY_PASSWORD);
    expect(created).toMatchObject({ externalCopyPending: true, exportError: true });
    expect(service.status()).toMatchObject({
      externalCopyStatus: 'PENDING',
      externalRetryAttempts: 1,
    });
    expect(
      readdirSync(join(root, 'backups')).filter((name) => name.endsWith('.ocbackup')),
    ).toHaveLength(1);

    mkdirSync(external);
    const persisted = JSON.parse(readFileSync(settings, 'utf8')) as {
      pendingExternalTemporaryFile: string;
    };
    const staleTemporary = join(external, persisted.pendingExternalTemporaryFile);
    writeFileSync(staleTemporary, 'temporal interrumpido');
    now = new Date('2026-10-20T04:01:01.000Z');
    const restarted = new BackupService(settings, '1.0.0', () => now);
    expect(await restarted.retryPendingExternalCopy()).toBe('SUCCESS');
    expect(existsSync(staleTemporary)).toBe(false);
    expect(restarted.status()).toMatchObject({
      externalCopyStatus: 'COPIED',
      externalRetryAttempts: 0,
    });
    expect(readFileSync(join(external, created.fileName))).toEqual(
      readFileSync(join(root, 'backups', created.fileName)),
    );
    expect(
      readdirSync(join(root, 'backups')).filter((name) => name.endsWith('.ocbackup')),
    ).toHaveLength(1);
    expect(restarted.history().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'EXPORT', trigger: 'RETRY', result: 'SUCCESS' }),
      ]),
    );
  });

  it('agota dos reintentos adicionales y conserva el respaldo local', async () => {
    context = createTestDatabase();
    const root = directory('occhiali-external-exhausted-');
    const external = join(root, 'externo');
    mkdirSync(external);
    let now = new Date('2026-10-20T05:00:00.000Z');
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0', () => now);
    await service.setExportDirectory(external);
    rmSync(external, { recursive: true });
    const created = await service.create(context.database, RECOVERY_PASSWORD);

    now = new Date('2026-10-20T05:01:01.000Z');
    expect(await service.retryPendingExternalCopy()).toBe('PENDING');
    now = new Date('2026-10-20T05:06:02.000Z');
    expect(await service.retryPendingExternalCopy()).toBe('FAILED');
    expect(await service.retryPendingExternalCopy()).toBe('NONE');
    expect(service.status()).toMatchObject({
      externalCopyStatus: 'FAILED',
      externalRetryAttempts: 3,
      nextExternalRetryAt: null,
      lastBackupExists: true,
    });
    expect(existsSync(join(root, 'backups', created.fileName))).toBe(true);
  });

  it('retiene sólo respaldos reconocidos, conserva el último y omite archivos inseguros', async () => {
    const root = directory('occhiali-safe-retention-');
    const names = [
      'occhiali-backup-20261020010000000.ocbackup',
      'occhiali-backup-20261020020000000.ocbackup',
      'occhiali-backup-20261020030000000.ocbackup',
    ];
    for (const name of names) writeFileSync(join(root, name), backupEnvelope(name));
    const corrupt = 'occhiali-backup-20261020000000000.ocbackup';
    writeFileSync(join(root, corrupt), 'no es un respaldo');
    writeFileSync(join(root, 'notas-personales.txt'), 'no tocar');

    const result = await applySafeLocalRetention(root, 1, new Set([names[2]!]));

    expect(result).toMatchObject({
      deleted: [names[1], names[0]],
      skippedUnsafe: 1,
      warning: true,
    });
    expect(existsSync(join(root, names[2]!))).toBe(true);
    expect(existsSync(join(root, corrupt))).toBe(true);
    expect(readFileSync(join(root, 'notas-personales.txt'), 'utf8')).toBe('no tocar');
  });

  it('no sigue junctions con nombre de respaldo ni elimina un respaldo protegido en uso', async () => {
    const root = directory('occhiali-retention-links-');
    const outside = directory('occhiali-retention-outside-');
    const linkedName = 'occhiali-backup-20261019000000000.ocbackup';
    writeFileSync(join(outside, 'archivo-personal.txt'), 'intacto');
    symlinkSync(outside, join(root, linkedName), process.platform === 'win32' ? 'junction' : 'dir');
    const protectedName = 'occhiali-backup-20261018000000000.ocbackup';
    const newerName = 'occhiali-backup-20261020000000000.ocbackup';
    writeFileSync(join(root, protectedName), backupEnvelope(protectedName));
    writeFileSync(join(root, newerName), backupEnvelope(newerName));

    const result = await applySafeLocalRetention(root, 1, new Set([protectedName]));

    expect(result.warning).toBe(true);
    expect(existsSync(join(root, protectedName))).toBe(true);
    expect(existsSync(join(root, newerName))).toBe(true);
    expect(readFileSync(join(outside, 'archivo-personal.txt'), 'utf8')).toBe('intacto');
  });

  it('evita que una verificación compita con una creación o restauración', async () => {
    context = createTestDatabase();
    const root = directory('occhiali-verification-lock-');
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0');
    const created = await service.create(context.database, RECOVERY_PASSWORD);
    service.setSelectedRestorePath(join(root, 'backups', created.fileName));

    const verification = service.verifySelected(RECOVERY_PASSWORD);
    await expect(service.create(context.database, RECOVERY_PASSWORD)).rejects.toThrow('curso');
    expect(() => service.beginRestore()).toThrow('curso');
    await verification;
  });
});
