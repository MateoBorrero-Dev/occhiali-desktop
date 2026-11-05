import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeliveryReceiptIpcHandlers } from '../src/main/ipc/delivery-receipt-handlers';
import { DeliveryReceiptWhatsAppService } from '../src/main/documents/delivery-receipt-whatsapp';
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
  const pdfPreparer = {
    prepareForShare: vi.fn(() =>
      Promise.resolve({
        filePath: 'C:\\Temp\\Occhiali-WhatsApp-test\\Occhiali-Retiro-RET-000001.pdf',
        fileName: 'Occhiali-Retiro-RET-000001.pdf',
      }),
    ),
  };
  const external = {
    revealFile: vi.fn(),
    open: vi.fn(() => Promise.resolve()),
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
    const whatsapp = new DeliveryReceiptWhatsAppService(pdfPreparer, external);
    return {
      job,
      handlers: createDeliveryReceiptIpcHandlers(context.database, exporter, whatsapp),
    };
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

  it('prepara el PDF y abre solamente un enlace autorizado sin modificar el comprobante', async () => {
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

    const before = handlers.get(created.data.id);
    expect(
      await handlers.shareWhatsApp(created.data.id, {
        phone: '+54 9 351 1234567',
        message: 'Hola, comprobante listo.\nAdjuntalo manualmente.',
      }),
    ).toEqual({
      ok: true,
      data: {
        fileName: 'Occhiali-Retiro-RET-000001.pdf',
        normalizedPhone: '5493511234567',
      },
    });
    expect(pdfPreparer.prepareForShare).toHaveBeenCalledWith(created.data);
    expect(external.revealFile).toHaveBeenCalledWith(
      'C:\\Temp\\Occhiali-WhatsApp-test\\Occhiali-Retiro-RET-000001.pdf',
    );
    expect(external.open).toHaveBeenCalledWith(
      'https://wa.me/5493511234567?text=Hola%2C%20comprobante%20listo.%0AAdjuntalo%20manualmente.',
    );
    expect(handlers.get(created.data.id)).toEqual(before);
  });

  it('rechaza teléfonos ambiguos, campos extra y argumentos adicionales antes de preparar archivos', async () => {
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

    const invalidPhone = await handlers.shareWhatsApp(created.data.id, {
      phone: '11 4000 5000',
      message: 'Mensaje',
    });
    expect(invalidPhone).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    if (invalidPhone.ok) throw new Error('El teléfono ambiguo no fue rechazado.');
    expect(typeof invalidPhone.error.fields?.phone).toBe('string');
    expect(
      await handlers.shareWhatsApp(created.data.id, {
        phone: '+54 9 351 1234567',
        message: 'Mensaje',
        url: 'https://ejemplo.invalid',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(
      await handlers.shareWhatsApp(
        created.data.id,
        { phone: '+54 9 351 1234567', message: 'Mensaje' },
        'extra',
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(pdfPreparer.prepareForShare).not.toHaveBeenCalled();
  });

  it('diferencia fallos de PDF y apertura sin filtrar rutas privadas', async () => {
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
    const input = { phone: '+54 9 351 1234567', message: 'Mensaje seguro' };

    pdfPreparer.prepareForShare.mockRejectedValueOnce(new Error('C:\\privado\\fallo.pdf'));
    expect(await handlers.shareWhatsApp(created.data.id, input)).toEqual({
      ok: false,
      error: { code: 'SHARE_PDF', message: 'No se pudo preparar el PDF para compartir.' },
    });

    external.open.mockRejectedValueOnce(new Error('aplicación privada'));
    expect(await handlers.shareWhatsApp(created.data.id, input)).toEqual({
      ok: false,
      error: {
        code: 'SHARE_OPEN',
        message: 'El PDF quedó preparado, pero no se pudo abrir WhatsApp.',
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

  it('expone el listado paginado y valida filtros sin aceptar campos adicionales', () => {
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
      handlers.list({ query: 'RET-000001', status: 'CONFIRMED', limit: 10, offset: 0 }),
    ).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ id: created.data.id, jobNumber: null }] },
    });
    expect(handlers.list({ status: 'BORRADO' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(handlers.list({}, 'extra')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });
});
