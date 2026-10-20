import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupHistoryStore, BACKUP_HISTORY_LIMIT } from '../src/main/backup/backup-history';
import {
  BackupService,
  calculateBackupAlert,
  calculateBackupDue,
} from '../src/main/backup/backup-service';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

const RECOVERY_PASSWORD = 'Recuperacion-Observabilidad-2026';

describe('observabilidad de respaldos 1.1', () => {
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

  it('calcula el horario configurado con el calendario local y respeta la gracia inicial', () => {
    const started = new Date(2026, 0, 10, 19, 30, 0).toISOString();
    expect(
      calculateBackupDue(null, true, 20, started, false, new Date(2026, 0, 10, 19, 59, 0)),
    ).toBe(false);
    expect(
      calculateBackupDue(null, true, 20, started, false, new Date(2026, 0, 10, 20, 1, 0)),
    ).toBe(true);
    expect(
      calculateBackupDue(
        new Date(2026, 0, 10, 20, 2, 0).toISOString(),
        true,
        20,
        started,
        true,
        new Date(2026, 0, 10, 22, 0, 0),
      ),
    ).toBe(false);
  });

  it('considera pendiente la primera copia si la automatización se activa después del corte', () => {
    const started = new Date(2026, 9, 20, 0, 53, 50, 752).toISOString();
    expect(calculateBackupDue(null, true, 0, started, false, new Date(2026, 9, 20, 0, 58, 0))).toBe(
      true,
    );
  });

  it('mide antigüedad por instante aunque el respaldo incluya otro huso horario', () => {
    const lastBackup = '2026-01-10T20:00:00-03:00';
    const monitoring = '2026-01-01T00:00:00Z';
    expect(
      calculateBackupAlert(lastBackup, monitoring, null, true, new Date('2026-01-11T23:30:00Z')),
    ).toBe('WARNING');
    expect(
      calculateBackupAlert(lastBackup, monitoring, null, true, new Date('2026-01-14T00:01:00Z')),
    ).toBe('CRITICAL');
  });

  it('usa la referencia más reciente al iniciar el monitoreo o confirmar una restauración', () => {
    const oldBackup = '2026-01-01T12:00:00.000Z';
    const monitoring = '2026-01-10T12:00:00.000Z';
    const restored = '2026-01-12T12:00:00.000Z';

    expect(
      calculateBackupAlert(oldBackup, monitoring, null, true, new Date('2026-01-11T11:00:00Z')),
    ).toBe('NONE');
    expect(
      calculateBackupAlert(oldBackup, monitoring, restored, true, new Date('2026-01-13T11:00:00Z')),
    ).toBe('NONE');
    expect(
      calculateBackupAlert(oldBackup, monitoring, restored, true, new Date('2026-01-13T13:00:00Z')),
    ).toBe('WARNING');
  });

  it('detecta antigüedad y desaparición del último archivo local sin descifrarlo', async () => {
    context = createTestDatabase();
    const root = directory('occhiali-observability-');
    let now = new Date('2026-01-10T12:00:00.000Z');
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0', () => now);
    const created = await service.create(context.database, RECOVERY_PASSWORD);

    expect(service.status()).toMatchObject({
      lastBackupExists: true,
      lastBackupAgeHours: 0,
      alertLevel: 'NONE',
    });
    now = new Date('2026-01-11T13:00:00.000Z');
    expect(service.status().alertLevel).toBe('WARNING');
    now = new Date('2026-01-13T13:01:00.000Z');
    expect(service.status().alertLevel).toBe('CRITICAL');

    rmSync(join(root, 'backups', created.fileName));
    expect(service.status()).toMatchObject({ lastBackupExists: false, alertLevel: 'MISSING' });
  });

  it('registra éxito parcial y fallo externo sin perder el respaldo local', async () => {
    context = createTestDatabase();
    context.database.clients.create({ firstName: 'Persona', lastName: 'No debe registrarse' });
    const root = directory('occhiali-external-history-');
    const missingExternal = join(root, 'destino-ausente');
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0');
    mkdirSync(missingExternal);
    await service.setExportDirectory(missingExternal);
    rmSync(missingExternal, { recursive: true });
    const created = await service.create(context.database, RECOVERY_PASSWORD);

    expect(created).toMatchObject({ exportedToSyncFolder: false, exportError: true });
    expect(existsSync(join(root, 'backups', created.fileName))).toBe(true);
    expect(service.status()).toMatchObject({
      lastBackupExists: true,
      externalCopyStatus: 'PENDING',
    });
    expect(service.history().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'CREATE', result: 'PARTIAL', localState: 'VALID' }),
        expect.objectContaining({
          operation: 'EXPORT',
          result: 'PARTIAL',
          externalState: 'PENDING',
        }),
      ]),
    );
    const raw = readFileSync(join(root, 'backup-history.json'), 'utf8');
    expect(raw).not.toContain(RECOVERY_PASSWORD);
    expect(raw).not.toContain('No debe registrarse');
    expect(raw).not.toContain(missingExternal);
  });

  it('no invalida un respaldo correcto si el historial falla inesperadamente', async () => {
    context = createTestDatabase();
    const root = directory('occhiali-history-failure-');
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0');
    const internal = service as unknown as {
      historyStore: BackupHistoryStore;
    };
    vi.spyOn(internal.historyStore, 'append').mockImplementation(() => {
      throw new Error('fallo de historial simulado');
    });

    const created = await service.create(context.database, RECOVERY_PASSWORD);

    expect(existsSync(join(root, 'backups', created.fileName))).toBe(true);
    expect(service.status()).toMatchObject({ lastBackupExists: true, alertLevel: 'NONE' });
  });

  it('detecta si una copia externa antes depositada deja de existir', async () => {
    context = createTestDatabase();
    const root = directory('occhiali-external-missing-');
    const external = join(root, 'externo');
    mkdirSync(external);
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0');
    await service.setExportDirectory(external);
    const created = await service.create(context.database, RECOVERY_PASSWORD);
    expect(service.status().externalCopyStatus).toBe('COPIED');
    rmSync(join(external, created.fileName));
    expect(service.status().externalCopyStatus).toBe('MISSING');
  });

  it('anonimiza archivos seleccionados y no registra contraseñas en verificaciones fallidas', async () => {
    context = createTestDatabase();
    const root = directory('occhiali-history-sanitized-');
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0');
    const created = await service.create(context.database, RECOVERY_PASSWORD);
    const selected = join(root, 'respaldo-cliente-maria.ocbackup');
    copyFileSync(join(root, 'backups', created.fileName), selected);
    service.setSelectedRestorePath(selected);
    await expect(service.verifySelected('Contraseña-Incorrecta-2026')).rejects.toThrow();
    await expect(service.verifySelected(RECOVERY_PASSWORD)).resolves.toBeDefined();

    const verificationEvents = service
      .history()
      .events.filter((event) => event.operation === 'VERIFY');
    expect(verificationEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ result: 'FAILURE', fileName: 'respaldo-seleccionado.ocbackup' }),
        expect.objectContaining({ result: 'SUCCESS', fileName: 'respaldo-seleccionado.ocbackup' }),
      ]),
    );
    const raw = readFileSync(join(root, 'backup-history.json'), 'utf8');
    expect(raw).not.toContain('Contraseña-Incorrecta-2026');
    expect(raw).not.toContain('cliente-maria');
  });

  it('limita el historial y preserva un archivo dañado antes de recuperarse', () => {
    const root = directory('occhiali-history-recovery-');
    const path = join(root, 'backup-history.json');
    const store = new BackupHistoryStore(path);
    for (let index = 0; index < BACKUP_HISTORY_LIMIT + 5; index += 1) {
      expect(
        store.append({
          occurredAt: new Date(2026, 0, 1, 0, index).toISOString(),
          operation: 'VERIFY',
          result: 'SUCCESS',
          localState: 'VALID',
          externalState: 'NOT_APPLICABLE',
          fileName: 'respaldo-seleccionado.ocbackup',
        }),
      ).toBe(true);
    }
    expect(store.snapshot().events).toHaveLength(BACKUP_HISTORY_LIMIT);
    expect(existsSync(`${path}.next`)).toBe(false);

    writeFileSync(path, '{historial dañado', 'utf8');
    const recovered = new BackupHistoryStore(path, () => new Date('2026-01-20T00:00:00Z'));
    expect(recovered.snapshot()).toMatchObject({
      events: [],
      available: true,
      recoveredFromDamage: true,
    });
    expect(readdirSync(root)).toContain('backup-history.json.corrupt-20260120000000000');
  });

  it('bloquea nuevas escrituras si un historial dañado no puede ponerse en cuarentena', () => {
    const root = directory('occhiali-history-preserved-');
    const path = join(root, 'backup-history.json');
    const damaged = '{historial que debe conservarse';
    const quarantinePath = `${path}.corrupt-20260120000000000`;
    writeFileSync(path, damaged, 'utf8');
    mkdirSync(quarantinePath);

    const store = new BackupHistoryStore(path, () => new Date('2026-01-20T00:00:00Z'));

    expect(store.snapshot()).toMatchObject({
      events: [],
      available: false,
      recoveredFromDamage: true,
    });
    expect(
      store.append({
        occurredAt: '2026-01-20T00:01:00.000Z',
        operation: 'VERIFY',
        result: 'SUCCESS',
        localState: 'VALID',
        externalState: 'NOT_APPLICABLE',
      }),
    ).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(damaged);
  });

  it('mantiene compatibles configuraciones anteriores sin los nuevos campos', () => {
    const root = directory('occhiali-old-backup-settings-');
    writeFileSync(
      join(root, 'backup-settings.json'),
      JSON.stringify({
        localDirectory: 'ignorada',
        exportDirectory: null,
        lastBackupAt: null,
        lastBackupFile: null,
        lastErrorAt: null,
        automaticEnabled: true,
        automaticHour: 20,
        retentionCount: 14,
      }),
    );
    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0');
    expect(service.status()).toMatchObject({
      alertLevel: 'NONE',
      automaticEnabled: false,
      externalCopyStatus: 'NOT_CONFIGURED',
      historyAvailable: true,
    });
  });

  it('no expone referencias de archivo arbitrarias cargadas desde la configuración', () => {
    const root = directory('occhiali-unsafe-backup-reference-');
    writeFileSync(
      join(root, 'backup-settings.json'),
      JSON.stringify({
        lastBackupAt: '2026-01-10T12:00:00.000Z',
        lastBackupFile: 'C:\\Datos privados\\cliente.ocbackup',
      }),
    );

    const service = new BackupService(join(root, 'backup-settings.json'), '1.0.0');

    expect(service.status()).toMatchObject({
      lastBackupFile: null,
      lastBackupExists: false,
      alertLevel: 'MISSING',
    });
  });
});
