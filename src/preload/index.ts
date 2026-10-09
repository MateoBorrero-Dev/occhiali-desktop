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

const dashboard = Object.freeze<DashboardApi>({
  getSummary: () => ipcRenderer.invoke(IPC_CHANNELS.dashboardSummary),
});

const search = Object.freeze<SearchApi>({
  global: (request) => ipcRenderer.invoke(IPC_CHANNELS.globalSearch, request),
});

const opticaApi = Object.freeze({
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  clients,
  prescriptions,
  opticalJobs,
  treatments,
  dashboard,
  search,
});

contextBridge.exposeInMainWorld('optica', opticaApi);
