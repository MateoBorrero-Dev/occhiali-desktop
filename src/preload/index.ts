import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-contracts';
import type {
  AppInfo,
  ClientApi,
  OpticalJobApi,
  PrescriptionApi,
  TreatmentApi,
  DashboardApi,
  SearchApi,
  SecurityApi,
  BackupApi,
  DeliveryReceiptApi,
} from '../shared/ipc-contracts';

const clientMethods: ClientApi = {
  list: (request = {}) => ipcRenderer.invoke(IPC_CHANNELS.clientsList, request),
  get: (id) => ipcRenderer.invoke(IPC_CHANNELS.clientsGet, id),
  create: (input) => ipcRenderer.invoke(IPC_CHANNELS.clientsCreate, input),
  update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.clientsUpdate, id, input),
  archive: (id) => ipcRenderer.invoke(IPC_CHANNELS.clientsArchive, id),
  restore: (id) => ipcRenderer.invoke(IPC_CHANNELS.clientsRestore, id),
};

const clients = Object.freeze(clientMethods);

const prescriptionMethods: PrescriptionApi = {
  list: (request = {}) => ipcRenderer.invoke(IPC_CHANNELS.prescriptionsList, request),
  listByClient: (request) => ipcRenderer.invoke(IPC_CHANNELS.prescriptionsListByClient, request),
  get: (id) => ipcRenderer.invoke(IPC_CHANNELS.prescriptionsGet, id),
  create: (input) => ipcRenderer.invoke(IPC_CHANNELS.prescriptionsCreate, input),
  createIntegrated: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.prescriptionsCreateIntegrated, input),
  correct: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.prescriptionsCorrect, id, input),
  revisions: (id) => ipcRenderer.invoke(IPC_CHANNELS.prescriptionsRevisions, id),
};

const prescriptions = Object.freeze(prescriptionMethods);

const opticalJobMethods: OpticalJobApi = {
  list: (request = {}) => ipcRenderer.invoke(IPC_CHANNELS.opticalJobsList, request),
  listByClient: (request) => ipcRenderer.invoke(IPC_CHANNELS.opticalJobsListByClient, request),
  listByPrescription: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.opticalJobsListByPrescription, request),
  get: (id) => ipcRenderer.invoke(IPC_CHANNELS.opticalJobsGet, id),
  create: (input) => ipcRenderer.invoke(IPC_CHANNELS.opticalJobsCreate, input),
  update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.opticalJobsUpdate, id, input),
};

const opticalJobs = Object.freeze(opticalJobMethods);

const treatmentMethods: TreatmentApi = {
  list: () => ipcRenderer.invoke(IPC_CHANNELS.treatmentsList),
};

const treatments = Object.freeze(treatmentMethods);

const deliveryReceiptMethods: DeliveryReceiptApi = {
  get: (id) => ipcRenderer.invoke(IPC_CHANNELS.deliveryReceiptsGet, id),
  getByJob: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.deliveryReceiptsGetByJob, jobId),
  create: (input) => ipcRenderer.invoke(IPC_CHANNELS.deliveryReceiptsCreate, input),
  addEvent: (input) => ipcRenderer.invoke(IPC_CHANNELS.deliveryReceiptsAddEvent, input),
  exportPdf: (id) => ipcRenderer.invoke(IPC_CHANNELS.deliveryReceiptsExportPdf, id),
};
const deliveryReceipts = Object.freeze(deliveryReceiptMethods);

const dashboard = Object.freeze<DashboardApi>({
  getSummary: () => ipcRenderer.invoke(IPC_CHANNELS.dashboardSummary),
});

const search = Object.freeze<SearchApi>({
  global: (request) => ipcRenderer.invoke(IPC_CHANNELS.globalSearch, request),
});
const security = Object.freeze<SecurityApi>({
  status: () => ipcRenderer.invoke(IPC_CHANNELS.securityStatus),
  setup: (password, inactivityMinutes) =>
    ipcRenderer.invoke(IPC_CHANNELS.securitySetup, password, inactivityMinutes),
  login: (password) => ipcRenderer.invoke(IPC_CHANNELS.securityLogin, password),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.securityLogout),
  touch: () => ipcRenderer.invoke(IPC_CHANNELS.securityTouch),
  changePassword: (currentPassword, nextPassword) =>
    ipcRenderer.invoke(IPC_CHANNELS.securityChangePassword, currentPassword, nextPassword),
  setInactivity: (minutes) => ipcRenderer.invoke(IPC_CHANNELS.securitySetInactivity, minutes),
});
const backup = Object.freeze<BackupApi>({
  status: () => ipcRenderer.invoke(IPC_CHANNELS.backupStatus),
  history: () => ipcRenderer.invoke(IPC_CHANNELS.backupHistory),
  configure: (input) => ipcRenderer.invoke(IPC_CHANNELS.backupConfigure, input),
  setAutomaticCredential: (recoveryPassword) =>
    ipcRenderer.invoke(IPC_CHANNELS.backupSetAutomaticCredential, recoveryPassword),
  clearAutomaticCredential: () => ipcRenderer.invoke(IPC_CHANNELS.backupClearAutomaticCredential),
  selectExportDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.backupSelectExportDirectory),
  create: (recoveryPassword) => ipcRenderer.invoke(IPC_CHANNELS.backupCreate, recoveryPassword),
  openDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.backupOpenDirectory),
  selectRestoreFile: () => ipcRenderer.invoke(IPC_CHANNELS.backupSelectRestoreFile),
  verify: (recoveryPassword) => ipcRenderer.invoke(IPC_CHANNELS.backupVerify, recoveryPassword),
  restore: (recoveryPassword, confirmed) =>
    ipcRenderer.invoke(IPC_CHANNELS.backupRestore, recoveryPassword, confirmed),
});

const opticaApi = Object.freeze({
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  clients,
  prescriptions,
  opticalJobs,
  treatments,
  deliveryReceipts,
  dashboard,
  search,
  security,
  backup,
});

contextBridge.exposeInMainWorld('optica', opticaApi);
