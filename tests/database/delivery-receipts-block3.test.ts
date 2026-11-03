import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDatabase } from '../../src/main/database';
import { openSqliteDatabase } from '../../src/main/database/connection';
import type { CreateDeliveryReceiptInput } from '../../src/shared/database-models';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './helpers';
import type { TestDatabase } from './helpers';

describe('Bloque 3: comprobantes de retiro', () => {
  let context: TestDatabase;
  beforeEach(() => {
    context = createTestDatabase();
  });
  afterEach(() => {
    destroyTestDatabase(context);
  });

  function fixture() {
    const client = context.database.clients.create({
      ...TEST_CLIENT,
      firstName: 'José',
      lastName: 'Pérez',
      documentNumber: '30111222',
    });
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      jobNumber: 'F-001',
      product: 'Anteojos recetados',
      frameModel: 'Modelo Ñandú',
      productColor: 'Turquesa',
      supplier: 'Proveedor ficticio',
      colorType: 'GRADIENT',
      observations: 'Producto de prueba.',
      treatmentNames: ['Antirreflejo especial'],
    });
    return { client, job };
  }

  function ownerInput(opticalJobId: number): CreateDeliveryReceiptInput {
    return {
      opticalJobId,
      deliveredAt: '2026-10-17T16:30:00.000Z',
      recipientType: 'OWNER',
      recipientFullName: 'José Pérez',
      recipientDocumentNumber: '30111222',
      deliveredBy: 'Dueña Ficticia',
      deliveryConfirmed: true,
    };
  }

  it('registra retiro por titular con snapshot completo y numeración legible', () => {
    const { job } = fixture();
    const receipt = context.database.deliveryReceipts.create(ownerInput(job.id));
    expect(receipt).toMatchObject({
      receiptNumber: 'RET-000001',
      opticalJobId: job.id,
      clientFirstName: 'José',
      product: 'Anteojos recetados',
      frameModel: 'Modelo Ñandú',
      treatmentNames: ['Antirreflejo especial'],
      recipientType: 'OWNER',
      status: 'CONFIRMED',
    });
  });

  it('registra un tercero sólo con DNI, vínculo, autorización y confirmación', () => {
    const { job } = fixture();
    const base = {
      ...ownerInput(job.id),
      recipientType: 'AUTHORIZED_THIRD_PARTY' as const,
      recipientFullName: 'Ana Autorizada',
      recipientDocumentNumber: '33222111',
      recipientRelationship: 'Hija',
      authorizationReference: 'Autorización escrita presentada',
      authorizationConfirmed: true,
    };
    expect(context.database.deliveryReceipts.create(base)).toMatchObject({
      recipientFullName: 'Ana Autorizada',
      authorizationConfirmed: true,
    });
  });

  it('rechaza tercero sin identidad, vínculo, referencia o declaración', () => {
    const { job } = fixture();
    const input = {
      ...ownerInput(job.id),
      recipientType: 'AUTHORIZED_THIRD_PARTY' as const,
      recipientFullName: 'Tercero',
      recipientDocumentNumber: undefined,
    };
    expect(() => context.database.deliveryReceipts.create(input)).toThrow('DNI');
    expect(() =>
      context.database.deliveryReceipts.create({
        ...input,
        recipientDocumentNumber: '1',
        recipientRelationship: 'Vecino',
        authorizationReference: 'Mensaje',
        authorizationConfirmed: false,
      }),
    ).toThrow('Confirmá');
  });

  it('impide duplicados por ficha y no consume ni reutiliza números confirmados', () => {
    const first = fixture();
    const one = context.database.deliveryReceipts.create(ownerInput(first.job.id));
    expect(() => context.database.deliveryReceipts.create(ownerInput(first.job.id))).toThrow(
      'ya tiene',
    );
    context.database.deliveryReceipts.addEvent({
      receiptId: one.id,
      type: 'ANNULLED',
      reason: 'Prueba de anulación.',
    });
    const secondClient = context.database.clients.create({
      ...TEST_CLIENT,
      firstName: 'Otra',
      documentNumber: '30999888',
    });
    const secondJob = context.database.opticalJobs.createWithTreatments({
      clientId: secondClient.id,
    });
    expect(context.database.deliveryReceipts.create(ownerInput(secondJob.id)).receiptNumber).toBe(
      'RET-000002',
    );
  });

  it('conserva el snapshot si después cambian cliente, ficha y tratamientos', () => {
    const { client, job } = fixture();
    const receipt = context.database.deliveryReceipts.create(ownerInput(job.id));
    context.database.clients.update(client.id, { firstName: 'Nombre cambiado' });
    context.database.opticalJobs.update(job.id, {
      product: 'Producto cambiado',
      treatmentNames: ['Otro acabado'],
    });
    expect(context.database.deliveryReceipts.getById(receipt.id)).toMatchObject({
      clientFirstName: 'José',
      product: 'Anteojos recetados',
      treatmentNames: ['Antirreflejo especial'],
    });
  });

  it('agrega aclaraciones y anulación sin sobrescribir el original', () => {
    const { job } = fixture();
    const receipt = context.database.deliveryReceipts.create(ownerInput(job.id));
    const corrected = context.database.deliveryReceipts.addEvent({
      receiptId: receipt.id,
      type: 'CORRECTION_NOTE',
      reason: 'Se aclara el color informado.',
    });
    expect(corrected).toMatchObject({ status: 'CORRECTED', recipientFullName: 'José Pérez' });
    const annulled = context.database.deliveryReceipts.addEvent({
      receiptId: receipt.id,
      type: 'ANNULLED',
      reason: 'Registro de QA anulado.',
    });
    expect(annulled.status).toBe('ANNULLED');
    expect(annulled.events.map((event) => event.type)).toEqual(['CORRECTION_NOTE', 'ANNULLED']);
    expect(() =>
      context.database.deliveryReceipts.addEvent({
        receiptId: receipt.id,
        type: 'CORRECTION_NOTE',
        reason: 'No permitido',
      }),
    ).toThrow('anulado');
  });

  it('rechaza ficha inexistente, falta de confirmación y mantiene integridad referencial', () => {
    expect(() => context.database.deliveryReceipts.create(ownerInput(999_999))).toThrow('ficha');
    const { job } = fixture();
    expect(() =>
      context.database.deliveryReceipts.create({ ...ownerInput(job.id), deliveryConfirmed: false }),
    ).toThrow('Confirmá');
    expect(context.database.foreignKeyViolations()).toEqual([]);
  });

  it('lista con paginación y orden estable del registro más reciente al más antiguo', () => {
    const first = fixture();
    const firstReceipt = context.database.deliveryReceipts.create(ownerInput(first.job.id));
    const secondClient = context.database.clients.create({
      ...TEST_CLIENT,
      firstName: 'Ana',
      lastName: 'Última',
      documentNumber: '30999888',
    });
    const secondJob = context.database.opticalJobs.createWithTreatments({
      clientId: secondClient.id,
      jobNumber: 'F-002',
    });
    const secondReceipt = context.database.deliveryReceipts.create({
      ...ownerInput(secondJob.id),
      deliveredAt: '2026-10-18T16:30:00.000Z',
      recipientFullName: 'Ana Última',
    });

    const firstPage = context.database.deliveryReceipts.list({ limit: 1, offset: 0 });
    const secondPage = context.database.deliveryReceipts.list({ limit: 1, offset: 1 });
    expect(firstPage).toMatchObject({ total: 2, limit: 1, offset: 0 });
    expect(firstPage.items.map((item) => item.id)).toEqual([secondReceipt.id]);
    expect(secondPage.items.map((item) => item.id)).toEqual([firstReceipt.id]);
  });

  it('busca por cliente, comprobante, identificador y número de ficha', () => {
    const { job } = fixture();
    const receipt = context.database.deliveryReceipts.create(ownerInput(job.id));
    for (const query of ['Jose Perez', receipt.receiptNumber, String(receipt.id), 'F-001']) {
      expect(context.database.deliveryReceipts.list({ query }).items).toHaveLength(1);
    }
    expect(context.database.deliveryReceipts.list({ query: 'inexistente' }).items).toEqual([]);
  });

  it('combina filtros de estado y fecha sin modificar comprobantes históricos', () => {
    const { job } = fixture();
    const receipt = context.database.deliveryReceipts.create(ownerInput(job.id));
    context.database.deliveryReceipts.addEvent({
      receiptId: receipt.id,
      type: 'CORRECTION_NOTE',
      reason: 'Aclaración para el filtro.',
    });
    const secondClient = context.database.clients.create({
      ...TEST_CLIENT,
      firstName: 'Retiro',
      lastName: 'Anulado',
      documentNumber: '30888777',
    });
    const secondJob = context.database.opticalJobs.createWithTreatments({
      clientId: secondClient.id,
      jobNumber: 'F-ANULADA',
    });
    const annulled = context.database.deliveryReceipts.create({
      ...ownerInput(secondJob.id),
      recipientFullName: 'Retiro Anulado',
    });
    context.database.deliveryReceipts.addEvent({
      receiptId: annulled.id,
      type: 'ANNULLED',
      reason: 'Anulación para el filtro.',
    });

    expect(
      context.database.deliveryReceipts.list({
        status: 'CORRECTED',
        dateFrom: '2026-10-17',
        dateTo: '2026-10-17',
      }).items,
    ).toMatchObject([{ id: receipt.id, status: 'CORRECTED' }]);
    expect(context.database.deliveryReceipts.list({ status: 'ANNULLED' }).items).toMatchObject([
      { id: annulled.id, status: 'ANNULLED' },
    ]);
    expect(context.database.deliveryReceipts.getById(receipt.id)).toMatchObject({
      receiptNumber: 'RET-000001',
      events: [{ type: 'CORRECTION_NOTE' }],
    });
  });
});

describe('migración incremental 006 desde un esquema histórico', () => {
  it('preserva cliente y ficha creados con 001–005', () => {
    const context = createTestDatabase();
    context.database.close();
    const raw = openSqliteDatabase(context.filePath);
    raw.exec(
      'DROP TABLE delivery_receipt_events; DROP TABLE delivery_receipts; DROP TABLE delivery_receipt_sequence;',
    );
    raw.prepare("DELETE FROM schema_migrations WHERE id = '006_delivery_receipts'").run();
    raw.prepare("INSERT INTO clients (first_name,last_name) VALUES ('Histórico','Seguro')").run();
    raw
      .prepare("INSERT INTO optical_jobs (client_id,product) VALUES (1,'Producto anterior')")
      .run();
    raw.close();
    const reopened = ApplicationDatabase.open(context.filePath);
    context.database = reopened;
    expect(reopened.clients.getById(1)?.firstName).toBe('Histórico');
    expect(reopened.opticalJobs.getById(1)?.product).toBe('Producto anterior');
    expect(reopened.deliveryReceipts.getByJobId(1)).toBeNull();
    destroyTestDatabase(context);
  });
});
