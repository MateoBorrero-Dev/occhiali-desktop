import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../../src/main/database';
import { openSqliteDatabase } from '../../src/main/database/connection';
import { applyMigrations, getAvailableMigrations } from '../../src/main/database/migrations';
import { normalizeOpticalDecimal } from '../../src/shared/prescription-validation';
import {
  createTestDatabase,
  destroyTestDatabase,
  FOUR_PRESCRIPTION_VALUES,
  TEST_CLIENT,
} from './helpers';
import type { TestDatabase } from './helpers';

describe('Fase 5: persistencia de recetas y trazabilidad', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  it('migra una base del esquema 002 sin perder recetas ni graduaciones', () => {
    context.database.close();
    const legacyPath = join(context.directory, 'legacy.sqlite3');
    const legacy = openSqliteDatabase(legacyPath);
    applyMigrations(legacy, getAvailableMigrations().slice(0, 2));
    legacy
      .prepare("INSERT INTO clients (first_name, last_name) VALUES ('Cliente', 'Anterior')")
      .run();
    legacy
      .prepare("INSERT INTO prescriptions (client_id, prescription_date) VALUES (1, '2024-01-02')")
      .run();
    legacy
      .prepare(
        "INSERT INTO prescription_values (prescription_id, distance, eye, sphere) VALUES (1, 'FAR', 'OD', 125)",
      )
      .run();
    legacy.close();

    const migrated = ApplicationDatabase.open(legacyPath);
    expect(migrated.getAppliedMigrationIds()).toContain('003_prescription_revisions');
    expect(migrated.prescriptions.getById(1)).toMatchObject({
      prescriptionDate: '2024-01-02',
      values: [{ sphere: '1.25' }],
    });
    migrated.close();
    expect(existsSync(legacyPath)).toBe(true);
  });

  it('acepta coma y punto decimal sin redondear', () => {
    expect(normalizeOpticalDecimal('+1,25', 'sphere')).toBe('1.25');
    expect(normalizeOpticalDecimal('-2.50', 'sphere')).toBe('-2.50');
  });

  it('rechaza formatos decimales ambiguos', () => {
    for (const value of ['1,2.5', '1.234', '1,', '--1', '1 25']) {
      expect(() => normalizeOpticalDecimal(value, 'sphere')).toThrow();
    }
  });

  it('guarda filas parciales y omite las filas completamente vacías', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [
        { distance: 'FAR', eye: 'OD', sphere: '1,25', axis: null },
        { distance: 'FAR', eye: 'OI', sphere: '', cylinder: '', axis: null, dip: '', height: '' },
      ],
    });
    expect(recipe.values).toHaveLength(1);
    expect(recipe.values[0]).toMatchObject({ sphere: '1.25', cylinder: null, axis: null });
  });

  it('exige al menos un dato óptico significativo', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    expect(() =>
      context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-03-01',
        values: [],
      }),
    ).toThrow('al menos un dato óptico');
  });

  it('lista y obtiene el detalle completo por ID', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const created = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      prescriberName: 'Profesional Ficticio',
      values: FOUR_PRESCRIPTION_VALUES,
    });
    expect(context.database.prescriptions.getById(created.id)).toEqual(created);
    expect(
      context.database.prescriptions.listByClientPage({
        clientId: client.id,
        limit: 10,
        offset: 0,
      }),
    ).toMatchObject({ total: 1, items: [{ id: created.id, valueCount: 4 }] });
  });

  it('busca por nombre y apellido ignorando acentos y mayúsculas', () => {
    const client = context.database.clients.create({
      ...TEST_CLIENT,
      firstName: 'José',
      lastName: 'Álvarez',
    });
    context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    expect(context.database.prescriptions.search({ query: 'JOSE ALVAREZ' }).total).toBe(1);
  });

  it('filtra un rango inclusivo de fechas', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    for (const prescriptionDate of ['2025-01-01', '2025-06-15', '2026-01-01']) {
      context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate,
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
    }
    expect(
      context.database.prescriptions
        .search({ dateFrom: '2025-02-01', dateTo: '2025-12-31' })
        .items.map((item) => item.prescriptionDate),
    ).toEqual(['2025-06-15']);
  });

  it('pagina y ordena desde la receta más reciente', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    for (const prescriptionDate of ['2025-01-01', '2025-02-01', '2025-03-01']) {
      context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate,
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      });
    }
    const page = context.database.prescriptions.search({ limit: 2, offset: 1 });
    expect(page).toMatchObject({ total: 3, limit: 2, offset: 1 });
    expect(page.items.map((item) => item.prescriptionDate)).toEqual(['2025-02-01', '2025-01-01']);
  });

  it('conserva recetas al archivar y bloquea nuevas altas', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    context.database.clients.archive(client.id);
    expect(context.database.prescriptions.getById(recipe.id)?.id).toBe(recipe.id);
    expect(() =>
      context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-04-01',
        values: [FOUR_PRESCRIPTION_VALUES[0]!],
      }),
    ).toThrow('archivado');
  });

  it('preserva receta y graduaciones al cerrar y reabrir', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: FOUR_PRESCRIPTION_VALUES,
    });
    context.database.close();
    context.database = ApplicationDatabase.open(context.filePath);
    expect(context.database.prescriptions.getById(recipe.id)?.values).toHaveLength(4);
  });

  it('corrige con el mismo ID y conserva una instantánea anterior', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      notes: 'Anterior',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    const corrected = context.database.prescriptions.correct(recipe.id, {
      prescriptionDate: '2026-03-02',
      notes: 'Actual',
      reason: 'Error de transcripción',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '+2,25' }],
    });
    const revisions = context.database.prescriptions.listRevisions(recipe.id);
    expect(corrected).toMatchObject({
      id: recipe.id,
      prescriptionDate: '2026-03-02',
      notes: 'Actual',
      values: [{ sphere: '2.25' }],
    });
    expect(revisions).toMatchObject([
      {
        revisionNumber: 1,
        reason: 'Error de transcripción',
        prescriptionDate: '2026-03-01',
        notes: 'Anterior',
        values: [{ sphere: '-1.25' }],
      },
    ]);
  });

  it('registra revisiones consecutivas y devuelve la más nueva primero', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    context.database.prescriptions.correct(recipe.id, {
      prescriptionDate: '2026-03-01',
      reason: 'Primera',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '1.00' }],
    });
    context.database.prescriptions.correct(recipe.id, {
      prescriptionDate: '2026-03-01',
      reason: 'Segunda',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '2.00' }],
    });
    expect(
      context.database.prescriptions.listRevisions(recipe.id).map((item) => item.revisionNumber),
    ).toEqual([2, 1]);
  });

  it('no crea revisiones cuando los datos no cambian', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    const unchanged = context.database.prescriptions.correct(recipe.id, {
      prescriptionDate: recipe.prescriptionDate,
      prescriberName: recipe.prescriberName,
      notes: recipe.notes,
      reason: 'Verificación',
      values: recipe.values.map((value) => ({
        distance: value.distance,
        eye: value.eye,
        sphere: value.sphere,
        cylinder: value.cylinder,
        axis: value.axis,
        dip: value.dip,
        height: value.height,
      })),
    });
    expect(unchanged.updatedAt).toBe(recipe.updatedAt);
    expect(context.database.prescriptions.listRevisions(recipe.id)).toEqual([]);
  });

  it('no modifica otras recetas al corregir una', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const first = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    const second = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-04-01',
      values: [FOUR_PRESCRIPTION_VALUES[1]!],
    });
    context.database.prescriptions.correct(first.id, {
      prescriptionDate: first.prescriptionDate,
      reason: 'Corrección',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '9.00' }],
    });
    expect(context.database.prescriptions.getById(second.id)).toEqual(second);
  });

  it('revierte encabezado, valores y revisión si falla la corrección', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    const control = openSqliteDatabase(context.filePath);
    control.exec(
      "CREATE TRIGGER fail_value_insert BEFORE INSERT ON prescription_values BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;",
    );
    control.close();
    expect(() =>
      context.database.prescriptions.correct(recipe.id, {
        prescriptionDate: '2026-03-02',
        reason: 'Corrección',
        values: [{ distance: 'FAR', eye: 'OD', sphere: '2.00' }],
      }),
    ).toThrow();
    expect(context.database.prescriptions.getById(recipe.id)).toEqual(recipe);
    expect(context.database.prescriptions.listRevisions(recipe.id)).toEqual([]);
  });

  it('maneja receta inexistente en detalle, corrección y revisiones', () => {
    expect(context.database.prescriptions.getById(999_999)).toBeNull();
    expect(() =>
      context.database.prescriptions.correct(999_999, {
        prescriptionDate: '2026-03-01',
        reason: 'Corrección',
        values: [{ distance: 'FAR', eye: 'OD', sphere: '1.00' }],
      }),
    ).toThrow('No existe');
    expect(() => context.database.prescriptions.listRevisions(999_999)).toThrow('No existe');
  });

  it('mantiene integridad referencial después de altas y correcciones', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const recipe = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: FOUR_PRESCRIPTION_VALUES,
    });
    context.database.prescriptions.correct(recipe.id, {
      prescriptionDate: '2026-03-02',
      reason: 'Corrección',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });
    expect(context.database.foreignKeyViolations()).toEqual([]);
    expect(context.database.integrityCheck()).toBe('ok');
  });
});
