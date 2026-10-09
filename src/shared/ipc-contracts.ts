import type {
  Client,
  ClientListPage,
  ClientListRequest,
  CreateClientInput,
  CorrectPrescriptionInput,
  CreatePrescriptionInput,
  Prescription,
  PrescriptionListPage,
  PrescriptionListRequest,
  PrescriptionRevision,
  PrescriptionsByClientRequest,
  UpdateClientInput,
} from './database-models';

export const IPC_CHANNELS = {
  appInfo: 'app:get-info',
  clientsList: 'clients:list',
  clientsGet: 'clients:get',
  clientsCreate: 'clients:create',
  clientsUpdate: 'clients:update',
  clientsArchive: 'clients:archive',
  clientsRestore: 'clients:restore',
  prescriptionsList: 'prescriptions:list',
  prescriptionsListByClient: 'prescriptions:list-by-client',
  prescriptionsGet: 'prescriptions:get',
  prescriptionsCreate: 'prescriptions:create',
  prescriptionsCorrect: 'prescriptions:correct',
  prescriptionsRevisions: 'prescriptions:revisions',
} as const;

export interface AppInfo {
  name: string;
  version: string;
}

export type ClientIpcErrorCode =
  'VALIDATION' | 'DUPLICATE_DOCUMENT' | 'NOT_FOUND' | 'CONFLICT' | 'PERSISTENCE';

export interface ClientIpcError {
  code: ClientIpcErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export type ClientIpcResult<T> = { ok: true; data: T } | { ok: false; error: ClientIpcError };

export interface ClientApi {
  list: (request?: ClientListRequest) => Promise<ClientIpcResult<ClientListPage>>;
  get: (id: number) => Promise<ClientIpcResult<Client>>;
  create: (input: CreateClientInput) => Promise<ClientIpcResult<Client>>;
  update: (id: number, input: UpdateClientInput) => Promise<ClientIpcResult<Client>>;
  archive: (id: number) => Promise<ClientIpcResult<Client>>;
  restore: (id: number) => Promise<ClientIpcResult<Client>>;
}

export type PrescriptionIpcErrorCode =
  'VALIDATION' | 'NOT_FOUND' | 'CLIENT_NOT_FOUND' | 'ARCHIVED_CLIENT' | 'CONFLICT' | 'PERSISTENCE';

export interface PrescriptionIpcError {
  code: PrescriptionIpcErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export type PrescriptionIpcResult<T> =
  { ok: true; data: T } | { ok: false; error: PrescriptionIpcError };

export interface PrescriptionApi {
  list: (request?: PrescriptionListRequest) => Promise<PrescriptionIpcResult<PrescriptionListPage>>;
  listByClient: (
    request: PrescriptionsByClientRequest,
  ) => Promise<PrescriptionIpcResult<PrescriptionListPage>>;
  get: (id: number) => Promise<PrescriptionIpcResult<Prescription>>;
  create: (input: CreatePrescriptionInput) => Promise<PrescriptionIpcResult<Prescription>>;
  correct: (
    id: number,
    input: CorrectPrescriptionInput,
  ) => Promise<PrescriptionIpcResult<Prescription>>;
  revisions: (id: number) => Promise<PrescriptionIpcResult<PrescriptionRevision[]>>;
}

export function assertNoArguments(channel: string, args: readonly unknown[]): void {
  if (args.length !== 0) {
    throw new TypeError(`El canal ${channel} no acepta argumentos.`);
  }
}

export function assertArgumentCount(
  channel: string,
  args: readonly unknown[],
  expected: number,
): void {
  if (args.length !== expected) {
    throw new TypeError(`El canal ${channel} requiere ${expected} argumento(s).`);
  }
}
