import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackupService,
  MAX_BACKUP_FILE_SIZE_BYTES,
  readBackupFileWithinLimit,
} from '../src/main/backup/backup-service';
import { recoverInterruptedRestore, RestoreCoordinator } from '../src/main/backup/restore-recovery';
import { ApplicationDatabase } from '../src/main/database';
import { SecurityManager } from '../src/main/security/security-manager';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

const ACCESS = 'Acceso-Ficticio-2026';
const RECOVERY = 'Recuperacion-Ficticia-2026';

describe('protección de acceso', () => {
  const directories: string[] = [];
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  });
  function manager(): { value: SecurityManager; file: string } {
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-security-'));
    directories.push(directory);
    const file = join(directory, 'security.json');
    return { value: new SecurityManager(file), file };
  }
  it('configura un verificador salado sin guardar la contraseña', async () => {
    const item = manager();
    await item.value.setup(ACCESS, 15);
    const contents = readFileSync(item.file, 'utf8');
    expect(contents).not.toContain(ACCESS);
    expect(contents).toContain('verifier');
    expect(item.value.status().authenticated).toBe(true);
  });
  it('exige contraseña válida después de reiniciar', async () => {
    const item = manager();
    await item.value.setup(ACCESS, 15);
    const restarted = new SecurityManager(item.file);
    expect(restarted.status().authenticated).toBe(false);
    await expect(restarted.login('Contraseña-Incorrecta')).rejects.toThrow('no es correcta');
    await restarted.login(ACCESS);
    expect(restarted.status().authenticated).toBe(true);
  });
  it('cierra sesión, cambia la contraseña y rechaza la anterior', async () => {
    const item = manager();
    await item.value.setup(ACCESS, 15);
    await item.value.changePassword(ACCESS, 'Acceso-Nuevo-Ficticio');
    item.value.logout();
    await expect(item.value.login(ACCESS)).rejects.toThrow();
    await item.value.login('Acceso-Nuevo-Ficticio');
    expect(item.value.status().authenticated).toBe(true);
  });
  it('limita intentos repetidos sin bloqueo permanente', async () => {
    const item = manager();
    await item.value.setup(ACCESS, 15);
    item.value.logout();
    for (let index = 0; index < 5; index += 1)
      await item.value.login('Contraseña-Incorrecta').catch(() => undefined);
    expect(item.value.status().retryAfterSeconds).toBeGreaterThan(0);
  });
  it('rechaza operaciones protegidas sin sesión y no persiste la sesión', async () => {
    const item = manager();
    await item.value.setup(ACCESS, 15);
    item.value.logout();
    expect(() => item.value.requireAuthenticated()).toThrow('Autenticación requerida');
    expect(new SecurityManager(item.file).status().authenticated).toBe(false);
  });
  it('rechaza una configuración dañada y no incluye contraseña maestra', () => {
    const item = manager();
    writeFileSync(item.file, '{dañado');
    expect(() => new SecurityManager(item.file)).toThrow('dañada');
  });
  it('no confirma la configuración si falla la escritura atómica', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-security-write-failure-'));
    directories.push(directory);
    const file = join(directory, 'security.json');
    const manager = new SecurityManager(file, () => {
      throw Object.assign(new Error('disco lleno simulado'), { code: 'ENOSPC' });
    });

    await expect(manager.setup(ACCESS, 15)).rejects.toThrow('No se pudo guardar');
    expect(manager.status()).toMatchObject({ configured: false, authenticated: false });
    expect(existsSync(file)).toBe(false);
  });
  it('conserva la contraseña anterior si falla el reemplazo de security.json', async () => {
    const item = manager();
    await item.value.setup(ACCESS, 15);
    const original = readFileSync(item.file, 'utf8');
    const failing = new SecurityManager(item.file, () => {
      throw Object.assign(new Error('permiso denegado simulado'), { code: 'EACCES' });
    });
    await failing.login(ACCESS);

    await expect(failing.changePassword(ACCESS, 'Acceso-Nuevo-No-Persistido')).rejects.toThrow(
      'No se pudo guardar',
    );
    expect(readFileSync(item.file, 'utf8')).toBe(original);
    failing.logout();
    await expect(failing.login(ACCESS)).resolves.toMatchObject({ authenticated: true });
    const restarted = new SecurityManager(item.file);
    await expect(restarted.login(ACCESS)).resolves.toMatchObject({ authenticated: true });
  });
});

describe('backup cifrado y disaster recovery', () => {
  let context: TestDatabase | null = null;
  const directories: string[] = [];
  afterEach(async () => {
    if (context) {
      destroyTestDatabase(context);
      context = null;
    }
    const { rm } = await import('node:fs/promises');
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  });
  function fixture() {
    context = createTestDatabase();
    const client = context.database.clients.create({ firstName: 'Persona', lastName: 'Ficticia' });
    const prescription = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-10-09',
      additionOd: '1.25',
      additionOi: '0.00',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.25' }],
    });
    context.database.prescriptions.correct(prescription.id, {
      prescriptionDate: '2026-10-09',
      additionOd: '1.50',
      additionOi: null,
      reason: 'Prueba',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.50' }],
    });
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: prescription.id,
      jobNumber: 'QA-8',
      treatmentIds: ['edge-polish'],
    });
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-backup-'));
    directories.push(directory);
    return {
      client,
      prescription,
      job,
      service: new BackupService(join(directory, 'backup-settings.json'), '0.1.0'),
      directory,
    };
  }
  it('crea y verifica un respaldo cifrado de SQLite con WAL activo', async () => {
    const value = fixture();
    const created = await value.service.create(context!.database, RECOVERY);
    const path = join(value.directory, 'backups', created.fileName);
    const raw = readFileSync(path, 'utf8');
    expect(created.fileName).toMatch(/^occhiali-backup-\d{17}\.ocbackup$/);
    expect(raw).not.toContain('Persona');
    expect(raw).not.toContain('SQLite format 3');
    value.service.setSelectedRestorePath(path);
    expect((await value.service.verifySelected(RECOVERY)).schemaMigrations).toEqual([
      '001_initial_schema',
      '002_seed_treatments',
      '003_prescription_revisions',
      '004_optical_job_product_details',
      '005_prescription_additions',
      '006_delivery_receipts',
      '007_optical_job_commercial_details',
    ]);
  });
  it('respalda y restaura una base vacía real', async () => {
    context = createTestDatabase();
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-empty-backup-'));
    directories.push(directory);
    const service = new BackupService(join(directory, 'backup-settings.json'), '0.1.0');
    const created = await service.create(context.database, RECOVERY);
    service.setSelectedRestorePath(join(directory, 'backups', created.fileName));
    const prepared = await service.prepareRestore(RECOVERY);
    const restored = ApplicationDatabase.open(prepared.sqlitePath);
    try {
      expect(restored.clients.list()).toHaveLength(0);
      expect(restored.integrityCheck()).toBe('ok');
    } finally {
      restored.close();
    }
  });
  it('rechaza contraseña incorrecta, alteración y truncamiento sin tocar la base', async () => {
    const value = fixture();
    const created = await value.service.create(context!.database, RECOVERY);
    const path = join(value.directory, 'backups', created.fileName);
    value.service.setSelectedRestorePath(path);
    await expect(value.service.verifySelected('Recuperacion-Incorrecta')).rejects.toThrow();
    const raw = readFileSync(path, 'utf8');
    writeFileSync(path, `${raw.slice(0, -20)}alterado`);
    await expect(value.service.verifySelected(RECOVERY)).rejects.toThrow();
    expect(context!.database.integrityCheck()).toBe('ok');
  });
  it('restaura en una ubicación independiente y conserva IDs, relaciones y revisiones', async () => {
    const value = fixture();
    const created = await value.service.create(context!.database, RECOVERY);
    value.service.setSelectedRestorePath(join(value.directory, 'backups', created.fileName));
    context!.database.close();
    const prepared = await value.service.prepareRestore(RECOVERY);
    const restored = ApplicationDatabase.open(prepared.sqlitePath);
    try {
      expect(restored.clients.getById(value.client.id)?.lastName).toBe('Ficticia');
      expect(restored.prescriptions.getById(value.prescription.id)?.values[0]?.sphere).toBe(
        '-1.50',
      );
      expect(restored.prescriptions.getById(value.prescription.id)).toMatchObject({
        additionOd: '1.50',
        additionOi: null,
      });
      expect(restored.prescriptions.listRevisions(value.prescription.id)).toMatchObject([
        { additionOd: '1.25', additionOi: '0.00' },
      ]);
      expect(restored.opticalJobs.getById(value.job.id)?.treatments[0]?.id).toBe('edge-polish');
      expect(
        restored.clients.create({ firstName: 'Nueva', lastName: 'Escritura' }).id,
      ).toBeGreaterThan(value.client.id);
    } finally {
      restored.close();
    }
  });
  it('evita respaldos simultáneos y aplica retención sólo a archivos administrados', async () => {
    const value = fixture();
    value.service.configure({ automaticEnabled: true, automaticHour: 20, retentionCount: 2 });
    const first = value.service.create(context!.database, RECOVERY);
    await expect(value.service.create(context!.database, RECOVERY)).rejects.toThrow('curso');
    await first;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await value.service.create(context!.database, RECOVERY);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await value.service.create(context!.database, RECOVERY);
    const { readdir } = await import('node:fs/promises');
    expect(
      (await readdir(join(value.directory, 'backups'))).filter((name) =>
        name.endsWith('.ocbackup'),
      ),
    ).toHaveLength(2);
    expect(value.service.status().remoteSyncVerified).toBe(false);
  });
  it('exporta el archivo completo sin afirmar sincronización remota', async () => {
    const value = fixture();
    const exportDirectory = join(value.directory, 'carpeta sincronizada');
    mkdirSync(exportDirectory);
    await value.service.setExportDirectory(exportDirectory);
    const created = await value.service.create(context!.database, RECOVERY);
    expect(created.exportedToSyncFolder).toBe(true);
    expect(created.exportError).toBe(false);
    expect(created.remoteSyncVerified).toBe(false);
    expect(existsSync(join(exportDirectory, created.fileName))).toBe(true);
    expect(existsSync(join(exportDirectory, `${created.fileName}.partial`))).toBe(false);
  });
  it('conserva el backup local si la carpeta externa deja de existir', async () => {
    const value = fixture();
    const external = join(value.directory, 'inexistente');
    mkdirSync(external);
    await value.service.setExportDirectory(external);
    rmSync(external, { recursive: true });
    const created = await value.service.create(context!.database, RECOVERY);
    expect(created.exportedToSyncFolder).toBe(false);
    expect(created.exportError).toBe(true);
    expect(existsSync(join(value.directory, 'backups', created.fileName))).toBe(true);
    expect(value.service.status().lastBackupFile).toBe(created.fileName);
  });
  it('rechaza cabeceras alteradas y versiones futuras', async () => {
    const value = fixture();
    const created = await value.service.create(context!.database, RECOVERY);
    const path = join(value.directory, 'backups', created.fileName);
    const envelope = JSON.parse(readFileSync(path, 'utf8')) as {
      metadata: { schemaMigrations: string[] };
    };
    envelope.metadata.schemaMigrations.push('999_future_schema');
    writeFileSync(path, JSON.stringify(envelope));
    value.service.setSelectedRestorePath(path);
    await expect(value.service.verifySelected(RECOVERY)).rejects.toThrow('versión futura');
  });
  it('rechaza por metadatos un respaldo excesivo antes de leer su contenido', async () => {
    const readText = vi.fn(() => Promise.resolve('{no debe leerse}'));
    await expect(
      readBackupFileWithinLimit('respaldo-simulado.ocbackup', {
        inspect: () =>
          Promise.resolve({
            isFile: true,
            sizeBytes: MAX_BACKUP_FILE_SIZE_BYTES + 1,
          }),
        readText,
      }),
    ).rejects.toThrow('tamaño máximo admitido de 128 MB');
    expect(readText).not.toHaveBeenCalled();
  });
});

describe('recuperación de restauraciones interrumpidas', () => {
  it('repone la base anterior si falta la activa y elimina staging descifrado', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-restore-recovery-'));
    const active = join(directory, 'optica.sqlite3');
    const rollback = `${active}.restore-rollback`;
    const staging = join(directory, '.restore-staging-deadbeefdeadbeef.sqlite3');
    writeFileSync(active, 'base-anterior');
    writeFileSync(staging, 'temporal');
    const coordinator = new RestoreCoordinator(active);
    coordinator.begin(staging);
    coordinator.moveActiveToRollback();
    const recovered = recoverInterruptedRestore(active);
    expect(recovered).toEqual({
      action: 'rolled-back',
      recoveredPreviousDatabase: true,
      removedStagingFiles: 1,
      removedRollback: true,
    });
    expect(readFileSync(active, 'utf8')).toBe('base-anterior');
    expect(existsSync(rollback)).toBe(false);
    expect(existsSync(staging)).toBe(false);
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
});
