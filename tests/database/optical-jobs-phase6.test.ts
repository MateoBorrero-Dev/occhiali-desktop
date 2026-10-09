import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../../src/main/database';
import { openSqliteDatabase } from '../../src/main/database/connection';
import {
  createTestDatabase,
  destroyTestDatabase,
  FOUR_PRESCRIPTION_VALUES,
  TEST_CLIENT,
} from './helpers';
import type { TestDatabase } from './helpers';

describe('Fase 6: persistencia de fichas de trabajo', () => {
  let context: TestDatabase;
  beforeEach(() => {
    context = createTestDatabase();
  });
  afterEach(() => {
    destroyTestDatabase(context);
  });

  const client = (firstName = 'Cliente') =>
    context.database.clients.create({ ...TEST_CLIENT, firstName });
  const prescription = (clientId: number) =>
    context.database.prescriptions.createWithValues({
      clientId,
      prescriptionDate: '2026-04-01',
      values: [FOUR_PRESCRIPTION_VALUES[0]!],
    });

  it('crea una ficha válida mínima sin receta ni tratamientos', () => {
    const owner = client();
    const job = context.database.opticalJobs.createWithTreatments({ clientId: owner.id });
    expect(job).toMatchObject({ clientId: owner.id, prescriptionId: null, treatments: [] });
  });

  it('crea anteojos recetados con una receta válida del mismo cliente', () => {
    const owner = client();
    const recipe = prescription(owner.id);
    expect(
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        prescriptionId: recipe.id,
        product: 'Anteojos recetados',
      }),
    ).toMatchObject({ prescriptionId: recipe.id, product: 'Anteojos recetados' });
  });

  it('crea lentes de sol sin inventar una receta', () => {
    const owner = client();
    expect(
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        product: 'Lentes de sol',
      }),
    ).toMatchObject({ product: 'Lentes de sol', prescriptionId: null });
  });

  it('rechaza receta inexistente y receta perteneciente a otra persona', () => {
    const first = client('Primero');
    const second = client('Segundo');
    const recipe = prescription(first.id);
    expect(() =>
      context.database.opticalJobs.createWithTreatments({
        clientId: second.id,
        prescriptionId: recipe.id,
      }),
    ).toThrow('pertenece a otro cliente');
    expect(() =>
      context.database.opticalJobs.createWithTreatments({
        clientId: first.id,
        prescriptionId: 999_999,
      }),
    ).toThrow('No existe la receta');
  });

  it('rechaza cliente inexistente o archivado para nuevas fichas', () => {
    expect(() => context.database.opticalJobs.createWithTreatments({ clientId: 999_999 })).toThrow(
      'No existe el cliente',
    );
    const archived = client();
    context.database.clients.archive(archived.id);
    expect(() =>
      context.database.opticalJobs.createWithTreatments({ clientId: archived.id }),
    ).toThrow('archivado');
  });

  it('conserva ceros iniciales, letras y normaliza espacios externos del número', () => {
    const owner = client();
    expect(
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        jobNumber: '  000152-A  ',
      }).jobNumber,
    ).toBe('000152-A');
  });

  it('rechaza un número de ficha duplicado y permite múltiples números nulos', () => {
    const owner = client();
    context.database.opticalJobs.createWithTreatments({ clientId: owner.id, jobNumber: 'A-01' });
    expect(() =>
      context.database.opticalJobs.createWithTreatments({ clientId: owner.id, jobNumber: 'A-01' }),
    ).toThrow('Ya existe');
    context.database.opticalJobs.createWithTreatments({ clientId: owner.id, jobNumber: null });
    context.database.opticalJobs.createWithTreatments({ clientId: owner.id, jobNumber: null });
    expect(context.database.opticalJobs.listByClient(owner.id)).toHaveLength(3);
  });

  it('guarda armazón nuevo, zilo, modelo, color pleno y observaciones', () => {
    const owner = client();
    expect(
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        frameCondition: 'NEW',
        frameMaterial: 'ZILO',
        frameModel: 'Modelo ficticio',
        colorType: 'FULL',
        observations: 'Observación ficticia.',
      }),
    ).toMatchObject({
      frameCondition: 'NEW',
      frameMaterial: 'ZILO',
      frameModel: 'Modelo ficticio',
      colorType: 'FULL',
      observations: 'Observación ficticia.',
    });
  });

  it('guarda armazón usado, metal y color degradé', () => {
    const owner = client();
    expect(
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        frameCondition: 'USED',
        frameMaterial: 'METAL',
        colorType: 'GRADIENT',
      }),
    ).toMatchObject({ frameCondition: 'USED', frameMaterial: 'METAL', colorType: 'GRADIENT' });
  });

  it('permite uno o varios tratamientos provenientes del catálogo', () => {
    const owner = client();
    const one = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      treatmentIds: ['anti-scratch-stark'],
    });
    const many = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      treatmentIds: ['ar-asa-pro', 'edge-polish'],
    });
    expect(one.treatments.map((item) => item.id)).toEqual(['anti-scratch-stark']);
    expect(many.treatments.map((item) => item.id).sort()).toEqual(['ar-asa-pro', 'edge-polish']);
  });

  it('rechaza tratamientos inexistentes o repetidos sin crear la ficha', () => {
    const owner = client();
    expect(() =>
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        treatmentIds: ['inexistente'],
      }),
    ).toThrow('no existe');
    expect(() =>
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        treatmentIds: ['edge-polish', 'edge-polish'],
      }),
    ).toThrow('repetir');
    expect(context.database.opticalJobs.listByClient(owner.id)).toEqual([]);
  });

  it('recupera el detalle completo por ID', () => {
    const owner = client();
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      jobNumber: 'D-01',
      product: 'Producto ficticio',
      frameModel: 'M-1',
      treatmentIds: ['shape-change'],
    });
    expect(context.database.opticalJobs.getById(created.id)).toEqual(created);
  });

  it('lista únicamente las fichas del cliente solicitado', () => {
    const first = client('Primero');
    const second = client('Segundo');
    context.database.opticalJobs.createWithTreatments({ clientId: first.id });
    context.database.opticalJobs.createWithTreatments({ clientId: second.id });
    expect(context.database.opticalJobs.listByClientPage({ clientId: first.id })).toMatchObject({
      total: 1,
      items: [{ clientId: first.id }],
    });
  });

  it('busca por número, cliente, producto y modelo ignorando acentos', () => {
    const owner = context.database.clients.create({
      ...TEST_CLIENT,
      firstName: 'José',
      lastName: 'Álvarez',
    });
    context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      jobNumber: '000-XYZ',
      product: 'Anteojos recetados',
      frameModel: 'Clásico',
    });
    for (const query of ['000-XYZ', 'jose alvarez', 'RECETADOS', 'clasico'])
      expect(context.database.opticalJobs.search({ query }).total).toBe(1);
  });

  it('pagina sin cargar indiscriminadamente todas las fichas', () => {
    const owner = client();
    for (let index = 0; index < 5; index += 1)
      context.database.opticalJobs.createWithTreatments({
        clientId: owner.id,
        jobNumber: `P-${index}`,
      });
    expect(context.database.opticalJobs.search({ limit: 2, offset: 2 })).toMatchObject({
      total: 5,
      limit: 2,
      offset: 2,
      items: [{ jobNumber: 'P-2' }, { jobNumber: 'P-1' }],
    });
  });

  it('edita campos y tratamientos conservando ID y cliente', () => {
    const owner = client();
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      product: 'Inicial',
      treatmentIds: ['edge-polish'],
    });
    const updated = context.database.opticalJobs.update(created.id, {
      product: 'Actualizado',
      jobNumber: 'E-01',
      frameModel: 'Nuevo modelo',
      treatmentIds: ['ar-asa-plus', 'shape-change'],
    });
    expect(updated).toMatchObject({
      id: created.id,
      clientId: owner.id,
      product: 'Actualizado',
      jobNumber: 'E-01',
      frameModel: 'Nuevo modelo',
    });
    expect(updated.treatments.map((item) => item.id).sort()).toEqual([
      'ar-asa-plus',
      'shape-change',
    ]);
  });

  it('evita escrituras si la ficha normalizada no cambió', () => {
    const owner = client();
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      product: 'Producto',
      treatmentIds: ['edge-polish'],
    });
    const unchanged = context.database.opticalJobs.update(created.id, {
      product: 'Producto',
      treatmentIds: ['edge-polish'],
    });
    expect(unchanged.updatedAt).toBe(created.updatedAt);
  });

  it('valida nuevamente la relación receta-cliente al editar', () => {
    const first = client('Primero');
    const second = client('Segundo');
    const job = context.database.opticalJobs.createWithTreatments({ clientId: first.id });
    const recipe = prescription(second.id);
    expect(() =>
      context.database.opticalJobs.update(job.id, { prescriptionId: recipe.id }),
    ).toThrow('pertenece a otro cliente');
  });

  it('revierte una edición completa si falla una asociación de tratamiento', () => {
    const owner = client();
    const created = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      product: 'Original',
      treatmentIds: ['edge-polish'],
    });
    const control = openSqliteDatabase(context.filePath);
    control.exec(
      "CREATE TRIGGER fail_job_treatment BEFORE INSERT ON optical_job_treatments BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;",
    );
    control.close();
    expect(() =>
      context.database.opticalJobs.update(created.id, {
        product: 'No debe persistir',
        treatmentIds: ['ar-asa-pro'],
      }),
    ).toThrow();
    expect(context.database.opticalJobs.getById(created.id)).toEqual(created);
  });

  it('conserva historial al archivar cliente y bloquea solamente nuevas altas', () => {
    const owner = client();
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      product: 'Existente',
    });
    context.database.clients.archive(owner.id);
    expect(context.database.opticalJobs.getById(job.id)?.product).toBe('Existente');
    expect(context.database.opticalJobs.listByClientPage({ clientId: owner.id }).total).toBe(1);
  });

  it('no altera la receta al crear ni editar una ficha', () => {
    const owner = client();
    const recipe = prescription(owner.id);
    const before = context.database.prescriptions.getById(recipe.id);
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      prescriptionId: recipe.id,
    });
    context.database.opticalJobs.update(job.id, {
      prescriptionId: recipe.id,
      product: 'Cambio comercial',
    });
    expect(context.database.prescriptions.getById(recipe.id)).toEqual(before);
  });

  it('conserva ficha, receta y tratamientos después de reabrir SQLite', () => {
    const owner = client();
    const recipe = prescription(owner.id);
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      prescriptionId: recipe.id,
      jobNumber: 'R-01',
      treatmentIds: ['ar-asa-pro'],
    });
    context.database.close();
    context.database = ApplicationDatabase.open(context.filePath);
    expect(context.database.opticalJobs.getById(job.id)).toMatchObject({
      jobNumber: 'R-01',
      prescriptionId: recipe.id,
      treatments: [{ id: 'ar-asa-pro' }],
    });
  });

  it('mantiene integridad referencial después de altas y ediciones', () => {
    const owner = client();
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      treatmentIds: ['edge-polish'],
    });
    context.database.opticalJobs.update(job.id, { treatmentIds: ['shape-change'] });
    expect(context.database.foreignKeyViolations()).toEqual([]);
    expect(context.database.integrityCheck()).toBe('ok');
  });
});
