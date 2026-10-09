import type { GlobalSearchRequest } from './database-models';

const SEARCH_FIELDS = new Set(['query', 'limit']);
export const GLOBAL_SEARCH_LIMITS = Object.freeze({
  query: 100,
  defaultResults: 5,
  maxResults: 10,
});

export class QueryValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new QueryValidationError('La búsqueda no es válida.');
  }
  return value as Record<string, unknown>;
}

export function parseGlobalSearchRequest(value: unknown): Required<GlobalSearchRequest> {
  const record = asRecord(value);
  for (const key of Object.keys(record)) {
    if (!SEARCH_FIELDS.has(key)) throw new QueryValidationError('La búsqueda no es válida.');
  }
  if (typeof record.query !== 'string') throw new QueryValidationError('Ingresá una búsqueda.');
  const query = record.query.trim().replace(/\s+/g, ' ');
  if (query.length < 2) throw new QueryValidationError('Ingresá al menos dos caracteres.');
  if (query.length > GLOBAL_SEARCH_LIMITS.query) {
    throw new QueryValidationError('La búsqueda es demasiado larga.');
  }
  const limit = record.limit ?? GLOBAL_SEARCH_LIMITS.defaultResults;
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > GLOBAL_SEARCH_LIMITS.maxResults
  ) {
    throw new QueryValidationError('El límite de resultados no es válido.');
  }
  return { query, limit };
}
