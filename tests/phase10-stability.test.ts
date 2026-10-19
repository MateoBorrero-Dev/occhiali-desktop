import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupService } from '../src/main/backup/backup-service';
import { RestoreCoordinator } from '../src/main/backup/restore-recovery';
import { ApplicationDatabase } from '../src/main/database';
import {
  createTestDatabase,
  destroyTestDatabase,
  FOUR_PRESCRIPTION_VALUES,
} from './database/helpers';
import type { TestDatabase } from './database/helpers';

const RECOVERY_PASSWORD = 'Recuperacion-Fase10-Ficticia';

describe('auditoría integral de estabilidad de Fase 10', () => {
  let context: TestDatabase | null = null;

  afterEach(() => {
    if (context) {
      destroyTestDatabase(context);
      context = null;
    }
  });

  it('mantiene búsquedas, historiales, backup y restauración con 1.000 clientes', async () => {
    context = createTestDatabase();
    const database = context.database;
    const measurements: Record<string, number> = {};

    database.transaction(() => {
      for (let index = 1; index <= 100; index += 1) {
        database.clients.create({
          firstName: `Persona ${index}`,
          lastName: `Escala ${String(index).padStart(4, '0')}`,
          documentNumber: String(30_000_000 + index),
          phone: `11 4000 ${String(index).padStart(4, '0')}`,
        });
      }
    });

    let startedAt = performance.now();
    expect(database.clients.search({ query: '30000100', limit: 25 }).items[0]?.id).toBe(100);
    measurements.search100Ms = performance.now() - startedAt;

    database.transaction(() => {
      for (let index = 101; index <= 1_000; index += 1) {
        database.clients.create({
          firstName: `Persona ${index}`,
          lastName: `Escala ${String(index).padStart(4, '0')}`,
          documentNumber: String(30_000_000 + index),
          phone: `11 4000 ${String(index).padStart(4, '0')}`,
        });
      }
    });

    const prescriptions = [];
    const treatmentId = database.treatments.listActive()[0]!.id;
    for (let index = 100; index <= 1_000; index += 100) {
      const prescription = database.prescriptions.createWithValues({
        clientId: index,
        prescriptionDate: '2026-10-15',
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
      prescriptions.push(prescription);
      database.opticalJobs.createWithTreatments({
        clientId: index,
        prescriptionId: prescription.id,
        jobNumber: `QA-${index}`,
        product: 'Anteojos recetados',
        treatmentIds: [treatmentId],
      });
    }
    database.prescriptions.correct(prescriptions[0]!.id, {
      reason: 'Corrección ficticia de auditoría',
      prescriptionDate: '2026-10-15',
      values: [FOUR_PRESCRIPTION_VALUES[1]!],
    });
    database.clients.archive(1_000);
    database.clients.restore(1_000);

    startedAt = performance.now();
    const clientPage = database.clients.search({ query: '30001000', limit: 25 });
    const global = database.queries.globalSearch({ query: 'QA-1000', limit: 5 });
    const dashboard = database.queries.dashboard();
    const history = database.prescriptions.listByClient(100);
    measurements.combinedQueries1000Ms = performance.now() - startedAt;

    expect(clientPage.items).toHaveLength(1);
    expect(clientPage.items[0]?.id).toBe(1_000);
    expect(global.opticalJobs[0]?.jobNumber).toBe('QA-1000');
    expect(dashboard).toEqual({
      activeClients: 1_000,
      totalPrescriptions: 10,
      totalOpticalJobs: 10,
    });
    expect(history).toHaveLength(1);
    expect(database.prescriptions.listRevisions(prescriptions[0]!.id)).toHaveLength(1);
    expect(database.foreignKeyViolations()).toHaveLength(0);
    expect(database.integrityCheck()).toBe('ok');

    const backups = new BackupService(join(context.directory, 'backup-settings.json'), '1.0.0');
    startedAt = performance.now();
    const created = await backups.create(database, RECOVERY_PASSWORD);
    backups.setSelectedRestorePath(join(context.directory, 'backups', created.fileName));
    const metadata = await backups.verifySelected(RECOVERY_PASSWORD);
    measurements.encryptedBackupMs = performance.now() - startedAt;
    expect(metadata.appVersion).toBe('1.0.0');

    database.clients.create({ firstName: 'Posterior', lastName: 'No debe persistir' });
    const prepared = await backups.prepareRestore(RECOVERY_PASSWORD);
    const coordinator = new RestoreCoordinator(context.filePath);
    coordinator.begin(prepared.sqlitePath);
    prepared.transferOwnership();
    database.close();
    coordinator.moveActiveToRollback();
    rmSync(`${context.filePath}-wal`, { force: true });
    rmSync(`${context.filePath}-shm`, { force: true });
    coordinator.placeCandidate();
    coordinator.markVerified();
    coordinator.confirmAndCleanup();

    context.database = ApplicationDatabase.open(context.filePath);
    expect(context.database.queries.dashboard()).toEqual(dashboard);
    expect(context.database.clients.search({ query: 'No debe persistir' }).total).toBe(0);
    expect(context.database.integrityCheck()).toBe('ok');

    expect(measurements.search100Ms).toBeLessThan(500);
    expect(measurements.combinedQueries1000Ms).toBeLessThan(1_000);
    expect(measurements.encryptedBackupMs).toBeLessThan(10_000);
    console.info('PHASE10_PERFORMANCE', JSON.stringify(measurements));
  });
});
