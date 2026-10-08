import { app } from 'electron';
import { join } from 'node:path';

export const DATABASE_FILE_NAME = 'optica.sqlite3';

export function getDatabaseFilePath(): string {
  if (!app.isReady()) {
    throw new Error(
      'La ruta de la base de datos solo está disponible después de iniciar Electron.',
    );
  }

  return join(app.getPath('userData'), DATABASE_FILE_NAME);
}
