import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSqliteDatabase } from '../../src/main/database/connection';
import type {
  CreatePrescriptionBundleInput,
  UpdateOpticalFileInput,
} from '../../src/shared/database-models';
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

  function updateInput(
    created: ReturnType<typeof context.database.prescriptionJobs.create>,
  ): UpdateOpticalFileInput {
    return {
      opticalJob: {
        prescriptionId: created.prescription.id,
        jobNumber: created.opticalJob!.jobNumber,
        product: created.opticalJob!.product,
        lens: created.opticalJob!.lens,
        brand: created.opticalJob!.brand,
        frameCondition: created.opticalJob!.frameCondition,
        frameMaterial: created.opticalJob!.frameMaterial,
        frameModel: created.opticalJob!.frameModel,
        productColor: created.opticalJob!.productColor,
        supplier: created.opticalJob!.supplier,
        colorType: created.opticalJob!.colorType,
        observations: created.opticalJob!.observations,
        treatmentIds: created.opticalJob!.treatments.map((treatment) => treatment.id),
        treatmentNames: [],
      },
      prescription: null,
      confirmSharedPrescription: false,
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

  it('admite fichas sin graduación para productos que no la requieren', () => {
    const owner = client();
    const contactLenses = input(owner.id);
    contactLenses.prescription = {
      ...contactLenses.prescription,
      additionOd: null,
      additionOi: null,
      values: [],
    };
    contactLenses.opticalJob = {
      ...contactLenses.opticalJob!,
      jobNumber: 'INT-CONTACTO',
      product: 'Lentes de contacto',
    };

    const created = context.database.prescriptionJobs.create(contactLenses);

    expect(created.prescription.values).toEqual([]);
    expect(created.opticalJob).toMatchObject({
      prescriptionId: created.prescription.id,
      product: 'Lentes de contacto',
    });
  });

  it('exige al menos un dato óptico para anteojos de receta sin escribir parcialmente', () => {
    const owner = client();
    const prescriptionGlasses = input(owner.id);
    prescriptionGlasses.prescription = {
      ...prescriptionGlasses.prescription,
      additionOd: null,
      additionOi: null,
      values: [],
    };
    prescriptionGlasses.opticalJob = {
      ...prescriptionGlasses.opticalJob!,
      jobNumber: 'INT-RECETA',
      product: 'Anteojos de receta',
    };

    expect(() => context.database.prescriptionJobs.create(prescriptionGlasses)).toThrow(
      'Ingresá al menos un dato óptico antes de guardar.',
    );
    expect(context.database.prescriptions.listByClient(owner.id)).toEqual([]);
    expect(context.database.opticalJobs.listByClient(owner.id)).toEqual([]);
  });

  it('permite corregir una ficha sin graduación cuando el producto no la requiere', () => {
    const owner = client();
    const contactLenses = input(owner.id);
    contactLenses.prescription = {
      ...contactLenses.prescription,
      additionOd: null,
      additionOi: null,
      values: [],
    };
    contactLenses.opticalJob = {
      ...contactLenses.opticalJob!,
      jobNumber: 'INT-SIN-GRAD',
      product: 'Lentes de contacto',
    };
    const created = context.database.prescriptionJobs.create(contactLenses);

    const request = updateInput(created);
    request.prescription = {
      prescriptionDate: '2026-10-28',
      prescriberName: 'Profesional corregida',
      additionOd: null,
      additionOi: null,
      notes: null,
      values: [],
      reason: 'Corrección de datos generales sin inventar graduación.',
    };
    const corrected = context.database.prescriptionJobs.update(
      created.opticalJob!.id,
      request,
    ).prescription!;

    expect(corrected.values).toEqual([]);
    expect(corrected.prescriberName).toBe('Profesional corregida');
    expect(context.database.prescriptions.listRevisions(created.prescription.id)).toHaveLength(1);
  });

  it('rechaza vaciar la graduación de anteojos de receta y conserva su estado', () => {
    const owner = client();
    const glasses = input(owner.id);
    glasses.opticalJob = {
      ...glasses.opticalJob!,
      jobNumber: 'INT-CON-GRAD',
      product: 'Anteojos de receta',
    };
    const created = context.database.prescriptionJobs.create(glasses);

    expect(() =>
      context.database.prescriptionJobs.update(created.opticalJob!.id, {
        ...updateInput(created),
        prescription: {
          prescriptionDate: created.prescription.prescriptionDate,
          prescriberName: created.prescription.prescriberName,
          additionOd: null,
          additionOi: null,
          notes: null,
          values: [],
          reason: 'Intento inválido de vaciar la graduación.',
        },
      }),
    ).toThrow('Ingresá al menos un dato óptico antes de guardar.');
    expect(context.database.prescriptions.getById(created.prescription.id)).toEqual(
      created.prescription,
    );
    expect(context.database.prescriptions.listRevisions(created.prescription.id)).toEqual([]);
  });

  it('conserva una única graduación y la trazabilidad cuando está compartida', () => {
    const owner = client();
    const created = context.database.prescriptionJobs.create(input(owner.id));
    const secondJob = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      prescriptionId: created.prescription.id,
      jobNumber: 'INT-COMPARTIDA',
      product: 'Lentes de sol',
    });

    const request = updateInput(created);
    request.confirmSharedPrescription = true;
    request.prescription = {
      prescriptionDate: created.prescription.prescriptionDate,
      prescriberName: created.prescription.prescriberName,
      additionOd: created.prescription.additionOd,
      additionOi: created.prescription.additionOi,
      notes: created.prescription.notes,
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-3.00' }],
      reason: 'Corrección compartida controlada.',
    };
    const corrected = context.database.prescriptionJobs.update(
      created.opticalJob!.id,
      request,
    ).prescription!;

    expect(corrected.values).toEqual([
      expect.objectContaining({ distance: 'FAR', eye: 'OD', sphere: '-3.00' }),
    ]);
    expect(context.database.opticalJobs.getById(created.opticalJob!.id)?.prescriptionId).toBe(
      corrected.id,
    );
    expect(context.database.opticalJobs.getById(secondJob.id)?.prescriptionId).toBe(corrected.id);
    expect(context.database.prescriptions.listRevisions(corrected.id)).toHaveLength(1);
  });

  it('rechaza cambiar una ficha sin graduación a anteojos y no deja cambios parciales', () => {
    const owner = client();
    const contactLenses = input(owner.id);
    contactLenses.prescription = {
      ...contactLenses.prescription,
      additionOd: null,
      additionOi: null,
      values: [],
    };
    contactLenses.opticalJob = {
      ...contactLenses.opticalJob!,
      jobNumber: 'INT-CAMBIO-INVALIDO',
      product: 'Lentes de contacto',
    };
    const created = context.database.prescriptionJobs.create(contactLenses);
    const before = created.opticalJob!;

    expect(() =>
      context.database.opticalJobs.update(before.id, {
        prescriptionId: before.prescriptionId,
        jobNumber: before.jobNumber,
        product: 'Anteojos recetados',
        lens: before.lens,
        brand: before.brand,
        frameCondition: before.frameCondition,
        frameMaterial: before.frameMaterial,
        frameModel: before.frameModel,
        productColor: before.productColor,
        supplier: before.supplier,
        colorType: before.colorType,
        observations: 'No debe persistir',
        treatmentIds: before.treatments.map((treatment) => treatment.id),
        treatmentNames: ['Tratamiento que tampoco debe persistir'],
      }),
    ).toThrow('Primero corregí la graduación');

    expect(context.database.opticalJobs.getById(before.id)).toEqual(before);
    expect(
      context.database.treatments
        .listActive()
        .some((treatment) => treatment.name === 'Tratamiento que tampoco debe persistir'),
    ).toBe(false);
  });

  it('permite cambiar el producto a anteojos cuando la graduación asociada es válida', () => {
    const owner = client();
    const contactLenses = input(owner.id);
    contactLenses.opticalJob = {
      ...contactLenses.opticalJob!,
      jobNumber: 'INT-CAMBIO-VALIDO',
      product: 'Lentes de contacto',
    };
    const created = context.database.prescriptionJobs.create(contactLenses);

    const updated = context.database.opticalJobs.update(created.opticalJob!.id, {
      prescriptionId: created.prescription.id,
      jobNumber: created.opticalJob!.jobNumber,
      product: 'Anteojos de receta',
      treatmentIds: created.opticalJob!.treatments.map((treatment) => treatment.id),
    });

    expect(updated.product).toBe('Anteojos de receta');
    expect(updated.prescriptionId).toBe(created.prescription.id);
  });

  it('valida una receta compartida según sus datos ópticos y no según los otros productos', () => {
    const owner = client();
    const contactLenses = input(owner.id);
    contactLenses.prescription = {
      ...contactLenses.prescription,
      additionOd: null,
      additionOi: null,
      values: [],
    };
    contactLenses.opticalJob = {
      ...contactLenses.opticalJob!,
      jobNumber: 'INT-COMPARTIDA-CONTACTO',
      product: 'Lentes de contacto',
    };
    const created = context.database.prescriptionJobs.create(contactLenses);
    const sunglasses = context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      prescriptionId: created.prescription.id,
      jobNumber: 'INT-COMPARTIDA-SOL',
      product: 'Lentes de sol',
    });

    expect(() =>
      context.database.opticalJobs.update(sunglasses.id, {
        prescriptionId: created.prescription.id,
        jobNumber: sunglasses.jobNumber,
        product: 'Anteojos de receta',
      }),
    ).toThrow('Primero corregí la graduación');
    expect(context.database.opticalJobs.getById(sunglasses.id)).toEqual(sunglasses);
    expect(context.database.opticalJobs.getById(created.opticalJob!.id)?.product).toBe(
      'Lentes de contacto',
    );
  });

  it('actualiza sólo datos comerciales sin crear una revisión óptica', () => {
    const created = context.database.prescriptionJobs.create(input(client().id));
    const request = updateInput(created);
    request.opticalJob.observations = 'Observación comercial actualizada';

    const updated = context.database.prescriptionJobs.update(created.opticalJob!.id, request);

    expect(updated.opticalJob.observations).toBe('Observación comercial actualizada');
    expect(updated.prescriptionRevisionCreated).toBe(false);
    expect(context.database.prescriptions.listRevisions(created.prescription.id)).toEqual([]);
    expect(updated.prescription).toMatchObject({ additionOd: '1.25', additionOi: null });
  });

  it('impide evitar la edición unificada mediante la corrección histórica', () => {
    const created = context.database.prescriptionJobs.create(input(client().id));

    expect(() =>
      context.database.prescriptions.correct(created.prescription.id, {
        prescriptionDate: created.prescription.prescriptionDate,
        prescriberName: created.prescription.prescriberName,
        additionOd: created.prescription.additionOd,
        additionOi: created.prescription.additionOi,
        notes: created.prescription.notes,
        values: [{ distance: 'FAR', eye: 'OD', sphere: '-9.00' }],
        reason: 'Intento por el mecanismo histórico',
      }),
    ).toThrow('Realizá la corrección desde la edición unificada');
    expect(context.database.prescriptions.getById(created.prescription.id)).toEqual(
      created.prescription,
    );
    expect(context.database.prescriptions.listRevisions(created.prescription.id)).toEqual([]);
  });

  it('mantiene la corrección histórica para recetas sin fichas vinculadas', () => {
    const owner = client();
    const prescription = context.database.prescriptions.createWithValues({
      clientId: owner.id,
      prescriptionDate: '2026-11-04',
      additionOd: '1.25',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.00' }],
    });

    const corrected = context.database.prescriptions.correct(prescription.id, {
      prescriptionDate: prescription.prescriptionDate,
      additionOd: prescription.additionOd,
      additionOi: prescription.additionOi,
      notes: prescription.notes,
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-2.00' }],
      reason: 'Corrección histórica válida',
    });

    expect(corrected).toMatchObject({ additionOd: '1.25' });
    expect(corrected.values[0]).toMatchObject({ sphere: '-2.00' });
    expect(context.database.prescriptions.listRevisions(prescription.id)).toHaveLength(1);
  });

  it('actualiza graduación y datos comerciales juntos creando una sola revisión', () => {
    const created = context.database.prescriptionJobs.create(input(client().id));
    const request = updateInput(created);
    request.opticalJob.lens = 'Cristal actualizado';
    request.prescription = {
      prescriptionDate: created.prescription.prescriptionDate,
      prescriberName: created.prescription.prescriberName,
      additionOd: created.prescription.additionOd,
      additionOi: created.prescription.additionOi,
      notes: created.prescription.notes,
      values: created.prescription.values.map((value, index) => ({
        distance: value.distance,
        eye: value.eye,
        sphere: index === 0 ? '-4.00' : value.sphere,
        cylinder: value.cylinder,
        axis: value.axis,
        dip: value.dip,
        height: value.height,
      })),
      reason: 'Corrección integral ficticia',
    };

    const updated = context.database.prescriptionJobs.update(created.opticalJob!.id, request);

    expect(updated.opticalJob.lens).toBe('Cristal actualizado');
    expect(updated.prescription?.values[0]?.sphere).toBe('-4.00');
    expect(updated.prescriptionRevisionCreated).toBe(true);
    expect(context.database.prescriptions.listRevisions(created.prescription.id)).toHaveLength(1);
    expect(updated.prescription).toMatchObject({ additionOd: '1.25', additionOi: null });
  });

  it('revierte también la corrección si falla la actualización comercial', () => {
    const created = context.database.prescriptionJobs.create(input(client().id));
    const request = updateInput(created);
    request.prescription = {
      prescriptionDate: created.prescription.prescriptionDate,
      prescriberName: created.prescription.prescriberName,
      additionOd: created.prescription.additionOd,
      additionOi: created.prescription.additionOi,
      notes: created.prescription.notes,
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-6.00' }],
      reason: 'Debe revertirse',
    };
    vi.spyOn(context.database.opticalJobs, 'updateInTransaction').mockImplementation(() => {
      throw new Error('Falla provocada después de corregir');
    });

    expect(() => context.database.prescriptionJobs.update(created.opticalJob!.id, request)).toThrow(
      'Falla provocada',
    );
    expect(context.database.prescriptions.getById(created.prescription.id)).toEqual(
      created.prescription,
    );
    expect(context.database.prescriptions.listRevisions(created.prescription.id)).toEqual([]);
    expect(context.database.opticalJobs.getById(created.opticalJob!.id)).toEqual(
      created.opticalJob,
    );
  });

  it('exige confirmación persistente para corregir una receta compartida', () => {
    const owner = client();
    const created = context.database.prescriptionJobs.create(input(owner.id));
    context.database.opticalJobs.createWithTreatments({
      clientId: owner.id,
      prescriptionId: created.prescription.id,
      jobNumber: 'INT-COMPARTIDA-2',
      product: 'Lentes de sol',
    });
    const request = updateInput(created);
    request.prescription = {
      prescriptionDate: created.prescription.prescriptionDate,
      prescriberName: created.prescription.prescriberName,
      additionOd: created.prescription.additionOd,
      additionOi: created.prescription.additionOi,
      notes: created.prescription.notes,
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-5.00' }],
      reason: 'Corrección compartida',
    };

    expect(() => context.database.prescriptionJobs.update(created.opticalJob!.id, request)).toThrow(
      'Confirmá que comprendés',
    );
    expect(context.database.prescriptions.listRevisions(created.prescription.id)).toEqual([]);

    request.confirmSharedPrescription = true;
    const updated = context.database.prescriptionJobs.update(created.opticalJob!.id, request);
    expect(updated.prescriptionRevisionCreated).toBe(true);
    expect(updated.prescription?.additionOd).toBe('1.25');
  });
});
