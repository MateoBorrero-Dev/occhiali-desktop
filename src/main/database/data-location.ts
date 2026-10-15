import { join } from 'node:path';

export const STABLE_USER_DATA_DIRECTORY_NAME = 'optica-desktop';

export function resolveStableUserDataPath(appDataPath: string): string {
  return join(appDataPath, STABLE_USER_DATA_DIRECTORY_NAME);
}
