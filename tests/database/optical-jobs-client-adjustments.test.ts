import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../../src/main/database';
import { openSqliteDatabase } from '../../src/main/database/connection';
import { applyMigrations, getAvailableMigrations } from '../../src/main/database/migrations';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './helpers';
import type { TestDatabase } from './helpers';

describe('Ajustes de la clienta: fichas, tratamientos y productos', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  it('migra el esquema anterior sin perder fichas ni tratamientos históricos', () => {
    const legacyPath = join(context.directory, 'legacy-block-1.sqlite3');
    const legacy = openSqliteDatabase(legacyPath);
    applyMigrations(legacy, getAvailableMigrations().slice(0, 3));
    legacy
      .prepare("INSERT INTO clients (first_name, last_name) VALUES ('Cliente', 'Histórico')")
      .run();
    legacy
      .prepare(
        "INSERT INTO optical_jobs (client_id, job_number, product) VALUES (1, 'H-001', 'Anteojos históricos')",
      )
      .run();
    legacy
      .prepare(
        "INSERT INTO optical_job_treatments (optical_job_id, treatment_id) VALUES (1, 'edge-polish')",
      )
      .run();
    legacy.close();

    const migrated = ApplicationDatabase.open(legacyPath);
    try {
      expect(migrated.getAppliedMigrationIds()).toContain('004_optical_job_product_details');
      expect(migrated.opticalJobs.getById(1)).toMatchObject({
        jobNumber: 'H-001',
        product: 'Anteojos históricos',
        productColor: null,
        supplier: null,
        treatments: [{ id: 'edge-polish', name: 'Pulido de bordes' }],
      });
      expect(migrated.integrityCheck()).toBe('ok');
      expect(migrated.foreignKeyViolations()).toEqual([]);
    } finally {
      migrated.close();
    }
  });

  it('guarda varios tratamientos libres y reutiliza el catálogo histórico', () => {
    const owner = context.database.clients.create(TEST_CLIENT);
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      treatmentIds: ['anti-scratch-stark'],
      treatmentNames: ['Filtro azul personalizado', 'Acabado mate especial'],
    });

    expect(job.treatments.map((item) => item.name).sort()).toEqual([
      'Acabado mate especial',
      'Antirrayas Stark',
      'Filtro azul personalizado',
    ]);
    expect(context.database.treatments.list()).toHaveLength(7);
    expect(context.database.foreignKeyViolations()).toEqual([]);
  });

  it('rechaza tratamientos libres repetidos sin dejar escrituras parciales', () => {
    const owner = context.database.clients.create(TEST_CLIENT);
    expect(() =>
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        treatmentNames: ['Filtro azul', 'filtro azul'],
      }),
    ).toThrow('repetir');
    expect(context.database.opticalJobs.listByClient(owner.id)).toEqual([]);
    expect(context.database.treatments.list()).toHaveLength(5);
  });

  it('guarda lentes de contacto, color y proveedor y permite editarlos', () => {
    const owner = context.database.clients.create(TEST_CLIENT);
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      product: 'Lentes de contacto',
      productColor: 'Transparente',
      supplier: 'Proveedor ficticio inicial',
      colorType: 'FULL',
      treatmentNames: ['Filtro UV libre'],
    });
    const updated = context.database.opticalJobs.update(created.id, {
      product: 'Lentes de contacto',
      productColor: 'Marrón',
      supplier: 'Proveedor ficticio actualizado',
      colorType: 'GRADIENT',
      treatmentNames: ['Filtro UV libre', 'Acabado hidrofóbico'],
    });

    expect(updated).toMatchObject({
      id: created.id,
      product: 'Lentes de contacto',
      productColor: 'Marrón',
      supplier: 'Proveedor ficticio actualizado',
      colorType: 'GRADIENT',
    });
    expect(updated.treatments.map((item) => item.name).sort()).toEqual([
      'Acabado hidrofóbico',
      'Filtro UV libre',
    ]);
  });

  it('conserva campos y tratamientos libres después de reabrir SQLite', () => {
    const owner = context.database.clients.create(TEST_CLIENT);
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      productColor: 'Carey',
      supplier: 'Proveedor persistente',
      treatmentNames: ['Tratamiento persistente'],
    });

    context.database.close();
    context.database = ApplicationDatabase.open(context.filePath);
    expect(context.database.opticalJobs.getById(created.id)).toMatchObject({
      productColor: 'Carey',
      supplier: 'Proveedor persistente',
      treatments: [{ name: 'Tratamiento persistente' }],
    });
  });
});
