import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpticalJobPrescriptionNotFoundError } from '../../src/main/database/repositories/optical-job-repository';
import { QueryValidationError } from '../../src/shared/query-validation';
import { createTestDatabase, destroyTestDatabase } from './helpers';
import type { TestDatabase } from './helpers';

describe('dashboard y búsqueda integrada de Fase 7', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => destroyTestDatabase(context));

  function createFixture(): { clientId: number; prescriptionId: number; jobId: number } {
    const client = context.database.clients.create({
      firstName: 'María José',
      lastName: 'Núñez',
      documentNumber: '30123456',
      phone: '11 4567-8901',
    });
    const prescription = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-09-10',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.25' }],
    });
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: prescription.id,
      jobNumber: 'OC-7001',
      product: 'Anteojos multifocales',
    });
    return { clientId: client.id, prescriptionId: prescription.id, jobId: job.id };
  }

  it('devuelve ceros para un dashboard vacío', () => {
    expect(context.database.queries.dashboard()).toEqual({
      activeClients: 0,
      totalPrescriptions: 0,
      totalOpticalJobs: 0,
    });
  });

  it('calcula conteos reales sin cargar tablas completas', () => {
    createFixture();
    expect(context.database.queries.dashboard()).toEqual({
      activeClients: 1,
      totalPrescriptions: 1,
      totalOpticalJobs: 1,
    });
  });

  it('excluye clientes archivados del indicador activo pero conserva sus historiales', () => {
    const fixture = createFixture();
    context.database.clients.archive(fixture.clientId);
    expect(context.database.queries.dashboard()).toEqual({
      activeClients: 0,
      totalPrescriptions: 1,
      totalOpticalJobs: 1,
    });
  });

  it.each([
    ['nombre', 'María'],
    ['apellido', 'Núñez'],
    ['nombre sin acento', 'maria jose'],
    ['apellido sin acento', 'nunez'],
    ['DNI', '30123456'],
    ['teléfono', '4567-8901'],
  ])('encuentra entidades relacionadas por %s', (_label, query) => {
    createFixture();
    const results = context.database.queries.globalSearch({ query });
    expect(results.clients).toHaveLength(1);
    expect(results.prescriptions).toHaveLength(1);
    expect(results.opticalJobs).toHaveLength(1);
  });

  it('encuentra una ficha por número sin mezclar clientes o recetas irrelevantes', () => {
    const fixture = createFixture();
    const results = context.database.queries.globalSearch({ query: 'OC-7001' });
    expect(results.clients).toEqual([]);
    expect(results.prescriptions).toEqual([]);
    expect(results.opticalJobs).toEqual([
      expect.objectContaining({ id: fixture.jobId, jobNumber: 'OC-7001' }),
    ]);
  });

  it('encuentra una ficha por producto', () => {
    createFixture();
    expect(
      context.database.queries.globalSearch({ query: 'multifocales' }).opticalJobs,
    ).toHaveLength(1);
  });

  it('agrupa y limita cada tipo de resultado', () => {
    for (let index = 0; index < 7; index += 1) {
      const client = context.database.clients.create({
        firstName: `Grupo ${index}`,
        lastName: 'Búsqueda',
      });
      const prescription = context.database.prescriptions.createWithValues({
        clientId: client.id,
        prescriptionDate: '2026-08-01',
        values: [{ distance: 'FAR', eye: 'OD', sphere: '0.25' }],
      });
      context.database.opticalJobs.createWithTreatments({
        clientId: client.id,
        prescriptionId: prescription.id,
        product: 'Grupo óptico',
      });
    }
    const results = context.database.queries.globalSearch({ query: 'grupo', limit: 3 });
    expect(results.clients).toHaveLength(3);
    expect(results.prescriptions).toHaveLength(3);
    expect(results.opticalJobs).toHaveLength(3);
    expect(results.limit).toBe(3);
  });

  it('devuelve grupos vacíos cuando no hay resultados', () => {
    createFixture();
    expect(context.database.queries.globalSearch({ query: 'inexistente' })).toEqual({
      clients: [],
      prescriptions: [],
      opticalJobs: [],
      limit: 5,
    });
  });

  it('trata intentos de inyección y comodines como texto literal', () => {
    createFixture();
    expect(context.database.queries.globalSearch({ query: "' OR 1=1 --" }).clients).toEqual([]);
    expect(context.database.queries.globalSearch({ query: '%_' }).clients).toEqual([]);
    expect(context.database.queries.dashboard().activeClients).toBe(1);
  });

  it('valida búsqueda vacía, corta, extensa y límites', () => {
    expect(() => context.database.queries.globalSearch({ query: '' })).toThrow(
      QueryValidationError,
    );
    expect(() => context.database.queries.globalSearch({ query: 'a' })).toThrow(
      QueryValidationError,
    );
    expect(() => context.database.queries.globalSearch({ query: 'x'.repeat(101) })).toThrow(
      QueryValidationError,
    );
    expect(() => context.database.queries.globalSearch({ query: 'válida', limit: 11 })).toThrow(
      QueryValidationError,
    );
  });

  it('incluye clientes archivados claramente identificados en la búsqueda', () => {
    const fixture = createFixture();
    context.database.clients.archive(fixture.clientId);
    expect(context.database.queries.globalSearch({ query: 'Núñez' }).clients[0]).toMatchObject({
      id: fixture.clientId,
      isArchived: true,
    });
  });

  it('pagina fichas asociadas a una receta', () => {
    const fixture = createFixture();
    for (let index = 0; index < 12; index += 1) {
      context.database.opticalJobs.createWithTreatments({
        clientId: fixture.clientId,
        prescriptionId: fixture.prescriptionId,
        jobNumber: `REL-${index}`,
      });
    }
    const first = context.database.opticalJobs.listByPrescriptionPage({
      prescriptionId: fixture.prescriptionId,
      limit: 10,
      offset: 0,
    });
    const second = context.database.opticalJobs.listByPrescriptionPage({
      prescriptionId: fixture.prescriptionId,
      limit: 10,
      offset: 10,
    });
    expect(first.total).toBe(13);
    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(3);
  });

  it('rechaza una receta inexistente al consultar sus fichas', () => {
    expect(() =>
      context.database.opticalJobs.listByPrescriptionPage({ prescriptionId: 999 }),
    ).toThrow(OpticalJobPrescriptionNotFoundError);
  });

  it('las consultas no modifican recetas, revisiones ni fichas', () => {
    const fixture = createFixture();
    context.database.prescriptions.correct(fixture.prescriptionId, {
      prescriptionDate: '2026-09-11',
      reason: 'Corrección ficticia',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.50' }],
    });
    const beforePrescription = context.database.prescriptions.getById(fixture.prescriptionId);
    const beforeRevisions = context.database.prescriptions.listRevisions(fixture.prescriptionId);
    const beforeJob = context.database.opticalJobs.getById(fixture.jobId);
    context.database.queries.dashboard();
    context.database.queries.globalSearch({ query: 'Núñez' });
    expect(context.database.prescriptions.getById(fixture.prescriptionId)).toEqual(
      beforePrescription,
    );
    expect(context.database.prescriptions.listRevisions(fixture.prescriptionId)).toEqual(
      beforeRevisions,
    );
    expect(context.database.opticalJobs.getById(fixture.jobId)).toEqual(beforeJob);
  });
});
