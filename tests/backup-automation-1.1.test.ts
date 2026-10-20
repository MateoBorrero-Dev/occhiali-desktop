import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackupCredentialStore,
  type SafeStorageProvider,
} from '../src/main/backup/backup-credential-store';
import { BackupScheduler } from '../src/main/backup/backup-scheduler';
import { BackupService, scheduledBackupWindowStart } from '../src/main/backup/backup-service';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

const RECOVERY_PASSWORD = 'Recuperacion-Automatica-2026';

function safeStorage(available = true): SafeStorageProvider {
  return {
    isEncryptionAvailable: () => available,
    encryptStringAsync: (value) =>
      Promise.resolve(Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa5))),
    decryptStringAsync: (value) =>
      Promise.resolve({
        result: Buffer.from(value.map((byte) => byte ^ 0xa5)).toString(),
        shouldReEncrypt: false,
      }),
  };
}

describe('credencial protegida de respaldos automáticos', () => {
  const directories: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  function credentialPath(): string {
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-protected-credential-'));
    directories.push(directory);
    return join(directory, 'backup-credential.json');
  }

  it('protege, reemplaza y elimina la contraseña sin guardarla en texto plano', async () => {
    const path = credentialPath();
    const storage = safeStorage();
    const credentials = new BackupCredentialStore(path, storage);

    await credentials.store(RECOVERY_PASSWORD);
    expect(credentials.state()).toBe('READY');
    expect(readFileSync(path, 'utf8')).not.toContain(RECOVERY_PASSWORD);
    await expect(new BackupCredentialStore(path, storage).retrieve()).resolves.toBe(
      RECOVERY_PASSWORD,
    );

    await credentials.store('Recuperacion-Reemplazada-2026');
    await expect(credentials.retrieve()).resolves.toBe('Recuperacion-Reemplazada-2026');
    credentials.clear();
    expect(existsSync(path)).toBe(false);
    expect(credentials.state()).toBe('MISSING');
  });

  it('falla de forma segura si safeStorage no está disponible', async () => {
    const credentials = new BackupCredentialStore(credentialPath(), safeStorage(false));
    expect(credentials.state()).toBe('UNAVAILABLE');
    await expect(credentials.store(RECOVERY_PASSWORD)).rejects.toThrow('no está disponible');
    await expect(credentials.retrieve()).rejects.toThrow('no está disponible');
  });

  it('detecta una credencial cifrada dañada sin exponer su contenido', async () => {
    const path = credentialPath();
    const credentials = new BackupCredentialStore(path, safeStorage());
    await credentials.store(RECOVERY_PASSWORD);
    const value = JSON.parse(readFileSync(path, 'utf8')) as { protectedValue: string };
    value.protectedValue = 'contenido-no-base64';
    writeFileSync(path, JSON.stringify({ version: 1, ...value }));

    await expect(credentials.retrieve()).rejects.toThrow('está dañada');
    expect(credentials.state()).toBe('DAMAGED');
  });

  it('marca como dañada una credencial que safeStorage ya no puede descifrar', async () => {
    const path = credentialPath();
    const credentials = new BackupCredentialStore(path, safeStorage());
    await credentials.store(RECOVERY_PASSWORD);
    const unavailableCipher: SafeStorageProvider = {
      ...safeStorage(),
      decryptStringAsync: () => Promise.reject(new Error('DPAPI rejected test value')),
    };
    const restarted = new BackupCredentialStore(path, unavailableCipher);

    await expect(restarted.inspect()).resolves.toBe('DAMAGED');
    await expect(restarted.retrieve()).rejects.toThrow('está dañada');
    expect(JSON.stringify(restarted.state())).not.toContain(RECOVERY_PASSWORD);
  });

  it('cancela una lectura si la credencial se elimina mientras Windows la descifra', async () => {
    const path = credentialPath();
    let finishDecrypt!: (value: { result: string; shouldReEncrypt: boolean }) => void;
    const storage: SafeStorageProvider = {
      ...safeStorage(),
      decryptStringAsync: () =>
        new Promise((resolve) => {
          finishDecrypt = resolve;
        }),
    };
    const credentials = new BackupCredentialStore(path, storage);
    await credentials.store(RECOVERY_PASSWORD);

    const pending = credentials.retrieveSnapshot();
    await vi.waitFor(() => expect(finishDecrypt).toBeTypeOf('function'));
    credentials.clear();
    finishDecrypt({ result: RECOVERY_PASSWORD, shouldReEncrypt: false });

    await expect(pending).rejects.toThrow('cambió durante la operación');
    expect(credentials.state()).toBe('MISSING');
    expect(existsSync(path)).toBe(false);
  });
});

describe('scheduler de respaldos automáticos', () => {
  let context: TestDatabase | null = null;
  const directories: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    if (context) {
      destroyTestDatabase(context);
      context = null;
    }
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  async function fixture(
    withCredential = true,
    initialNow = new Date(2026, 0, 10, 8, 0, 0),
    automaticHour = 9,
  ) {
    context = createTestDatabase();
    const root = mkdtempSync(join(tmpdir(), 'occhiali-automatic-backup-'));
    directories.push(root);
    let now = initialNow;
    const backups = new BackupService(join(root, 'backup-settings.json'), '1.0.0', () => now);
    const credentials = new BackupCredentialStore(
      join(root, 'backup-credential.json'),
      safeStorage(),
    );
    if (withCredential) await credentials.store(RECOVERY_PASSWORD);
    backups.setProtectedCredentialState(credentials.state());
    backups.configure({ automaticEnabled: true, automaticHour, retentionCount: 14 });
    const scheduler = new BackupScheduler(backups, credentials, context.database, () => now);
    return {
      root,
      backups,
      credentials,
      scheduler,
      setNow: (value: Date) => {
        now = value;
      },
    };
  }

  it('respeta la hora local, recupera pendientes y evita duplicados del mismo período', async () => {
    const value = await fixture();
    expect(await value.scheduler.checkNow('STARTUP')).toBe('NOT_DUE');

    value.setNow(new Date(2026, 0, 10, 9, 1, 0));
    expect(await value.scheduler.checkNow('INTERVAL')).toBe('CREATED');
    const status = value.backups.status();
    expect(status).toMatchObject({
      automaticState: 'READY',
      lastAutomaticErrorAt: null,
    });
    expect(status.lastAutomaticBackupAt).toBeTruthy();
    const lastFile = value.backups.status().lastBackupFile!;
    rmSync(join(value.root, 'backups', lastFile));
    expect(await value.scheduler.checkNow('RESUME')).toBe('ALREADY_ATTEMPTED');
    expect(
      value.backups
        .history()
        .events.filter((event) => event.operation === 'CREATE' && event.trigger === 'AUTOMATIC'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ result: 'STARTED' }),
        expect.objectContaining({ result: 'SUCCESS' }),
      ]),
    );
  });

  it('crea la primera copia al activar después de la hora programada', async () => {
    const value = await fixture(true, new Date(2026, 9, 20, 0, 53, 50, 752), 0);
    expect(value.backups.status()).toMatchObject({
      due: true,
      automaticState: 'PENDING',
      lastBackupExists: false,
    });

    expect(await value.scheduler.checkNow('CONFIGURATION')).toBe('CREATED');
    expect(value.backups.status()).toMatchObject({
      due: false,
      automaticState: 'READY',
      lastBackupExists: true,
    });
  });

  it('espera la hora si se activa antes del corte y no informa que está al día', async () => {
    const value = await fixture(true, new Date(2026, 9, 20, 8, 0, 0), 9);
    expect(value.backups.status()).toMatchObject({
      due: false,
      automaticState: 'PENDING',
      lastBackupExists: false,
    });
    expect(await value.scheduler.checkNow('CONFIGURATION')).toBe('NOT_DUE');
  });

  it('una copia manual sólo cubre la ventana si fue creada después del corte', async () => {
    const value = await fixture(true, new Date(2026, 0, 10, 8, 55, 0), 9);
    await value.backups.create(context!.database, RECOVERY_PASSWORD);
    value.setNow(new Date(2026, 0, 10, 9, 1, 0));
    expect(await value.scheduler.checkNow('INTERVAL')).toBe('CREATED');

    value.setNow(new Date(2026, 0, 11, 9, 1, 0));
    await value.backups.create(context!.database, RECOVERY_PASSWORD);
    expect(value.backups.status().due).toBe(false);
    expect(await value.scheduler.checkNow('INTERVAL')).toBe('NOT_DUE');
  });

  it('recalcula ventanas con calendario local ante cambios de día y hora', () => {
    expect(scheduledBackupWindowStart(new Date(2026, 2, 8, 8, 30), 9).getDate()).toBe(7);
    expect(scheduledBackupWindowStart(new Date(2026, 2, 8, 9, 30), 9).getDate()).toBe(8);
    expect(scheduledBackupWindowStart(new Date(2026, 2, 8, 9, 30), 9).getHours()).toBe(9);
  });

  it('persiste la activación explícita y el estado tras reiniciar el servicio', async () => {
    const value = await fixture();
    value.setNow(new Date(2026, 0, 10, 9, 1, 0));
    expect(await value.scheduler.checkNow('STARTUP')).toBe('CREATED');

    const restarted = new BackupService(
      join(value.root, 'backup-settings.json'),
      '1.0.0',
      () => new Date(2026, 0, 10, 9, 2, 0),
    );
    restarted.setProtectedCredentialState(await value.credentials.inspect());
    expect(restarted.status()).toMatchObject({
      automaticEnabled: true,
      protectedCredentialState: 'READY',
      automaticState: 'READY',
      lastAutomaticBackupAt: value.backups.status().lastAutomaticBackupAt,
    });
  });

  it('deja el respaldo pendiente y registra una sola falla si falta la credencial', async () => {
    const value = await fixture(false);
    value.setNow(new Date(2026, 0, 10, 9, 1, 0));

    expect(await value.scheduler.checkNow('STARTUP')).toBe('BLOCKED');
    expect(await value.scheduler.checkNow('INTERVAL')).toBe('ALREADY_ATTEMPTED');
    expect(value.backups.status()).toMatchObject({
      due: true,
      automaticState: 'BLOCKED',
      protectedCredentialState: 'MISSING',
    });
    expect(value.backups.history().events).toEqual([
      expect.objectContaining({ trigger: 'AUTOMATIC', result: 'FAILURE' }),
    ]);
  });

  it('no compite con una restauración ni marca el período como intentado', async () => {
    const value = await fixture();
    value.setNow(new Date(2026, 0, 10, 9, 1, 0));
    value.backups.beginRestore();
    expect(await value.scheduler.checkNow('RESUME')).toBe('BUSY');
    expect(value.backups.status().lastAutomaticAttemptAt).toBeNull();
    value.backups.endRestore();
    expect(await value.scheduler.checkNow('INTERVAL')).toBe('CREATED');
  });

  it('no compite con una creación manual en curso', async () => {
    const value = await fixture();
    value.setNow(new Date(2026, 0, 10, 9, 1, 0));
    let release!: () => void;
    vi.spyOn(context!.database, 'backupTo').mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const manual = value.backups.create(context!.database, RECOVERY_PASSWORD);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    let idle = false;
    const waiting = value.backups.waitUntilIdle().then(() => {
      idle = true;
    });

    expect(await value.scheduler.checkNow('INTERVAL')).toBe('BUSY');
    expect(idle).toBe(false);
    release();
    await manual;
    await waiting;
    expect(idle).toBe(true);
  });

  it('conserva el éxito local y hace visible un fallo externo automático', async () => {
    const value = await fixture();
    const unavailable = join(value.root, 'destino-ausente');
    mkdirSync(unavailable);
    await value.backups.setExportDirectory(unavailable);
    rmSync(unavailable, { recursive: true });
    value.setNow(new Date(2026, 0, 10, 9, 1, 0));

    expect(await value.scheduler.checkNow('INTERVAL')).toBe('CREATED');
    expect(value.backups.status()).toMatchObject({
      lastBackupExists: true,
      externalCopyStatus: 'PENDING',
      automaticState: 'ERROR',
    });
    const rawHistory = readFileSync(join(value.root, 'backup-history.json'), 'utf8');
    expect(rawHistory).not.toContain(RECOVERY_PASSWORD);
    expect(value.backups.history().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trigger: 'AUTOMATIC', result: 'PARTIAL' }),
        expect.objectContaining({ trigger: 'AUTOMATIC', operation: 'EXPORT', result: 'PARTIAL' }),
      ]),
    );
  });

  it('maneja un error de archivos sin bloquear la base comercial', async () => {
    const value = await fixture();
    value.setNow(new Date(2026, 0, 10, 9, 1, 0));
    vi.spyOn(context!.database, 'backupTo').mockRejectedValueOnce(new Error('ruta privada'));

    expect(await value.scheduler.checkNow('INTERVAL')).toBe('FAILED');
    expect(context!.database.integrityCheck()).toBe('ok');
    expect(value.backups.status()).toMatchObject({ automaticState: 'ERROR', due: true });
    expect(JSON.stringify(value.backups.history())).not.toContain('ruta privada');
  });
});
