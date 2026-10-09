import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-contracts';
import type { AppInfo, ClientApi } from '../shared/ipc-contracts';

const clientMethods: ClientApi = {
  list: (request = {}) => ipcRenderer.invoke(IPC_CHANNELS.clientsList, request),
  get: (id) => ipcRenderer.invoke(IPC_CHANNELS.clientsGet, id),
  create: (input) => ipcRenderer.invoke(IPC_CHANNELS.clientsCreate, input),
  update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.clientsUpdate, id, input),
  archive: (id) => ipcRenderer.invoke(IPC_CHANNELS.clientsArchive, id),
  restore: (id) => ipcRenderer.invoke(IPC_CHANNELS.clientsRestore, id),
};

const clients = Object.freeze(clientMethods);

const opticaApi = Object.freeze({
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
  clients,
});

contextBridge.exposeInMainWorld('optica', opticaApi);
