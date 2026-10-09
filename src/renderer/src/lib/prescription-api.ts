import type {
  PrescriptionDistance,
  PrescriptionRevisionValue,
  PrescriptionValue,
} from '../../../shared/database-models';
import type { PrescriptionIpcError, PrescriptionIpcResult } from '../../../shared/ipc-contracts';

export class PrescriptionRequestError extends Error {
  public constructor(public readonly detail: PrescriptionIpcError) {
    super(detail.message);
    this.name = 'PrescriptionRequestError';
  }
}

export function unwrapPrescriptionResult<T>(result: PrescriptionIpcResult<T>): T {
  if (!result.ok) throw new PrescriptionRequestError(result.error);
  return result.data;
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timestampFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatPrescriptionDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

export function formatPrescriptionTimestamp(value: string): string {
  return timestampFormatter.format(new Date(value));
}

export function formatOpticalDecimal(value: string | null): string {
  if (value === null) return '—';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2).replace('.', ',')}`;
}

export function distanceLabel(distance: PrescriptionDistance): string {
  return distance === 'FAR' ? 'Lejos' : 'Cerca';
}

export type DisplayPrescriptionValue = PrescriptionValue | PrescriptionRevisionValue;
