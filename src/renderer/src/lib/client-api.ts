import type { ClientIpcError, ClientIpcResult } from '../../../shared/ipc-contracts';

export class ClientRequestError extends Error {
  public constructor(public readonly detail: ClientIpcError) {
    super(detail.message);
    this.name = 'ClientRequestError';
  }
}

export function unwrapClientResult<T>(result: ClientIpcResult<T>): T {
  if (!result.ok) {
    throw new ClientRequestError(result.error);
  }
  return result.data;
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatCalendarDate(value: string | null): string {
  if (!value) return 'No informado';
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

export function formatTimestamp(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function displayValue(value: string | null): string {
  return value || 'No informado';
}
