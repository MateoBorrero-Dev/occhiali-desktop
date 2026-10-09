import type { ApplicationDatabase } from '../database';
import type { DashboardSummary, GlobalSearchResults } from '../../shared/database-models';
import { QueryValidationError, parseGlobalSearchRequest } from '../../shared/query-validation';
import { assertArgumentCount, assertNoArguments, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { QueryIpcError, QueryIpcResult } from '../../shared/ipc-contracts';

export interface QueryIpcHandlers {
  dashboard: (...args: unknown[]) => QueryIpcResult<DashboardSummary>;
  globalSearch: (...args: unknown[]) => QueryIpcResult<GlobalSearchResults>;
}

function safeError(error: unknown): QueryIpcError {
  if (error instanceof QueryValidationError || error instanceof TypeError) {
    return { code: 'VALIDATION', message: error.message };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')
  ) {
    return {
      code: 'CONFLICT',
      message: 'El almacenamiento está ocupado. Esperá un momento y volvé a intentarlo.',
    };
  }
  return { code: 'PERSISTENCE', message: 'No se pudo consultar la información local.' };
}

function perform<T>(operation: () => T): QueryIpcResult<T> {
  try {
    return { ok: true, data: operation() };
  } catch (error: unknown) {
    return { ok: false, error: safeError(error) };
  }
}

export function createQueryIpcHandlers(database: ApplicationDatabase): QueryIpcHandlers {
  return {
    dashboard: (...args) =>
      perform(() => {
        assertNoArguments(IPC_CHANNELS.dashboardSummary, args);
        return database.queries.dashboard();
      }),
    globalSearch: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.globalSearch, args, 1);
        return database.queries.globalSearch(parseGlobalSearchRequest(args[0]));
      }),
  };
}
