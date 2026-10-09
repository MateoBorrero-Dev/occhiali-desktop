import type { QueryIpcResult } from '../../../shared/ipc-contracts';

export class QueryRequestError extends Error {
  public constructor(
    public readonly detail: Extract<QueryIpcResult<never>, { ok: false }>['error'],
  ) {
    super(detail.message);
    this.name = 'QueryRequestError';
  }
}

export function unwrapQueryResult<T>(result: QueryIpcResult<T>): T {
  if (!result.ok) throw new QueryRequestError(result.error);
  return result.data;
}
