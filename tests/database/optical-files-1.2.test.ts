import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './helpers';
import type { TestDatabase } from './helpers';

describe('Occhiali 1.2: proyección unificada de fichas ópticas', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  it('evita duplicar la receta asociada y conserva todos los registros históricos', () => {
    const client = context.database.clients.create({ ...TEST_CLIENT, firstName: 'Histórica' });
    const sharedPrescription = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-11-01',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '0.00' }],
    });
    const firstJob = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: sharedPrescription.id,
      jobNumber: 'F-100',
      product: 'Anteojos de receta',
    });
    const secondJob = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: sharedPrescription.id,
      jobNumber: 'F-101',
      product: 'Segundo producto',
    });
    const prescriptionOnly = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-10-20',
      notes: 'Registro histórico sin trabajo',
      values: [{ distance: 'NEAR', eye: 'OI', sphere: '1.00' }],
    });
    const jobOnly = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      jobNumber: 'F-ANTIGUA',
      product: 'Lentes de sol',
    });

    const result = context.database.opticalFiles.search({ limit: 25, offset: 0 });

    expect(result.total).toBe(4);
    expect(result.items.filter((item) => item.prescriptionId === sharedPrescription.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'JOB', jobId: firstJob.id, relatedJobCount: 2 }),
        expect.objectContaining({ kind: 'JOB', jobId: secondJob.id, relatedJobCount: 2 }),
      ]),
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({
        kind: 'PRESCRIPTION_ONLY',
        prescriptionId: prescriptionOnly.id,
        jobId: null,
      }),
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({ kind: 'JOB', jobId: jobOnly.id, prescriptionId: null }),
    );
  });

  it('busca por número, cliente y producto con paginación estable', () => {
    const client = context.database.clients.create({
      ...TEST_CLIENT,
      firstName: 'Ángela',
      lastName: 'Óptica',
    });
    for (let index = 1; index <= 3; index += 1) {
      context.database.opticalJobs.createWithTreatments({
        clientId: client.id,
        jobNumber: `PAG-${index}`,
        product: index === 3 ? 'Cristal especial' : 'Anteojos',
      });
    }

    expect(context.database.opticalFiles.search({ query: 'angela optica' }).total).toBe(3);
    expect(context.database.opticalFiles.search({ query: 'cristal especial' }).items).toEqual([
      expect.objectContaining({ jobNumber: 'PAG-3' }),
    ]);
    expect(context.database.opticalFiles.search({ query: 'PAG-2' }).items).toEqual([
      expect.objectContaining({ jobNumber: 'PAG-2' }),
    ]);

    const firstPage = context.database.opticalFiles.search({ limit: 2, offset: 0 });
    const secondPage = context.database.opticalFiles.search({ limit: 2, offset: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(1);
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.jobId)).size).toBe(
      3,
    );
  });

  it('filtra el historial unificado por el identificador exacto del cliente', () => {
    const firstClient = context.database.clients.create({ ...TEST_CLIENT, firstName: 'Primera' });
    const secondClient = context.database.clients.create({
      ...TEST_CLIENT,
      documentNumber: '30999888',
      firstName: 'Segunda',
    });
    context.database.opticalJobs.createWithTreatments({
      clientId: firstClient.id,
      jobNumber: 'CLI-1',
    });
    context.database.opticalJobs.createWithTreatments({
      clientId: secondClient.id,
      jobNumber: 'CLI-2',
    });

    const result = context.database.opticalFiles.search({ clientId: firstClient.id });

    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({ clientId: firstClient.id, jobNumber: 'CLI-1' }),
    ]);
  });
});
