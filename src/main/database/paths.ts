import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { resolveStableUserDataPath } from './data-location';

export const DATABASE_FILE_NAME = 'optica.sqlite3';

export function configureUserDataPath(): void {
  const qaUserDataPath = process.env.OPTICA_QA_USER_DATA_PATH;
  if (qaUserDataPath && !isAbsolute(qaUserDataPath)) {
    throw new Error('OPTICA_QA_USER_DATA_PATH debe ser una ruta absoluta.');
  }

  const userDataPath = qaUserDataPath ?? resolveStableUserDataPath(app.getPath('appData'));
  mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
}

export function getDatabaseFilePath(): string {
  if (!app.isReady()) {
    throw new Error(
      'La ruta de la base de datos solo está disponible después de iniciar Electron.',
    );
  }

  return join(app.getPath('userData'), DATABASE_FILE_NAME);
}
