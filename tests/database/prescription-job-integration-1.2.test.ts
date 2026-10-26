import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSqliteDatabase } from '../../src/main/database/connection';
import type { CreatePrescriptionBundleInput } from '../../src/shared/database-models';
import {
  createTestDatabase,
  destroyTestDatabase,
  FOUR_PRESCRIPTION_VALUES,
  TEST_CLIENT,
} from './helpers';
import type { TestDatabase } from './helpers';

describe('Occhiali 1.2: alta integrada de receta y trabajo', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  function client(firstName = 'Integrado') {
    return context.database.clients.create({ ...TEST_CLIENT, firstName });
  }

  function input(clientId: number): CreatePrescriptionBundleInput {
    return {
      prescription: {
        clientId,
        prescriptionDate: '2026-10-26',
        prescriberName: 'Profesional ficticia',
        additionOd: '1.25',
        additionOi: null,
        notes: 'Receta integrada ficticia.',
        values: FOUR_PRESCRIPTION_VALUES,
      },
      opticalJob: {
        jobNumber: 'INT-001',
        product: 'Anteojos recetados',
        lens: 'Orgánico 1.60',
        brand: 'Marca ficticia',
        frameCondition: 'NEW',
        frameMaterial: 'METAL',
        frameModel: 'Modelo integrado',
        productColor: 'Azul',
        supplier: 'Proveedor ficticio',
        colorType: 'GRADIENT',
        observations: 'Trabajo integrado ficticio.',
        treatmentIds: ['edge-polish'],
        treatmentNames: ['Acabado integrado ficticio'],
      },
    };
  }

  it('crea receta, cuatro graduaciones y trabajo asociado en una operación', () => {
    const owner = client();
    const created = context.database.prescriptionJobs.create(input(owner.id));

    expect(created.prescription).toMatchObject({
      clientId: owner.id,
      prescriptionDate: '2026-10-26',
      prescriberName: 'Profesional ficticia',
      additionOd: '1.25',
      additionOi: null,
    });
    expect(created.prescription.values.map((value) => `${value.distance}:${value.eye}`)).toEqual([
      'FAR:OD',
      'FAR:OI',
      'NEAR:OD',
      'NEAR:OI',
    ]);
    expect(created.opticalJob).toMatchObject({
      clientId: owner.id,
      prescriptionId: created.prescription.id,
      jobNumber: 'INT-001',
      product: 'Anteojos recetados',
      lens: 'Orgánico 1.60',
      brand: 'Marca ficticia',
      frameModel: 'Modelo integrado',
    });
    expect(created.opticalJob?.treatments.map((treatment) => treatment.name)).toEqual([
      'Acabado integrado ficticio',
      'Pulido de bordes',
    ]);
    expect(context.database.foreignKeyViolations()).toEqual([]);
  });

  it('admite guardar sólo la receta y conserva el alta independiente anterior', () => {
    const owner = client();
    const integrated = context.database.prescriptionJobs.create({
      prescription: input(owner.id).prescription,
      opticalJob: null,
    });
    const independent = context.database.prescriptions.createWithValues({
      clientId: owner.id,
      prescriptionDate: '2026-10-27',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-2.00' }],
    });

    expect(integrated.opticalJob).toBeNull();
    expect(integrated.prescription.values).toHaveLength(4);
    expect(independent.values).toHaveLength(1);
    expect(context.database.opticalJobs.listByClient(owner.id)).toEqual([]);
    expect(context.database.prescriptions.listByClient(owner.id)).toHaveLength(2);
  });

  it('rechaza un número de ficha duplicado antes de escribir la receta', () => {
    const owner = client();
    context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      jobNumber: 'INT-001',
    });

    expect(() => context.database.prescriptionJobs.create(input(owner.id))).toThrow(
      'Ya existe una ficha registrada con ese número.',
    );
    expect(context.database.prescriptions.listByClient(owner.id)).toEqual([]);
    expect(context.database.opticalJobs.listByClient(owner.id)).toHaveLength(1);
  });

  it('rechaza clientes archivados sin dejar recetas ni trabajos', () => {
    const owner = client();
    context.database.clients.archive(owner.id);

    expect(() => context.database.prescriptionJobs.create(input(owner.id))).toThrow(
      'El cliente está archivado',
    );
    expect(context.database.prescriptions.listByClient(owner.id)).toEqual([]);
    expect(context.database.opticalJobs.listByClient(owner.id)).toEqual([]);
  });

  it('valida campos comerciales y tratamientos antes de escribir', () => {
    const owner = client();
    const invalidCommercial = input(owner.id);
    invalidCommercial.opticalJob = {
      ...invalidCommercial.opticalJob!,
      lens: 'x'.repeat(201),
    };
    expect(() => context.database.prescriptionJobs.create(invalidCommercial)).toThrow(
      'El cristal no puede superar los 200 caracteres.',
    );

    const invalidTreatment = input(owner.id);
    invalidTreatment.opticalJob = {
      ...invalidTreatment.opticalJob!,
      treatmentIds: ['tratamiento-inexistente'],
      treatmentNames: [],
    };
    expect(() => context.database.prescriptionJobs.create(invalidTreatment)).toThrow('no existe');
    expect(context.database.prescriptions.listByClient(owner.id)).toEqual([]);
    expect(context.database.opticalJobs.listByClient(owner.id)).toEqual([]);
  });

  it('no permite inyectar otro cliente ni otra receta en el trabajo integrado', () => {
    const owner = client();
    const injected = input(owner.id) as unknown as {
      prescription: CreatePrescriptionBundleInput['prescription'];
      opticalJob: Record<string, unknown>;
    };
    injected.opticalJob.clientId = 999;
    injected.opticalJob.prescriptionId = 999;

    expect(() =>
      context.database.prescriptionJobs.create(
        injected as unknown as CreatePrescriptionBundleInput,
      ),
    ).toThrow('campos no permitidos');
    expect(context.database.prescriptions.listByClient(owner.id)).toEqual([]);
  });

  it.each([
    {
      stage: 'graduaciones',
      trigger: `CREATE TRIGGER fail_integrated_values BEFORE INSERT ON prescription_values
                BEGIN SELECT RAISE(ABORT, 'fallo graduaciones'); END;`,
    },
    {
      stage: 'trabajo',
      trigger: `CREATE TRIGGER fail_integrated_job BEFORE INSERT ON optical_jobs
                BEGIN SELECT RAISE(ABORT, 'fallo trabajo'); END;`,
    },
    {
      stage: 'asociación de tratamiento',
      trigger: `CREATE TRIGGER fail_integrated_treatment BEFORE INSERT ON optical_job_treatments
                BEGIN SELECT RAISE(ABORT, 'fallo tratamiento'); END;`,
    },
  ])('revierte todo ante una falla en $stage', ({ trigger }) => {
    const owner = client();
    const treatmentsBefore = context.database.treatments.list();
    const control = openSqliteDatabase(context.filePath);
    control.exec(trigger);
    control.close();

    expect(() => context.database.prescriptionJobs.create(input(owner.id))).toThrow();
    expect(context.database.prescriptions.listByClient(owner.id)).toEqual([]);
    expect(context.database.opticalJobs.listByClient(owner.id)).toEqual([]);
    expect(context.database.treatments.list()).toEqual(treatmentsBefore);
    expect(context.database.foreignKeyViolations()).toEqual([]);
    expect(context.database.integrityCheck()).toBe('ok');
  });

  it('preserva el estado anterior si la operación integrada falla', () => {
    const owner = client();
    const previousPrescription = context.database.prescriptions.createWithValues({
      clientId: owner.id,
      prescriptionDate: '2026-10-20',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.00' }],
    });
    const previousJob = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      prescriptionId: previousPrescription.id,
      jobNumber: 'PREV-001',
      product: 'Producto anterior',
    });
    const control = openSqliteDatabase(context.filePath);
    control.exec(`CREATE TRIGGER fail_second_job BEFORE INSERT ON optical_jobs
                  BEGIN SELECT RAISE(ABORT, 'fallo posterior'); END;`);
    control.close();

    expect(() => context.database.prescriptionJobs.create(input(owner.id))).toThrow();
    expect(context.database.prescriptions.getById(previousPrescription.id)).toEqual(
      previousPrescription,
    );
    expect(context.database.opticalJobs.getById(previousJob.id)).toEqual(previousJob);
    expect(context.database.prescriptions.listByClient(owner.id)).toHaveLength(1);
    expect(context.database.opticalJobs.listByClient(owner.id)).toHaveLength(1);
  });

  it('mantiene trabajos sin receta y permite varios trabajos para una receta', () => {
    const owner = client();
    const integrated = context.database.prescriptionJobs.create(input(owner.id));
    const second = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      prescriptionId: integrated.prescription.id,
      jobNumber: 'INT-002',
      product: 'Segundo trabajo',
    });
    const withoutPrescription = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      jobNumber: 'INT-003',
      product: 'Lentes de sol',
    });

    expect(second.prescriptionId).toBe(integrated.prescription.id);
    expect(withoutPrescription.prescriptionId).toBeNull();
    expect(
      context.database.opticalJobs.listByPrescriptionPage({
        prescriptionId: integrated.prescription.id,
      }).total,
    ).toBe(2);
  });
});
