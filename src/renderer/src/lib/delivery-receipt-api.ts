import type {
  DeliveryReceiptIpcError,
  DeliveryReceiptIpcResult,
} from '../../../shared/ipc-contracts';
import type { DeliveryReceiptStatus, DeliveryRecipientType } from '../../../shared/database-models';

export class DeliveryReceiptRequestError extends Error {
  public constructor(public readonly detail: DeliveryReceiptIpcError) {
    super(detail.message);
    this.name = 'DeliveryReceiptRequestError';
  }
}

export function unwrapDeliveryReceiptResult<T>(result: DeliveryReceiptIpcResult<T>): T {
  if (!result.ok) throw new DeliveryReceiptRequestError(result.error);
  return result.data;
}

const timestampFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDeliveryTimestamp(value: string): string {
  return timestampFormatter.format(new Date(value));
}

export function deliveryStatusLabel(value: DeliveryReceiptStatus): string {
  if (value === 'ANNULLED') return 'Anulado';
  if (value === 'CORRECTED') return 'Con aclaraciones';
  return 'Confirmado';
}

export function recipientTypeLabel(value: DeliveryRecipientType): string {
  return value === 'OWNER' ? 'Cliente titular' : 'Tercero autorizado';
}
