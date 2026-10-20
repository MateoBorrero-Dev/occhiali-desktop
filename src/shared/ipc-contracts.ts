import type {
  Client,
  ClientListPage,
  ClientListRequest,
  CreateClientInput,
  CorrectPrescriptionInput,
  CreatePrescriptionInput,
  CreateOpticalJobInput,
  OpticalJob,
  OpticalJobListPage,
  OpticalJobListRequest,
  OpticalJobsByClientRequest,
  OpticalJobsByPrescriptionRequest,
  Prescription,
  PrescriptionListPage,
  PrescriptionListRequest,
  PrescriptionRevision,
  Treatment,
  PrescriptionsByClientRequest,
  UpdateClientInput,
  UpdateOpticalJobInput,
  DashboardSummary,
  GlobalSearchRequest,
  GlobalSearchResults,
  SecurityStatus,
  BackupStatus,
  BackupHistorySnapshot,
  BackupMetadata,
  BackupOperationResult,
  CreateDeliveryReceiptEventInput,
  CreateDeliveryReceiptInput,
  DeliveryReceipt,
  DeliveryReceiptExportResult,
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
  opticalJobsList: 'optical-jobs:list',
  opticalJobsListByClient: 'optical-jobs:list-by-client',
  opticalJobsListByPrescription: 'optical-jobs:list-by-prescription',
  opticalJobsGet: 'optical-jobs:get',
  opticalJobsCreate: 'optical-jobs:create',
  opticalJobsUpdate: 'optical-jobs:update',
  treatmentsList: 'treatments:list',
  deliveryReceiptsGet: 'delivery-receipts:get',
  deliveryReceiptsGetByJob: 'delivery-receipts:get-by-job',
  deliveryReceiptsCreate: 'delivery-receipts:create',
  deliveryReceiptsAddEvent: 'delivery-receipts:add-event',
  deliveryReceiptsExportPdf: 'delivery-receipts:export-pdf',
  dashboardSummary: 'dashboard:get-summary',
  globalSearch: 'search:global',
  securityStatus: 'security:status',
  securitySetup: 'security:setup',
  securityLogin: 'security:login',
  securityLogout: 'security:logout',
  securityTouch: 'security:touch',
  securityChangePassword: 'security:change-password',
  securitySetInactivity: 'security:set-inactivity',
  backupStatus: 'backup:status',
  backupHistory: 'backup:history',
  backupConfigure: 'backup:configure',
  backupSetAutomaticCredential: 'backup:set-automatic-credential',
  backupClearAutomaticCredential: 'backup:clear-automatic-credential',
  backupSelectExportDirectory: 'backup:select-export-directory',
  backupCreate: 'backup:create',
  backupOpenDirectory: 'backup:open-directory',
  backupSelectRestoreFile: 'backup:select-restore-file',
  backupVerify: 'backup:verify',
  backupRestore: 'backup:restore',
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

export type OpticalJobIpcErrorCode =
  | 'VALIDATION'
  | 'DUPLICATE_JOB_NUMBER'
  | 'NOT_FOUND'
  | 'CLIENT_NOT_FOUND'
  | 'ARCHIVED_CLIENT'
  | 'PRESCRIPTION_NOT_FOUND'
  | 'PRESCRIPTION_MISMATCH'
  | 'TREATMENT_NOT_FOUND'
  | 'CONFLICT'
  | 'PERSISTENCE';

export interface OpticalJobIpcError {
  code: OpticalJobIpcErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export type OpticalJobIpcResult<T> =
  { ok: true; data: T } | { ok: false; error: OpticalJobIpcError };

export interface OpticalJobApi {
  list: (request?: OpticalJobListRequest) => Promise<OpticalJobIpcResult<OpticalJobListPage>>;
  listByClient: (
    request: OpticalJobsByClientRequest,
  ) => Promise<OpticalJobIpcResult<OpticalJobListPage>>;
  listByPrescription: (
    request: OpticalJobsByPrescriptionRequest,
  ) => Promise<OpticalJobIpcResult<OpticalJobListPage>>;
  get: (id: number) => Promise<OpticalJobIpcResult<OpticalJob>>;
  create: (input: CreateOpticalJobInput) => Promise<OpticalJobIpcResult<OpticalJob>>;
  update: (id: number, input: UpdateOpticalJobInput) => Promise<OpticalJobIpcResult<OpticalJob>>;
}

export interface TreatmentApi {
  list: () => Promise<OpticalJobIpcResult<Treatment[]>>;
}

export type DeliveryReceiptIpcErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'JOB_NOT_FOUND'
  | 'DUPLICATE'
  | 'INVALID_STATE'
  | 'CONFLICT'
  | 'PERSISTENCE'
  | 'EXPORT';

export interface DeliveryReceiptIpcError {
  code: DeliveryReceiptIpcErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export type DeliveryReceiptIpcResult<T> =
  { ok: true; data: T } | { ok: false; error: DeliveryReceiptIpcError };

export interface DeliveryReceiptApi {
  get: (id: number) => Promise<DeliveryReceiptIpcResult<DeliveryReceipt>>;
  getByJob: (jobId: number) => Promise<DeliveryReceiptIpcResult<DeliveryReceipt | null>>;
  create: (input: CreateDeliveryReceiptInput) => Promise<DeliveryReceiptIpcResult<DeliveryReceipt>>;
  addEvent: (
    input: CreateDeliveryReceiptEventInput,
  ) => Promise<DeliveryReceiptIpcResult<DeliveryReceipt>>;
  exportPdf: (id: number) => Promise<DeliveryReceiptIpcResult<DeliveryReceiptExportResult>>;
}

export type QueryIpcErrorCode = 'VALIDATION' | 'CONFLICT' | 'PERSISTENCE';

export interface QueryIpcError {
  code: QueryIpcErrorCode;
  message: string;
}

export type QueryIpcResult<T> = { ok: true; data: T } | { ok: false; error: QueryIpcError };

export interface DashboardApi {
  getSummary: () => Promise<QueryIpcResult<DashboardSummary>>;
}

export interface SearchApi {
  global: (request: GlobalSearchRequest) => Promise<QueryIpcResult<GlobalSearchResults>>;
}

export type SecurityResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };

export interface SecurityApi {
  status: () => Promise<SecurityResult<SecurityStatus>>;
  setup: (password: string, inactivityMinutes: number) => Promise<SecurityResult<SecurityStatus>>;
  login: (password: string) => Promise<SecurityResult<SecurityStatus>>;
  logout: () => Promise<SecurityResult<SecurityStatus>>;
  touch: () => Promise<SecurityResult<SecurityStatus>>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<SecurityResult<true>>;
  setInactivity: (minutes: number) => Promise<SecurityResult<SecurityStatus>>;
}

export interface BackupApi {
  status: () => Promise<SecurityResult<BackupStatus>>;
  history: () => Promise<SecurityResult<BackupHistorySnapshot>>;
  configure: (input: {
    automaticEnabled: boolean;
    automaticHour: number;
    retentionCount: number;
  }) => Promise<SecurityResult<BackupStatus>>;
  setAutomaticCredential: (recoveryPassword: string) => Promise<SecurityResult<BackupStatus>>;
  clearAutomaticCredential: () => Promise<SecurityResult<BackupStatus>>;
  selectExportDirectory: () => Promise<SecurityResult<BackupStatus>>;
  create: (recoveryPassword: string) => Promise<SecurityResult<BackupOperationResult>>;
  openDirectory: () => Promise<SecurityResult<true>>;
  selectRestoreFile: () => Promise<SecurityResult<{ fileName: string } | null>>;
  verify: (recoveryPassword: string) => Promise<SecurityResult<BackupMetadata>>;
  restore: (
    recoveryPassword: string,
    confirmed: boolean,
  ) => Promise<SecurityResult<{ restartRequired: true }>>;
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
