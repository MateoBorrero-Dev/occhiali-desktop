import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../../src/main/database';
import { openSqliteDatabase } from '../../src/main/database/connection';
import { applyMigrations, getMigrationIds } from '../../src/main/database/migrations';
import type { Migration } from '../../src/main/database/migrations';
import {
  createTestDatabase,
  destroyTestDatabase,
  FOUR_PRESCRIPTION_VALUES,
  TEST_CLIENT,
} from './helpers';
import type { TestDatabase } from './helpers';

describe('persistencia SQLite', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  describe('inicialización y migraciones', () => {
    it('crea una base inexistente', () => {
      expect(existsSync(context.filePath)).toBe(true);
      expect(context.database.integrityCheck()).toBe('ok');
    });

    it('aplica las migraciones iniciales en orden', () => {
      expect(context.database.getAppliedMigrationIds()).toEqual(getMigrationIds());
    });

    it('no repite migraciones en una segunda ejecución', () => {
      context.database.reapplyMigrations();
      expect(context.database.getAppliedMigrationIds()).toEqual(getMigrationIds());
    });

    it('revierte por completo una migración fallida', () => {
      const failingPath = join(context.directory, 'failing.sqlite3');
      const rawDatabase = openSqliteDatabase(failingPath);
      const failingMigration: Migration = {
        id: '999_failing_test',
        up: (database) => {
          database.exec('CREATE TABLE must_rollback (id INTEGER PRIMARY KEY) STRICT;');
          database.exec('ESTA SENTENCIA NO ES SQL');
        },
      };

      expect(() => applyMigrations(rawDatabase, [failingMigration])).toThrow();
      const table = rawDatabase
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'must_rollback'")
        .get();
      expect(table).toBeUndefined();
      rawDatabase.close();
    });

    it('inicializa el catálogo de tratamientos una sola vez', () => {
      expect(context.database.treatments.list()).toHaveLength(5);
      context.database.reapplyMigrations();
      expect(context.database.treatments.list()).toHaveLength(5);
    });

    it('no reemplaza silenciosamente una base corrupta', () => {
      const corruptPath = join(context.directory, 'corrupt.sqlite3');
      const originalBytes = Buffer.from('contenido que no es sqlite');
      writeFileSync(corruptPath, originalBytes);

      expect(() => ApplicationDatabase.open(corruptPath)).toThrow();
      expect(readFileSync(corruptPath)).toEqual(originalBytes);
    });
  });

  describe('clientes', () => {
    it('crea y obtiene un cliente por ID', () => {
      const created = context.database.clients.create(TEST_CLIENT);
      expect(context.database.clients.getById(created.id)).toEqual(created);
    });

    it('actualiza un cliente sin perder sus demás datos', () => {
      const created = context.database.clients.create(TEST_CLIENT);
      const updated = context.database.clients.update(created.id, { phone: '011 4444 9999' });
      expect(updated.phone).toBe('011 4444 9999');
      expect(updated.firstName).toBe(TEST_CLIENT.firstName);
      expect(updated.updatedAt >= created.updatedAt).toBe(true);
    });

    it('lista clientes por apellido y nombre', () => {
      context.database.clients.create({ ...TEST_CLIENT, firstName: 'Zeta', lastName: 'Beta' });
      context.database.clients.create({ ...TEST_CLIENT, firstName: 'Alfa', lastName: 'Alfa' });
      expect(context.database.clients.list().map((client) => client.firstName)).toEqual([
        'Alfa',
        'Zeta',
      ]);
    });

    it('rechaza DNI informado duplicado', () => {
      context.database.clients.create({ ...TEST_CLIENT, documentNumber: '12345678' });
      expect(() =>
        context.database.clients.create({ ...TEST_CLIENT, documentNumber: '12345678' }),
      ).toThrow();
    });

    it('permite múltiples clientes con DNI NULL', () => {
      context.database.clients.create({ ...TEST_CLIENT, documentNumber: null });
      context.database.clients.create({ ...TEST_CLIENT, documentNumber: null });
      expect(context.database.clients.list()).toHaveLength(2);
    });

    it('permite homónimos cuando no comparten DNI informado', () => {
      context.database.clients.create({ ...TEST_CLIENT, documentNumber: '10000001' });
      context.database.clients.create({ ...TEST_CLIENT, documentNumber: '10000002' });
      expect(context.database.clients.list()).toHaveLength(2);
    });

    it('excluye clientes archivados de la lista normal', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      context.database.clients.update(client.id, { isArchived: true });
      expect(context.database.clients.list()).toHaveLength(0);
      expect(context.database.clients.list({ includeArchived: true })).toHaveLength(1);
    });

    it('rechaza nombres obligatorios vacíos', () => {
      expect(() => context.database.clients.create({ ...TEST_CLIENT, firstName: '  ' })).toThrow();
    });

    it('rechaza apellidos obligatorios vacíos', () => {
      expect(() => context.database.clients.create({ ...TEST_CLIENT, lastName: '  ' })).toThrow();
    });

    it('normaliza nombres, espacios y DNI antes de guardar', () => {
      const client = context.database.clients.create({
        ...TEST_CLIENT,
        firstName: '  Ana   María  ',
        lastName: '  López ',
        documentNumber: '12.345.678',
        address: '   ',
      });
      expect(client).toMatchObject({
        firstName: 'Ana María',
        lastName: 'López',
        documentNumber: '12345678',
        address: null,
      });
    });

    it('rechaza caracteres inválidos en el DNI', () => {
      expect(() =>
        context.database.clients.create({ ...TEST_CLIENT, documentNumber: '12A345' }),
      ).toThrow('DNI');
    });

    it('rechaza fechas de nacimiento inválidas', () => {
      expect(() =>
        context.database.clients.create({ ...TEST_CLIENT, birthDate: '2026-02-30' }),
      ).toThrow('fecha');
    });

    it('busca parcialmente por nombre ignorando mayúsculas y acentos', () => {
      context.database.clients.create({ ...TEST_CLIENT, firstName: 'José', lastName: 'Álvarez' });
      expect(context.database.clients.search({ query: 'jose' }).items[0]?.firstName).toBe('José');
      expect(context.database.clients.search({ query: 'ALVAREZ' }).items[0]?.lastName).toBe(
        'Álvarez',
      );
    });

    it('busca por nombre completo', () => {
      context.database.clients.create({ ...TEST_CLIENT, firstName: 'Clara', lastName: 'Benítez' });
      expect(context.database.clients.search({ query: 'Clara Benitez' }).total).toBe(1);
    });

    it('busca por DNI y teléfono', () => {
      context.database.clients.create({
        ...TEST_CLIENT,
        documentNumber: '30111222',
        phone: '011 4567-8901',
      });
      expect(context.database.clients.search({ query: '111222' }).total).toBe(1);
      expect(context.database.clients.search({ query: '4567-89' }).total).toBe(1);
    });

    it('devuelve una página vacía cuando no hay resultados', () => {
      context.database.clients.create(TEST_CLIENT);
      expect(context.database.clients.search({ query: 'inexistente' })).toMatchObject({
        items: [],
        total: 0,
      });
    });

    it('pagina sin cargar indiscriminadamente todos los registros', () => {
      for (let index = 0; index < 5; index += 1) {
        context.database.clients.create({
          ...TEST_CLIENT,
          firstName: `Cliente ${index}`,
          documentNumber: null,
        });
      }
      const page = context.database.clients.search({ limit: 2, offset: 2 });
      expect(page.items).toHaveLength(2);
      expect(page).toMatchObject({ total: 5, limit: 2, offset: 2 });
    });

    it('filtra activos, archivados y todos', () => {
      const archived = context.database.clients.create({ ...TEST_CLIENT, firstName: 'Archivado' });
      context.database.clients.create({ ...TEST_CLIENT, firstName: 'Activo' });
      context.database.clients.archive(archived.id);
      expect(context.database.clients.search({ status: 'active' }).total).toBe(1);
      expect(context.database.clients.search({ status: 'archived' }).total).toBe(1);
      expect(context.database.clients.search({ status: 'all' }).total).toBe(2);
    });

    it('reactiva un cliente archivado', () => {
      const created = context.database.clients.create(TEST_CLIENT);
      context.database.clients.archive(created.id);
      const restored = context.database.clients.restore(created.id);
      expect(restored).toMatchObject({ id: created.id, isArchived: false });
      expect(context.database.clients.list()).toHaveLength(1);
    });

    it('conserva el mismo ID al editar y evita escrituras sin cambios', () => {
      const created = context.database.clients.create(TEST_CLIENT);
      const unchanged = context.database.clients.update(created.id, {
        firstName: created.firstName,
      });
      const updated = context.database.clients.update(created.id, { phone: '11 9999 9999' });
      expect(unchanged.updatedAt).toBe(created.updatedAt);
      expect(updated.id).toBe(created.id);
    });

    it('preserva recetas y trabajos relacionados al archivar', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2025-01-01',
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
      context.database.opticalJobs.createWithTreatments({
        clientId: client.id,
        prescriptionId: prescription.id,
      });
      context.database.clients.archive(client.id);
      expect(context.database.prescriptions.listByClient(client.id)).toHaveLength(1);
      expect(context.database.opticalJobs.listByClient(client.id)).toHaveLength(1);
    });
  });

  describe('recetas y valores ópticos', () => {
    it('conserva dos recetas del mismo cliente', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2025-01-10',
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
      context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-02-15',
        values: [FOUR_PRESCRIPTION_VALUES[1]!],
      });
      expect(
        context.database.prescriptions.listByClient(client.id).map((item) => item.prescriptionDate),
      ).toEqual(['2026-02-15', '2025-01-10']);
    });

    it('registra FAR+OD, FAR+OI, NEAR+OD y NEAR+OI', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-01-01',
        values: FOUR_PRESCRIPTION_VALUES,
      });
      expect(prescription.values.map((value) => `${value.distance}:${value.eye}`)).toEqual([
        'FAR:OD',
        'FAR:OI',
        'NEAR:OD',
        'NEAR:OI',
      ]);
    });

    it('rechaza una combinación distancia-ojo duplicada y revierte la receta', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      expect(() =>
        context.database.prescriptions.createWithValues({
          clientId: client.id,
          prescriptionDate: '2026-01-01',
          values: [FOUR_PRESCRIPTION_VALUES[0]!, FOUR_PRESCRIPTION_VALUES[0]!],
        }),
      ).toThrow();
      expect(context.database.prescriptions.listByClient(client.id)).toHaveLength(0);
    });

    it('preserva valores negativos sin pérdida decimal', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-01-01',
        values: [{ distance: 'FAR', eye: 'OD', sphere: '-10.25', cylinder: '-2.50' }],
      });
      expect(prescription.values[0]?.sphere).toBe('-10.25');
      expect(prescription.values[0]?.cylinder).toBe('-2.50');
    });

    it('preserva valores positivos sin pérdida decimal', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-01-01',
        values: [{ distance: 'FAR', eye: 'OD', sphere: '12.75' }],
      });
      expect(prescription.values[0]?.sphere).toBe('12.75');
    });

    it('diferencia cero de NULL', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-01-01',
        values: [
          { distance: 'FAR', eye: 'OD', sphere: '0.00', cylinder: null },
          { distance: 'FAR', eye: 'OI', sphere: null, cylinder: '0.00' },
        ],
      });
      expect(prescription.values[0]).toMatchObject({ sphere: '0.00', cylinder: null });
      expect(prescription.values[1]).toMatchObject({ sphere: null, cylinder: '0.00' });
    });

    it('rechaza un eje fuera de 0 a 180', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      expect(() =>
        context.database.prescriptions.createWithValues({
          clientId: client.id,
          prescriptionDate: '2026-01-01',
          values: [{ distance: 'FAR', eye: 'OD', axis: 181 }],
        }),
      ).toThrow();
    });

    it('rechaza valores con más de dos decimales', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      expect(() =>
        context.database.prescriptions.createWithValues({
          clientId: client.id,
          prescriptionDate: '2026-01-01',
          values: [{ distance: 'FAR', eye: 'OD', sphere: '1.234' }],
        }),
      ).toThrow();
    });

    it('rechaza fechas calendario inválidas', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      expect(() =>
        context.database.prescriptions.createWithValues({
          clientId: client.id,
          prescriptionDate: '2026-02-30',
          values: [FOUR_PRESCRIPTION_VALUES[0]!],
        }),
      ).toThrow();
    });

    it('rechaza recetas de clientes inexistentes', () => {
      expect(() =>
        context.database.prescriptions.createWithValues({
          clientId: 999_999,
          prescriptionDate: '2026-01-01',
          values: [FOUR_PRESCRIPTION_VALUES[0]!],
        }),
      ).toThrow();
    });

    it('persiste la fecha de prescripción independiente de la fecha de alta', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2020-03-04',
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
      expect(prescription.prescriptionDate).toBe('2020-03-04');
      expect(prescription.createdAt.startsWith('2020-03-04')).toBe(false);
    });
  });

  describe('trabajos y tratamientos', () => {
    it('crea un trabajo asociado a una receta válida', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-01-01',
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
      const job = context.database.opticalJobs.createWithTreatments({
        clientId: client.id,
        prescriptionId: prescription.id,
        jobNumber: 'F-001-A',
        frameCondition: 'NEW',
        frameMaterial: 'METAL',
      });
      expect(job.prescriptionId).toBe(prescription.id);
      expect(context.database.opticalJobs.getById(job.id)).toEqual(job);
    });

    it('permite un trabajo sin receta asociada', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const job = context.database.opticalJobs.createWithTreatments({ clientId: client.id });
      expect(job.prescriptionId).toBeNull();
    });

    it('rechaza una receta perteneciente a otro cliente', () => {
      const first = context.database.clients.create(TEST_CLIENT);
      const second = context.database.clients.create({ ...TEST_CLIENT, firstName: 'Otra' });
      const prescription = context.database.prescriptions.createWithValues({
        clientId: first.id,
        prescriptionDate: '2026-01-01',
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
      expect(() =>
        context.database.opticalJobs.createWithTreatments({
          clientId: second.id,
          prescriptionId: prescription.id,
        }),
      ).toThrow('pertenece a otro cliente');
    });

    it('registra múltiples tratamientos en un trabajo', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const job = context.database.opticalJobs.createWithTreatments({
        clientId: client.id,
        treatmentIds: ['anti-scratch-stark', 'ar-asa-pro'],
      });
      expect(job.treatments.map((treatment) => treatment.id).sort()).toEqual([
        'anti-scratch-stark',
        'ar-asa-pro',
      ]);
    });

    it('rechaza tratamientos inexistentes y revierte el trabajo', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      expect(() =>
        context.database.opticalJobs.createWithTreatments({
          clientId: client.id,
          treatmentIds: ['tratamiento-inexistente'],
        }),
      ).toThrow();
      expect(context.database.opticalJobs.listByClient(client.id)).toHaveLength(0);
    });

    it('rechaza asociaciones de tratamiento duplicadas', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const job = context.database.opticalJobs.createWithTreatments({ clientId: client.id });
      context.database.treatments.addToJob(job.id, 'ar-asa-plus');
      expect(() => context.database.treatments.addToJob(job.id, 'ar-asa-plus')).toThrow();
    });

    it('revierte un trabajo si su lista repite un tratamiento', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      expect(() =>
        context.database.opticalJobs.createWithTreatments({
          clientId: client.id,
          treatmentIds: ['edge-polish', 'edge-polish'],
        }),
      ).toThrow();
      expect(context.database.opticalJobs.listByClient(client.id)).toHaveLength(0);
    });

    it('evita números de ficha informados duplicados', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      context.database.opticalJobs.createWithTreatments({ clientId: client.id, jobNumber: 'A-01' });
      expect(() =>
        context.database.opticalJobs.createWithTreatments({
          clientId: client.id,
          jobNumber: 'A-01',
        }),
      ).toThrow();
    });

    it('permite múltiples trabajos sin número de ficha', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      context.database.opticalJobs.createWithTreatments({ clientId: client.id, jobNumber: null });
      context.database.opticalJobs.createWithTreatments({ clientId: client.id, jobNumber: null });
      expect(context.database.opticalJobs.listByClient(client.id)).toHaveLength(2);
    });
  });

  describe('transacciones, integridad y persistencia', () => {
    it('mantiene activas las claves foráneas y sin violaciones', () => {
      expect(context.database.foreignKeyViolations()).toEqual([]);
    });

    it('revierte todas las operaciones de una transacción fallida', () => {
      expect(() =>
        context.database.transaction(() => {
          context.database.clients.create({ ...TEST_CLIENT, documentNumber: '87654321' });
          context.database.clients.create({ ...TEST_CLIENT, documentNumber: '87654321' });
        }),
      ).toThrow();
      expect(context.database.clients.list()).toHaveLength(0);
    });

    it('conserva datos después de cerrar y reabrir la conexión', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      context.database.close();
      context.database = ApplicationDatabase.open(context.filePath);
      expect(context.database.clients.getById(client.id)?.firstName).toBe(TEST_CLIENT.firstName);
      expect(context.database.getAppliedMigrationIds()).toEqual(getMigrationIds());
    });

    it('conserva recetas y trabajos al reabrir', () => {
      const client = context.database.clients.create(TEST_CLIENT);
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-01-01',
        values: FOUR_PRESCRIPTION_VALUES,
      });
      context.database.opticalJobs.createWithTreatments({
        clientId: client.id,
        prescriptionId: prescription.id,
        treatmentIds: ['shape-change'],
      });
      context.database.close();
      context.database = ApplicationDatabase.open(context.filePath);
      expect(context.database.prescriptions.listByClient(client.id)).toHaveLength(1);
      expect(context.database.opticalJobs.listByClient(client.id)[0]?.treatments[0]?.id).toBe(
        'shape-change',
      );
    });
  });
});
