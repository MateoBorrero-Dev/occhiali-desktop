import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../../src/main/database';
import { openSqliteDatabase } from '../../src/main/database/connection';
import { applyMigrations, getAvailableMigrations } from '../../src/main/database/migrations';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './helpers';
import type { TestDatabase } from './helpers';

describe('Occhiali 1.2: cristal y marca independientes', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  it('guarda, consulta y modifica cristal y marca sin reutilizar otros campos', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      jobNumber: 'COM-001',
      product: 'Anteojos recetados',
      lens: 'Orgánico 1.60',
      brand: 'Marca ficticia',
      frameModel: 'Modelo existente',
      productColor: 'Azul',
      supplier: 'Proveedor existente',
      treatmentIds: ['edge-polish'],
    });

    expect(created).toMatchObject({
      lens: 'Orgánico 1.60',
      brand: 'Marca ficticia',
      product: 'Anteojos recetados',
      frameModel: 'Modelo existente',
      productColor: 'Azul',
      supplier: 'Proveedor existente',
    });

    const updated = context.database.opticalJobs.update(created.id, {
      jobNumber: created.jobNumber,
      product: created.product,
      lens: 'Mineral 1.70',
      brand: 'Nueva marca ficticia',
      frameModel: created.frameModel,
      productColor: created.productColor,
      supplier: created.supplier,
      treatmentIds: created.treatments.map((treatment) => treatment.id),
    });

    expect(updated).toMatchObject({
      id: created.id,
      jobNumber: 'COM-001',
      product: 'Anteojos recetados',
      lens: 'Mineral 1.70',
      brand: 'Nueva marca ficticia',
      frameModel: 'Modelo existente',
      productColor: 'Azul',
      supplier: 'Proveedor existente',
    });

    context.database.close();
    context.database = ApplicationDatabase.open(context.filePath);
    expect(context.database.opticalJobs.getById(created.id)).toMatchObject({
      lens: 'Mineral 1.70',
      brand: 'Nueva marca ficticia',
      treatments: [{ id: 'edge-polish' }],
    });
  });

  it('normaliza valores vacíos como nulos y aplica límites independientes', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      lens: '   ',
      brand: null,
    });

    expect(created).toMatchObject({ lens: null, brand: null });
    expect(() =>
      context.database.opticalJobs.update(created.id, { lens: 'x'.repeat(201) }),
    ).toThrow('El cristal no puede superar los 200 caracteres.');
    expect(() =>
      context.database.opticalJobs.update(created.id, { brand: 'x'.repeat(201) }),
    ).toThrow('La marca no puede superar los 200 caracteres.');
  });

  it('conserva cristal y marca en el snapshot aunque la ficha cambie después', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      product: 'Anteojos',
      lens: 'Cristal original',
      brand: 'Marca original',
    });
    const receipt = context.database.deliveryReceipts.create({
      opticalJobId: job.id,
      deliveredAt: '2026-10-26T15:00:00.000Z',
      recipientType: 'OWNER',
      recipientFullName: 'Cliente Prueba',
      deliveredBy: 'Responsable ficticia',
      deliveryConfirmed: true,
    });

    context.database.opticalJobs.update(job.id, {
      product: job.product,
      lens: 'Cristal modificado',
      brand: 'Marca modificada',
    });

    expect(context.database.deliveryReceipts.getById(receipt.id)).toMatchObject({
      product: 'Anteojos',
      lens: 'Cristal original',
      brand: 'Marca original',
    });
  });
});

describe('migración incremental 007', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function legacyDatabasePath(): string {
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-migration-007-'));
    directories.push(directory);
    return join(directory, 'legacy.sqlite3');
  }

  it('actualiza una base 1.1 sin alterar fichas ni comprobantes históricos', () => {
    const filePath = legacyDatabasePath();
    const legacy = openSqliteDatabase(filePath);
    applyMigrations(legacy, getAvailableMigrations().slice(0, 6));
    legacy
      .prepare(
        `INSERT INTO clients (first_name, last_name, document_number)
         VALUES ('Histórica', 'Uno Uno', '30000111')`,
      )
      .run();
    legacy
      .prepare(
        `INSERT INTO optical_jobs (
           client_id, job_number, product, frame_model, product_color, supplier
         ) VALUES (1, 'LEG-001', 'Producto histórico', 'Modelo histórico', 'Negro', 'Proveedor histórico')`,
      )
      .run();
    legacy
      .prepare(
        `INSERT INTO delivery_receipts (
           receipt_number, optical_job_id, delivered_at, client_first_name, client_last_name,
           client_document_number, job_number, product, frame_model, product_color, supplier,
           recipient_type, recipient_full_name, delivered_by, delivery_confirmed
         ) VALUES (
           'RET-000001', 1, '2026-10-20T12:00:00.000Z', 'Histórica', 'Uno Uno',
           '30000111', 'LEG-001', 'Producto histórico', 'Modelo histórico', 'Negro',
           'Proveedor histórico', 'OWNER', 'Histórica Uno Uno', 'Responsable QA', 1
         )`,
      )
      .run();
    legacy.close();

    const migrated = ApplicationDatabase.open(filePath);
    try {
      expect(migrated.getAppliedMigrationIds()).toContain('007_optical_job_commercial_details');
      expect(migrated.opticalJobs.getById(1)).toMatchObject({
        jobNumber: 'LEG-001',
        product: 'Producto histórico',
        lens: null,
        brand: null,
        frameModel: 'Modelo histórico',
        productColor: 'Negro',
        supplier: 'Proveedor histórico',
      });
      expect(migrated.deliveryReceipts.getById(1)).toMatchObject({
        receiptNumber: 'RET-000001',
        product: 'Producto histórico',
        lens: null,
        brand: null,
        frameModel: 'Modelo histórico',
      });
      expect(migrated.integrityCheck()).toBe('ok');
      expect(migrated.foreignKeyViolations()).toEqual([]);
    } finally {
      migrated.close();
    }
  });

  it('revierte todas sus columnas si falla después del primer ALTER TABLE', () => {
    const filePath = legacyDatabasePath();
    const legacy = openSqliteDatabase(filePath);
    applyMigrations(legacy, getAvailableMigrations().slice(0, 6));
    legacy.exec('ALTER TABLE optical_jobs ADD COLUMN brand TEXT;');

    expect(() => applyMigrations(legacy)).toThrow();

    const jobColumns = legacy.pragma('table_info(optical_jobs)') as Array<{ name: string }>;
    const receiptColumns = legacy.pragma('table_info(delivery_receipts)') as Array<{
      name: string;
    }>;
    const applied = legacy.prepare('SELECT id FROM schema_migrations').all() as Array<{
      id: string;
    }>;
    expect(jobColumns.map((column) => column.name)).toContain('brand');
    expect(jobColumns.map((column) => column.name)).not.toContain('lens');
    expect(receiptColumns.map((column) => column.name)).not.toContain('lens');
    expect(receiptColumns.map((column) => column.name)).not.toContain('brand');
    expect(applied.map((migration) => migration.id)).not.toContain(
      '007_optical_job_commercial_details',
    );
    legacy.close();
  });
});
