import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeliveryReceipt } from '../../src/shared/database-models';
import { deliveryDateBoundaryIso } from '../../src/shared/delivery-receipt-time';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './helpers';
import type { TestDatabase } from './helpers';

describe('listado SQLite de retiros', () => {
  let context: TestDatabase;
  let confirmed: DeliveryReceipt;
  let corrected: DeliveryReceipt;
  let annulled: DeliveryReceipt;

  beforeEach(() => {
    context = createTestDatabase();

    const createReceipt = (
      index: number,
      firstName: string,
      lastName: string,
      jobNumber: string,
      deliveredAt: string,
    ): DeliveryReceipt => {
      const client = context.database.clients.create({
        ...TEST_CLIENT,
        firstName,
        lastName,
        documentNumber: `3000000${index}`,
      });
      const job = context.database.opticalJobs.createWithTreatments({
        clientId: client.id,
        jobNumber,
        product: `Producto ${index}`,
      });
      return context.database.deliveryReceipts.create({
        opticalJobId: job.id,
        deliveredAt,
        recipientType: 'OWNER',
        recipientFullName: `${firstName} ${lastName}`,
        deliveredBy: 'Responsable QA',
        deliveryConfirmed: true,
      });
    };

    confirmed = createReceipt(1, 'José', 'Pérez', 'F-%_01', '2026-10-20T02:59:59.000Z');
    corrected = createReceipt(2, 'Ana', 'Ñandú', 'F-002', '2026-10-20T03:00:00.000Z');
    annulled = createReceipt(3, 'Lucía', 'Sur', 'F-003', '2026-10-21T02:59:59.000Z');
    context.database.deliveryReceipts.addEvent({
      receiptId: corrected.id,
      type: 'CORRECTION_NOTE',
      reason: 'Aclaración controlada.',
    });
    context.database.deliveryReceipts.addEvent({
      receiptId: annulled.id,
      type: 'ANNULLED',
      reason: 'Anulación controlada.',
    });
  });

  afterEach(() => {
    destroyTestDatabase(context);
  });

  it('lista sin filtros con orden estable y resumen histórico', () => {
    const page = context.database.deliveryReceipts.list();
    expect(page).toMatchObject({ total: 3, limit: 25, offset: 0 });
    expect(page.items.map((item) => item.id)).toEqual([annulled.id, corrected.id, confirmed.id]);
  });

  it('busca solamente por cliente sin distinguir acentos', () => {
    expect(context.database.deliveryReceipts.list({ query: 'Jose Perez' }).items).toMatchObject([
      { id: confirmed.id, clientFirstName: 'José', clientLastName: 'Pérez' },
    ]);
    expect(context.database.deliveryReceipts.list({ query: 'Nandu' }).items).toMatchObject([
      { id: corrected.id, clientLastName: 'Ñandú' },
    ]);
  });

  it('trata porcentajes, guiones bajos y comillas como texto de búsqueda', () => {
    expect(context.database.deliveryReceipts.list({ query: '%_' }).items).toMatchObject([
      { id: confirmed.id, jobNumber: 'F-%_01' },
    ]);
    expect(context.database.deliveryReceipts.list({ query: "Pérez' OR 1=1 --" }).items).toEqual([]);
  });

  it('filtra solamente por estado', () => {
    expect(context.database.deliveryReceipts.list({ status: 'CORRECTED' }).items).toMatchObject([
      { id: corrected.id, status: 'CORRECTED' },
    ]);
    expect(context.database.deliveryReceipts.list({ status: 'ANNULLED' }).items).toMatchObject([
      { id: annulled.id, status: 'ANNULLED' },
    ]);
  });

  it('filtra solamente desde la medianoche local de Córdoba', () => {
    expect(deliveryDateBoundaryIso('2026-10-20', 0)).toBe('2026-10-20T03:00:00.000Z');
    expect(context.database.deliveryReceipts.list({ dateFrom: '2026-10-20' }).items).toMatchObject([
      { id: annulled.id },
      { id: corrected.id },
    ]);
  });

  it('filtra solamente hasta el final del día local de Córdoba', () => {
    expect(context.database.deliveryReceipts.list({ dateTo: '2026-10-19' }).items).toMatchObject([
      { id: confirmed.id },
    ]);
    expect(context.database.deliveryReceipts.list({ dateTo: '2026-10-20' }).items).toMatchObject([
      { id: annulled.id },
      { id: corrected.id },
      { id: confirmed.id },
    ]);
  });

  it('combina búsqueda, estado y rango de fecha', () => {
    expect(
      context.database.deliveryReceipts.list({
        query: 'Nandu',
        status: 'CORRECTED',
        dateFrom: '2026-10-20',
        dateTo: '2026-10-20',
      }).items,
    ).toMatchObject([{ id: corrected.id }]);
  });

  it('pagina la primera página, la última y una página vacía', () => {
    const first = context.database.deliveryReceipts.list({ limit: 2, offset: 0 });
    const last = context.database.deliveryReceipts.list({ limit: 2, offset: 2 });
    const empty = context.database.deliveryReceipts.list({ limit: 2, offset: 4 });
    expect(first).toMatchObject({ total: 3, limit: 2, offset: 0 });
    expect(first.items.map((item) => item.id)).toEqual([annulled.id, corrected.id]);
    expect(last.items.map((item) => item.id)).toEqual([confirmed.id]);
    expect(empty).toMatchObject({ total: 3, items: [] });
  });
});
