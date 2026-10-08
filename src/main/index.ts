import { app, BrowserWindow, dialog, session } from 'electron';
import { join } from 'node:path';
import { ApplicationDatabase } from './database';
import { applyQaUserDataPathOverride, getDatabaseFilePath } from './database/paths';
import { registerIpcHandlers } from './ipc/register-handlers';

const isDevelopment = process.env.ELECTRON_RENDERER_URL !== undefined;
let applicationDatabase: ApplicationDatabase | null = null;
let qaConfigurationError: unknown = null;

try {
  applyQaUserDataPathOverride();
} catch (error: unknown) {
  qaConfigurationError = error;
}

function contentSecurityPolicy(): string {
  const connectSource = isDevelopment ? "'self' ws: http://localhost:*" : "'self'";
  const scriptSource = isDevelopment ? "'self' 'unsafe-inline'" : "'self'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSource}`,
    "font-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    `script-src ${scriptSource}`,
    "style-src 'self' 'unsafe-inline'",
  ].join('; ');
}

function configureSecurity(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()],
      },
    });
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
  });
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    show: false,
    title: 'Sistema de Gestión Óptica',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`No se pudo cargar la interfaz (${code}): ${description}`);
  });

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app
  .whenReady()
  .then(() => {
    if (qaConfigurationError) {
      throw new Error('La ruta aislada de QA no es válida.', { cause: qaConfigurationError });
    }

    applicationDatabase = ApplicationDatabase.open(getDatabaseFilePath());
    configureSecurity();
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  })
  .catch(() => {
    dialog.showErrorBox(
      'No se pudo iniciar la aplicación',
      'No fue posible abrir el almacenamiento local. Cerrá la aplicación y volvé a intentarlo.',
    );
    app.quit();
  });

app.on('before-quit', () => {
  applicationDatabase?.close();
  applicationDatabase = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
