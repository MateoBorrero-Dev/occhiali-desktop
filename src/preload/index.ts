import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-contracts';
import type { AppInfo, ClientApi, PrescriptionApi } from '../shared/ipc-contracts';

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

const opticaApi = Object.freeze({
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  clients,
  prescriptions,
});

contextBridge.exposeInMainWorld('optica', opticaApi);
