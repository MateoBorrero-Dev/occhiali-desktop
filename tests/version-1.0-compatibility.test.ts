import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupService } from '../src/main/backup/backup-service';
import { ApplicationDatabase } from '../src/main/database';
import { getMigrationIds } from '../src/main/database/migrations';
import { SecurityManager } from '../src/main/security/security-manager';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

const ACCESS_PASSWORD = 'Acceso-Actualizacion-Ficticio';
const RECOVERY_PASSWORD = 'Recuperacion-Actualizacion-Ficticia';

describe('compatibilidad de datos 0.9.0 → 1.0.0', () => {
  let databaseContext: TestDatabase | null = null;
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    if (databaseContext) {
      destroyTestDatabase(databaseContext);
      databaseContext = null;
    }
    for (const directory of temporaryDirectories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  it('abre un backup 0.9.0 en 1.0.0 y conserva todos los dominios y la seguridad local', async () => {
    databaseContext = createTestDatabase();
    const profile = mkdtempSync(join(tmpdir(), 'occhiali-version-upgrade-'));
    temporaryDirectories.push(profile);
    const securityPath = join(profile, 'security.json');
    const security = new SecurityManager(securityPath);
    await security.setup(ACCESS_PASSWORD, 15);
    security.logout();

    const client = databaseContext.database.clients.create({
      firstName: 'Actualización',
      lastName: 'Ficticia',
      documentNumber: '30000001',
      phone: '0000000000',
    });
    const prescription = databaseContext.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-10-18',
      additionOd: '1.25',
      additionOi: '0.00',
      values: [
        { distance: 'FAR', eye: 'OD', sphere: '-2.00', cylinder: '0.00', axis: 0 },
        { distance: 'NEAR', eye: 'OI', sphere: '1.50', dip: '31.50', height: '18.00' },
      ],
    });
    databaseContext.database.prescriptions.correct(prescription.id, {
      prescriptionDate: '2026-10-18',
      additionOd: '1.50',
      additionOi: null,
      reason: 'Corrección ficticia previa a actualización',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.75' }],
    });
    const job = databaseContext.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: prescription.id,
      jobNumber: 'UP-0001',
      product: 'Lentes de contacto',
      productColor: 'Transparente',
      supplier: 'Proveedor ficticio',
      treatmentNames: ['Tratamiento libre de actualización'],
    });
    const receipt = databaseContext.database.deliveryReceipts.create({
      opticalJobId: job.id,
      deliveredAt: '2026-10-18T12:00:00.000Z',
      recipientType: 'AUTHORIZED_THIRD_PARTY',
      recipientFullName: 'Persona Autorizada',
      recipientDocumentNumber: '30000002',
      recipientRelationship: 'Familiar',
      authorizationReference: 'Autorización ficticia',
      authorizationConfirmed: true,
      deliveredBy: 'Responsable QA',
      deliveryConfirmed: true,
    });
    databaseContext.database.deliveryReceipts.addEvent({
      receiptId: receipt.id,
      type: 'CORRECTION_NOTE',
      reason: 'Aclaración ficticia preservada',
    });

    const settingsPath = join(profile, 'backup-settings.json');
    const previousVersion = new BackupService(settingsPath, '0.9.0');
    const created = await previousVersion.create(databaseContext.database, RECOVERY_PASSWORD);
    const backupPath = join(profile, 'backups', created.fileName);
    const currentVersion = new BackupService(settingsPath, '1.0.0');
    currentVersion.setSelectedRestorePath(backupPath);
    const metadata = await currentVersion.verifySelected(RECOVERY_PASSWORD);
    expect(metadata).toMatchObject({ appVersion: '0.9.0', schemaMigrations: getMigrationIds() });

    const prepared = await currentVersion.prepareRestore(RECOVERY_PASSWORD);
    const restored = ApplicationDatabase.open(prepared.sqlitePath);
    try {
      expect(restored.clients.getById(client.id)).toMatchObject({
        firstName: 'Actualización',
        documentNumber: '30000001',
      });
      expect(restored.prescriptions.getById(prescription.id)).toMatchObject({
        additionOd: '1.50',
        additionOi: null,
        values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.75' }],
      });
      expect(restored.prescriptions.listRevisions(prescription.id)).toMatchObject([
        { additionOd: '1.25', additionOi: '0.00' },
      ]);
      expect(restored.opticalJobs.getById(job.id)).toMatchObject({
        product: 'Lentes de contacto',
        productColor: 'Transparente',
        supplier: 'Proveedor ficticio',
        treatments: [{ name: 'Tratamiento libre de actualización' }],
      });
      expect(restored.deliveryReceipts.getById(receipt.id)).toMatchObject({
        receiptNumber: 'RET-000001',
        status: 'CORRECTED',
        recipientFullName: 'Persona Autorizada',
        events: [{ type: 'CORRECTION_NOTE', reason: 'Aclaración ficticia preservada' }],
      });
      expect(restored.getAppliedMigrationIds()).toEqual(getMigrationIds());
      expect(restored.integrityCheck()).toBe('ok');
      expect(restored.foreignKeyViolations()).toEqual([]);
    } finally {
      restored.close();
      await prepared.cleanup();
    }

    const restartedSecurity = new SecurityManager(securityPath);
    expect(restartedSecurity.status()).toMatchObject({ configured: true, authenticated: false });
    await restartedSecurity.login(ACCESS_PASSWORD);
    expect(restartedSecurity.status().authenticated).toBe(true);
  });
});
