import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupOldDeliveryReceiptShareFiles,
  DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX,
  DELIVERY_RECEIPT_SHARE_MARKER_CONTENT,
  DELIVERY_RECEIPT_SHARE_MARKER_FILE,
  DELIVERY_RECEIPT_SHARE_MAX_AGE_MS,
  DeliveryReceiptShareFileStore,
} from '../src/main/documents/delivery-receipt-share-files';
import type { DeliveryReceipt } from '../src/shared/database-models';

const RECEIPT: DeliveryReceipt = {
  id: 1,
  receiptNumber: 'RET-000001',
  opticalJobId: 2,
  deliveredAt: '2026-11-05T12:00:00.000Z',
  registeredAt: '2026-11-05T12:01:00.000Z',
  status: 'CONFIRMED',
  clientFirstName: 'Cliente',
  clientLastName: 'Temporal',
  clientDocumentNumber: null,
  clientPhone: null,
  jobNumber: 'F-1',
  product: 'Anteojos',
  lens: null,
  brand: null,
  frameCondition: null,
  frameMaterial: null,
  frameModel: null,
  productColor: null,
  supplier: null,
  colorType: null,
  productObservations: null,
  treatmentNames: [],
  recipientType: 'OWNER',
  recipientFullName: 'Cliente Temporal',
  recipientDocumentNumber: null,
  recipientRelationship: null,
  authorizationReference: null,
  authorizationConfirmed: false,
  deliveredBy: 'Responsable',
  deliveryNotes: null,
  deliveryConfirmed: true,
  events: [],
};

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'occhiali-share-files-test-'));
  roots.push(root);
  return root;
}

async function expectExists(filePath: string): Promise<void> {
  await expect(access(filePath)).resolves.toBeUndefined();
}

async function markOwned(directory: string): Promise<void> {
  await writeFile(
    join(directory, DELIVERY_RECEIPT_SHARE_MARKER_FILE),
    DELIVERY_RECEIPT_SHARE_MARKER_CONTENT,
  );
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('archivos temporales para WhatsApp', () => {
  it('elimina sólo PDFs antiguos propios y preserva archivos recientes o ajenos', async () => {
    const root = await createRoot();
    const oldDirectory = join(root, `${DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX}antiguo`);
    const recentDirectory = join(root, `${DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX}reciente`);
    const unmarkedDirectory = join(root, `${DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX}ajeno`);
    const foreignDirectory = join(root, 'Otra-Aplicacion');
    await Promise.all([
      mkdir(oldDirectory),
      mkdir(recentDirectory),
      mkdir(unmarkedDirectory),
      mkdir(foreignDirectory),
    ]);
    const oldPdf = join(oldDirectory, 'Occhiali-Retiro-RET-ANTIGUO.pdf');
    const foreignFile = join(oldDirectory, 'archivo-personal.txt');
    const recentPdf = join(recentDirectory, 'Occhiali-Retiro-RET-RECIENTE.pdf');
    const unmarkedPdf = join(unmarkedDirectory, 'Occhiali-Retiro-RET-AJENO.pdf');
    const otherApplicationPdf = join(foreignDirectory, 'Occhiali-Retiro-RET-AJENO.pdf');
    await Promise.all([
      markOwned(oldDirectory),
      markOwned(recentDirectory),
      writeFile(oldPdf, 'antiguo'),
      writeFile(foreignFile, 'no eliminar'),
      writeFile(recentPdf, 'reciente'),
      writeFile(unmarkedPdf, 'no eliminar'),
      writeFile(otherApplicationPdf, 'no eliminar'),
    ]);
    const now = Date.now();
    const oldTimestamp = new Date(now - DELIVERY_RECEIPT_SHARE_MAX_AGE_MS - 1_000);
    await utimes(oldPdf, oldTimestamp, oldTimestamp);

    await cleanupOldDeliveryReceiptShareFiles(root, { now });

    await expect(access(oldPdf)).rejects.toMatchObject({ code: 'ENOENT' });
    await expectExists(foreignFile);
    await expectExists(recentPdf);
    await expectExists(unmarkedPdf);
    await expectExists(otherApplicationPdf);
  });

  it('no interrumpe la operación cuando Windows impide eliminar un PDF antiguo', async () => {
    const root = await createRoot();
    const directory = join(root, `${DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX}bloqueado`);
    await mkdir(directory);
    await markOwned(directory);
    const oldPdf = join(directory, 'Occhiali-Retiro-RET-BLOQUEADO.pdf');
    await writeFile(oldPdf, 'bloqueado');
    const now = Date.now();
    const oldTimestamp = new Date(now - DELIVERY_RECEIPT_SHARE_MAX_AGE_MS - 1_000);
    await utimes(oldPdf, oldTimestamp, oldTimestamp);
    const denied = vi.fn(() =>
      Promise.reject(Object.assign(new Error('denegado'), { code: 'EACCES' })),
    );

    await expect(
      cleanupOldDeliveryReceiptShareFiles(root, { now, unlinkFile: denied }),
    ).resolves.toBeUndefined();
    expect(denied).toHaveBeenCalledWith(oldPdf);
    await expectExists(oldPdf);
  });

  it('reutiliza el PDF vigente y comprueba su contenido antes de volver a usarlo', async () => {
    const root = await createRoot();
    const store = new DeliveryReceiptShareFileStore(root);
    const render = vi.fn(() => Promise.resolve(Buffer.from('%PDF-archivo-seguro')));

    const first = await store.getOrCreate(RECEIPT, render);
    const oldTimestamp = new Date(Date.now() - DELIVERY_RECEIPT_SHARE_MAX_AGE_MS - 1_000);
    await utimes(first.filePath, oldTimestamp, oldTimestamp);
    const reused = await store.getOrCreate(RECEIPT, render);

    expect(reused).toEqual(first);
    expect(render).toHaveBeenCalledTimes(1);
    await expectExists(first.filePath);

    await writeFile(first.filePath, 'contenido alterado');
    const replaced = await store.getOrCreate(RECEIPT, render);
    expect(replaced.filePath).not.toBe(first.filePath);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('genera otro PDF cuando cambia el estado histórico del comprobante', async () => {
    const root = await createRoot();
    const store = new DeliveryReceiptShareFileStore(root);
    const render = vi.fn(() => Promise.resolve(Buffer.from('%PDF-con-estado')));
    const first = await store.getOrCreate(RECEIPT, render);
    const changed = await store.getOrCreate({ ...RECEIPT, status: 'ANNULLED' }, render);

    expect(changed.filePath).not.toBe(first.filePath);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
