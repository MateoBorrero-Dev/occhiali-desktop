import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const DATABASE_FILE_NAME = 'optica.sqlite3';

export function applyQaUserDataPathOverride(): void {
  const qaUserDataPath = process.env.OPTICA_QA_USER_DATA_PATH;
  if (!qaUserDataPath) {
    return;
  }
  if (!isAbsolute(qaUserDataPath)) {
    throw new Error('OPTICA_QA_USER_DATA_PATH debe ser una ruta absoluta.');
  }

  mkdirSync(qaUserDataPath, { recursive: true });
  app.setPath('userData', qaUserDataPath);
}

export function getDatabaseFilePath(): string {
  if (!app.isReady()) {
    throw new Error(
      'La ruta de la base de datos solo está disponible después de iniciar Electron.',
    );
  }

  return join(app.getPath('userData'), DATABASE_FILE_NAME);
}
