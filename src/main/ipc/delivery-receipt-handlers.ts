import type { ApplicationDatabase } from '../database';
import {
  DeliveryReceiptJobNotFoundError,
  DeliveryReceiptNotFoundError,
  DeliveryReceiptStateError,
  DuplicateDeliveryReceiptError,
} from '../database/repositories/delivery-receipt-repository';
import type { DeliveryReceiptPdfExporter } from '../documents/delivery-receipt-pdf';
import {
  DeliveryReceiptValidationError,
  parseCreateDeliveryReceiptInput,
  parseDeliveryReceiptEventInput,
  parseDeliveryReceiptId,
} from '../../shared/delivery-receipt-validation';
import { assertArgumentCount, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { DeliveryReceiptIpcError, DeliveryReceiptIpcResult } from '../../shared/ipc-contracts';
import type { DeliveryReceipt, DeliveryReceiptExportResult } from '../../shared/database-models';

export interface DeliveryReceiptIpcHandlers {
  get: (...args: unknown[]) => DeliveryReceiptIpcResult<DeliveryReceipt>;
  getByJob: (...args: unknown[]) => DeliveryReceiptIpcResult<DeliveryReceipt | null>;
  create: (...args: unknown[]) => DeliveryReceiptIpcResult<DeliveryReceipt>;
  addEvent: (...args: unknown[]) => DeliveryReceiptIpcResult<DeliveryReceipt>;
  exportPdf: (...args: unknown[]) => Promise<DeliveryReceiptIpcResult<DeliveryReceiptExportResult>>;
}

function safeError(error: unknown, exportOperation = false): DeliveryReceiptIpcError {
  if (error instanceof DeliveryReceiptValidationError)
    return {
      code: 'VALIDATION',
      message: 'Revisá los datos ingresados.',
      fields: Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message])),
    };
  if (error instanceof TypeError)
    return { code: 'VALIDATION', message: 'La solicitud no es válida.' };
  if (error instanceof DeliveryReceiptNotFoundError)
    return { code: 'NOT_FOUND', message: error.message };
  if (error instanceof DeliveryReceiptJobNotFoundError)
    return { code: 'JOB_NOT_FOUND', message: error.message };
  if (error instanceof DuplicateDeliveryReceiptError)
    return { code: 'DUPLICATE', message: error.message };
  if (error instanceof DeliveryReceiptStateError)
    return { code: 'INVALID_STATE', message: error.message };
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')
  )
    return { code: 'CONFLICT', message: 'El almacenamiento está ocupado. Volvé a intentarlo.' };
  return exportOperation
    ? {
        code: 'EXPORT',
        message: 'No se pudo exportar el PDF. Revisá el destino e intentá nuevamente.',
      }
    : { code: 'PERSISTENCE', message: 'No se pudo completar la operación.' };
}

function perform<T>(operation: () => T): DeliveryReceiptIpcResult<T> {
  try {
    return { ok: true, data: operation() };
  } catch (error: unknown) {
    return { ok: false, error: safeError(error) };
  }
}

export function createDeliveryReceiptIpcHandlers(
  database: ApplicationDatabase,
  pdf: DeliveryReceiptPdfExporter,
): DeliveryReceiptIpcHandlers {
  return {
    get: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.deliveryReceiptsGet, args, 1);
        const receipt = database.deliveryReceipts.getById(parseDeliveryReceiptId(args[0]));
        if (!receipt) throw new DeliveryReceiptNotFoundError();
        return receipt;
      }),
    getByJob: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.deliveryReceiptsGetByJob, args, 1);
        return database.deliveryReceipts.getByJobId(
          parseDeliveryReceiptId(args[0], 'opticalJobId'),
        );
      }),
    create: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.deliveryReceiptsCreate, args, 1);
        return database.deliveryReceipts.create(parseCreateDeliveryReceiptInput(args[0]));
      }),
    addEvent: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.deliveryReceiptsAddEvent, args, 1);
        return database.deliveryReceipts.addEvent(parseDeliveryReceiptEventInput(args[0]));
      }),
    exportPdf: async (...args) => {
      try {
        assertArgumentCount(IPC_CHANNELS.deliveryReceiptsExportPdf, args, 1);
        const receipt = database.deliveryReceipts.getById(parseDeliveryReceiptId(args[0]));
        if (!receipt) throw new DeliveryReceiptNotFoundError();
        return { ok: true, data: await pdf.export(receipt) };
      } catch (error: unknown) {
        return { ok: false, error: safeError(error, true) };
      }
    },
  };
}
