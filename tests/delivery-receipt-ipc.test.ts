import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeliveryReceiptIpcHandlers } from '../src/main/ipc/delivery-receipt-handlers';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './database/helpers';
import type { TestDatabase } from './database/helpers';
import type { DeliveryReceipt, DeliveryReceiptExportResult } from '../src/shared/database-models';

describe('IPC de comprobantes de retiro', () => {
  let context: TestDatabase;
  const exporter = {
    export: vi.fn<(receipt: DeliveryReceipt) => Promise<DeliveryReceiptExportResult>>(() =>
      Promise.resolve({ canceled: false, fileName: 'Occhiali-Retiro-RET-000001.pdf' }),
    ),
  };
  beforeEach(() => {
    context = createTestDatabase();
  });
  afterEach(() => {
    vi.clearAllMocks();
    destroyTestDatabase(context);
  });

  function setup() {
    const client = context.database.clients.create(TEST_CLIENT);
    const job = context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      product: 'Producto IPC',
    });
    return { job, handlers: createDeliveryReceiptIpcHandlers(context.database, exporter) };
  }

  it('valida en Main, crea, consulta por ficha y evita duplicados', () => {
    const { job, handlers } = setup();
    expect(handlers.create({ opticalJobId: 'inválido' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    const created = handlers.create({
      opticalJobId: job.id,
      deliveredAt: '2026-10-17T17:00:00.000Z',
      recipientType: 'OWNER',
      recipientFullName: 'Cliente Prueba',
      deliveredBy: 'Responsable',
      deliveryConfirmed: true,
    });
    expect(created).toMatchObject({ ok: true, data: { receiptNumber: 'RET-000001' } });
    expect(handlers.getByJob(job.id)).toEqual(created);
    expect(
      handlers.create({
        opticalJobId: job.id,
        deliveredAt: '2026-10-17T17:00:00.000Z',
        recipientType: 'OWNER',
        recipientFullName: 'Cliente Prueba',
        deliveredBy: 'Responsable',
        deliveryConfirmed: true,
      }),
    ).toMatchObject({ ok: false, error: { code: 'DUPLICATE' } });
  });

  it('exporta el comprobante existente, devuelve cancelación y oculta errores internos', async () => {
    const { job, handlers } = setup();
    const created = handlers.create({
      opticalJobId: job.id,
      deliveredAt: '2026-10-17T17:00:00.000Z',
      recipientType: 'OWNER',
      recipientFullName: 'Cliente Prueba',
      deliveredBy: 'Responsable',
      deliveryConfirmed: true,
    });
    if (!created.ok) throw new Error('No se creó el comprobante de prueba.');
    expect(await handlers.exportPdf(created.data.id)).toMatchObject({
      ok: true,
      data: { canceled: false, fileName: 'Occhiali-Retiro-RET-000001.pdf' },
    });
    exporter.export.mockResolvedValueOnce({ canceled: true, fileName: null });
    expect(await handlers.exportPdf(created.data.id)).toEqual({
      ok: true,
      data: { canceled: true, fileName: null },
    });
    exporter.export.mockRejectedValueOnce(new Error('C:\\ruta-privada\\fallo'));
    expect(await handlers.exportPdf(created.data.id)).toEqual({
      ok: false,
      error: {
        code: 'EXPORT',
        message: 'No se pudo exportar el PDF. Revisá el destino e intentá nuevamente.',
      },
    });
  });

  it('registra trazabilidad y rechaza argumentos adicionales', () => {
    const { job, handlers } = setup();
    const created = handlers.create({
      opticalJobId: job.id,
      deliveredAt: '2026-10-17T17:00:00.000Z',
      recipientType: 'OWNER',
      recipientFullName: 'Cliente Prueba',
      deliveredBy: 'Responsable',
      deliveryConfirmed: true,
    });
    if (!created.ok) throw new Error('No se creó el comprobante de prueba.');
    expect(
      handlers.addEvent({
        receiptId: created.data.id,
        type: 'CORRECTION_NOTE',
        reason: 'Aclaración IPC',
      }),
    ).toMatchObject({ ok: true, data: { status: 'CORRECTED' } });
    expect(handlers.get(created.data.id, 'extra')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });
});
