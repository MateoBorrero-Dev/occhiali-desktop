import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupService } from '../src/main/backup/backup-service';
import { ApplicationDatabase } from '../src/main/database';
import { getMigrationIds } from '../src/main/database/migrations';
import { SecurityManager } from '../src/main/security/security-manager';

const ACCESS_PASSWORD = 'Acceso-Actualizacion-1.1-Ficticio';
const RECOVERY_PASSWORD = 'Recuperacion-Actualizacion-1.1-Ficticia';

describe('compatibilidad de instalación 1.0.0 → 1.1.0', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  it('conserva SQLite, acceso, configuración y respaldos sin activar automatización', async () => {
    const profile = mkdtempSync(join(tmpdir(), 'occhiali-upgrade-1-1-'));
    directories.push(profile);
    const databasePath = join(profile, 'optica.sqlite3');
    const settingsPath = join(profile, 'backup-settings.json');
    const securityPath = join(profile, 'security.json');
    const exportDirectory = join(profile, 'external');
    mkdirSync(exportDirectory);

    const database = ApplicationDatabase.open(databasePath);
    const client = database.clients.create({
      firstName: 'Actualización',
      lastName: 'Uno Uno',
      documentNumber: '30111110',
    });
    const prescription = database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-10-20',
      additionOd: '1.25',
      additionOi: '1.50',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.75', cylinder: '-0.50', axis: 90 }],
    });
    const job = database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: prescription.id,
      jobNumber: 'UP-110-001',
      product: 'Anteojos ficticios',
      treatmentNames: ['Tratamiento compatible 1.1'],
    });
    const receipt = database.deliveryReceipts.create({
      opticalJobId: job.id,
      deliveredAt: '2026-10-20T12:00:00.000Z',
      recipientType: 'OWNER',
      recipientFullName: 'Actualización Uno Uno',
      deliveredBy: 'Responsable QA',
      deliveryConfirmed: true,
    });

    const security = new SecurityManager(securityPath);
    await security.setup(ACCESS_PASSWORD, 15);
    security.logout();

    const versionOneBackups = new BackupService(settingsPath, '1.0.0');
    await versionOneBackups.setExportDirectory(exportDirectory);
    const created = await versionOneBackups.create(database, RECOVERY_PASSWORD);
    const backupPath = join(profile, 'backups', created.fileName);
    expect(existsSync(backupPath)).toBe(true);

    const generatedSettings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<
      string,
      unknown
    >;
    writeFileSync(
      settingsPath,
      JSON.stringify({
        localDirectory: generatedSettings.localDirectory,
        exportDirectory,
        lastBackupAt: generatedSettings.lastBackupAt,
        lastBackupFile: generatedSettings.lastBackupFile,
        lastErrorAt: null,
        automaticEnabled: true,
        automaticHour: 7,
        retentionCount: 5,
      }),
      'utf8',
    );
    rmSync(join(profile, 'backup-history.json'), { force: true });
    rmSync(join(profile, 'backup-credential.json'), { force: true });
    database.close();

    const reopened = ApplicationDatabase.open(databasePath);
    try {
      expect(reopened.getAppliedMigrationIds()).toEqual(getMigrationIds());
      expect(reopened.clients.getById(client.id)?.documentNumber).toBe('30111110');
      expect(reopened.prescriptions.getById(prescription.id)?.additionOi).toBe('1.50');
      expect(reopened.opticalJobs.getById(job.id)?.treatments).toEqual([
        expect.objectContaining({ name: 'Tratamiento compatible 1.1' }),
      ]);
      expect(reopened.deliveryReceipts.getById(receipt.id)?.receiptNumber).toBe('RET-000001');
      expect(reopened.integrityCheck()).toBe('ok');
      expect(reopened.foreignKeyViolations()).toEqual([]);
    } finally {
      reopened.close();
    }

    const upgradedSecurity = new SecurityManager(securityPath);
    await expect(upgradedSecurity.login(ACCESS_PASSWORD)).resolves.toMatchObject({
      configured: true,
      authenticated: true,
    });

    const upgradedBackups = new BackupService(settingsPath, '1.1.0');
    expect(upgradedBackups.status()).toMatchObject({
      exportDirectory,
      lastBackupFile: created.fileName,
      lastBackupExists: true,
      automaticEnabled: false,
      automaticHour: 7,
      retentionCount: 5,
      protectedCredentialState: 'MISSING',
    });
    upgradedBackups.setSelectedRestorePath(backupPath);
    await expect(upgradedBackups.verifySelected(RECOVERY_PASSWORD)).resolves.toMatchObject({
      appVersion: '1.0.0',
      schemaMigrations: getMigrationIds(),
    });
    const prepared = await upgradedBackups.prepareRestore(RECOVERY_PASSWORD);
    const restored = ApplicationDatabase.open(prepared.sqlitePath);
    try {
      expect(restored.clients.getById(client.id)?.lastName).toBe('Uno Uno');
      expect(restored.prescriptions.getById(prescription.id)).toBeDefined();
      expect(restored.opticalJobs.getById(job.id)).toBeDefined();
      expect(restored.deliveryReceipts.getById(receipt.id)).toBeDefined();
      expect(restored.integrityCheck()).toBe('ok');
    } finally {
      restored.close();
      await prepared.cleanup();
    }

    const upgradedSettings = readFileSync(settingsPath, 'utf8');
    expect(upgradedSettings).not.toContain(ACCESS_PASSWORD);
    expect(upgradedSettings).not.toContain(RECOVERY_PASSWORD);
    expect(existsSync(join(profile, 'backup-credential.json'))).toBe(false);
  });
});
