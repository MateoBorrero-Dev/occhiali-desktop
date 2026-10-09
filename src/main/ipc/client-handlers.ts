import type { ApplicationDatabase } from '../database';
import {
  ClientValidationError,
  parseClientId,
  parseClientListRequest,
  parseCreateClientInput,
  parseUpdateClientInput,
} from '../../shared/client-validation';
import {
  ClientNotFoundError,
  DuplicateClientDocumentError,
} from '../database/repositories/client-repository';
import { assertArgumentCount, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { ClientIpcError, ClientIpcResult } from '../../shared/ipc-contracts';
import type { Client, ClientListPage } from '../../shared/database-models';

export interface ClientIpcHandlers {
  list: (...args: unknown[]) => ClientIpcResult<ClientListPage>;
  get: (...args: unknown[]) => ClientIpcResult<Client>;
  create: (...args: unknown[]) => ClientIpcResult<Client>;
  update: (...args: unknown[]) => ClientIpcResult<Client>;
  archive: (...args: unknown[]) => ClientIpcResult<Client>;
  restore: (...args: unknown[]) => ClientIpcResult<Client>;
}

function validationFields(error: ClientValidationError): Record<string, string> {
  return Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message]));
}

function isPersistenceConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')
  );
}

function clientError(error: unknown): ClientIpcError {
  if (error instanceof ClientValidationError) {
    return {
      code: 'VALIDATION',
      message: 'Revisá los datos ingresados.',
      fields: validationFields(error),
    };
  }
  if (error instanceof TypeError) {
    return { code: 'VALIDATION', message: 'La solicitud no es válida.' };
  }
  if (error instanceof DuplicateClientDocumentError) {
    return { code: 'DUPLICATE_DOCUMENT', message: error.message };
  }
  if (error instanceof ClientNotFoundError) {
    return { code: 'NOT_FOUND', message: error.message };
  }
  if (isPersistenceConflict(error)) {
    return {
      code: 'CONFLICT',
      message: 'El almacenamiento está ocupado. Esperá un momento y volvé a intentarlo.',
    };
  }
  return {
    code: 'PERSISTENCE',
    message: 'No se pudo completar la operación. Volvé a intentarlo.',
  };
}

function perform<T>(operation: () => T): ClientIpcResult<T> {
  try {
    return { ok: true, data: operation() };
  } catch (error: unknown) {
    return { ok: false, error: clientError(error) };
  }
}

export function createClientIpcHandlers(database: ApplicationDatabase): ClientIpcHandlers {
  return {
    list: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.clientsList, args, 1);
        return database.clients.search(parseClientListRequest(args[0]));
      }),
    get: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.clientsGet, args, 1);
        const client = database.clients.getById(parseClientId(args[0]));
        if (!client) throw new ClientNotFoundError();
        return client;
      }),
    create: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.clientsCreate, args, 1);
        return database.clients.create(parseCreateClientInput(args[0]));
      }),
    update: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.clientsUpdate, args, 2);
        return database.clients.update(parseClientId(args[0]), parseUpdateClientInput(args[1]));
      }),
    archive: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.clientsArchive, args, 1);
        return database.clients.archive(parseClientId(args[0]));
      }),
    restore: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.clientsRestore, args, 1);
        return database.clients.restore(parseClientId(args[0]));
      }),
  };
}
