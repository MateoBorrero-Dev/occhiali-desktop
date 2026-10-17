import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../../src/main/database';
import { openSqliteDatabase } from '../../src/main/database/connection';
import { applyMigrations, getAvailableMigrations } from '../../src/main/database/migrations';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './helpers';
import type { TestDatabase } from './helpers';

describe('Bloque 2: adición independiente por ojo', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  it('migra el esquema 004 sin alterar recetas ni revisiones históricas', () => {
    const legacyPath = join(context.directory, 'legacy-004.sqlite3');
    const legacy = openSqliteDatabase(legacyPath);
    applyMigrations(legacy, getAvailableMigrations().slice(0, 4));
    legacy
      .prepare("INSERT INTO clients (first_name, last_name) VALUES ('Histórica', 'Ficticia')")
      .run();
    legacy
      .prepare("INSERT INTO prescriptions (client_id, prescription_date) VALUES (1, '2026-01-02')")
      .run();
    legacy
      .prepare(
        `INSERT INTO prescription_values (prescription_id, distance, eye, sphere)
         VALUES (1, 'FAR', 'OD', -125)`,
      )
      .run();
    legacy
      .prepare(
        `INSERT INTO prescription_revisions (
          prescription_id, revision_number, reason, prescription_date
        ) VALUES (1, 1, 'Histórica', '2026-01-01')`,
      )
      .run();
    legacy.close();

    const migrated = ApplicationDatabase.open(legacyPath);
    try {
      expect(migrated.getAppliedMigrationIds()).toContain('005_prescription_additions');
      expect(migrated.prescriptions.getById(1)).toMatchObject({
        additionOd: null,
        additionOi: null,
        values: [{ eye: 'OD', sphere: '-1.25' }],
      });
      expect(migrated.prescriptions.listRevisions(1)[0]).toMatchObject({
        reason: 'Histórica',
        additionOd: null,
        additionOi: null,
      });
      expect(migrated.integrityCheck()).toBe('ok');
    } finally {
      migrated.close();
    }
  });

  it('distingue vacío de cero y admite adición en uno o ambos ojos', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const empty = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-02-01',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.00' }],
    });
    const onlyOd = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-02-02',
      additionOd: '+1,25',
      values: [],
    });
    const onlyOiZero = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-02-03',
      additionOi: '0,00',
      values: [],
    });
    const different = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-02-04',
      additionOd: '1.50',
      additionOi: '2,25',
      values: [],
    });

    expect(empty).toMatchObject({ additionOd: null, additionOi: null });
    expect(onlyOd).toMatchObject({ additionOd: '1.25', additionOi: null, values: [] });
    expect(onlyOiZero).toMatchObject({ additionOd: null, additionOi: '0.00', values: [] });
    expect(different).toMatchObject({ additionOd: '1.50', additionOi: '2.25' });
  });

  it('persiste ambas adiciones al cerrar y reabrir SQLite', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const prescription = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      additionOd: '1.25',
      additionOi: '2.00',
      values: [],
    });
    context.database.close();
    context.database = ApplicationDatabase.open(context.filePath);
    expect(context.database.prescriptions.getById(prescription.id)).toMatchObject({
      additionOd: '1.25',
      additionOi: '2.00',
    });
  });

  it('conserva las adiciones anteriores en la revisión y no intercambia los ojos', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const prescription = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-04-01',
      additionOd: '1.00',
      additionOi: '2.00',
      values: [{ distance: 'NEAR', eye: 'OI', sphere: '3.00' }],
    });
    const corrected = context.database.prescriptions.correct(prescription.id, {
      prescriptionDate: prescription.prescriptionDate,
      additionOd: '1.50',
      additionOi: null,
      reason: 'Ajuste de carga',
      values: [{ distance: 'NEAR', eye: 'OI', sphere: '3.00' }],
    });

    expect(corrected).toMatchObject({
      id: prescription.id,
      additionOd: '1.50',
      additionOi: null,
    });
    expect(context.database.prescriptions.listRevisions(prescription.id)[0]).toMatchObject({
      additionOd: '1.00',
      additionOi: '2.00',
      values: [{ distance: 'NEAR', eye: 'OI', sphere: '3.00' }],
    });
  });

  it('rechaza precisión inválida sin escribir datos parciales', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    expect(() =>
      context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-05-01',
        additionOd: '1,234',
        values: [],
      }),
    ).toThrow('hasta dos decimales');
    expect(context.database.prescriptions.listByClient(client.id)).toEqual([]);
  });
});
