import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FsPromises from 'node:fs/promises';

const simulatedFailure = vi.hoisted(() => ({ code: null as 'ENOSPC' | 'EACCES' | null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof FsPromises>();
  return {
    ...original,
    writeFile: async (...args: Parameters<typeof original.writeFile>) => {
      const target = args[0];
      const path =
        typeof target === 'string'
          ? target
          : target instanceof URL
            ? target.pathname
            : Buffer.isBuffer(target)
              ? target.toString()
              : '';
      if (path.endsWith('.partial') && simulatedFailure.code === 'ENOSPC') {
        throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' });
      }
      if (path.endsWith('.partial') && simulatedFailure.code === 'EACCES') {
        throw Object.assign(new Error('simulated permission denied'), { code: 'EACCES' });
      }
      return original.writeFile(...args);
    },
  };
});

import { BackupService } from '../src/main/backup/backup-service';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

describe('fallos de publicación de backup', () => {
  let context: TestDatabase | null = null;
  const directories: string[] = [];

  afterEach(async () => {
    simulatedFailure.code = null;
    if (context) {
      destroyTestDatabase(context);
      context = null;
    }
    const { rm } = await import('node:fs/promises');
    for (const directory of directories.splice(0)) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  async function expectSafeFailure(code: 'ENOSPC' | 'EACCES') {
    context = createTestDatabase();
    context.database.clients.create({ firstName: 'Persona', lastName: 'Ficticia' });
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-backup-failure-'));
    directories.push(directory);
    const service = new BackupService(join(directory, 'backup-settings.json'), '0.1.0');
    const previous = await service.create(context.database, 'Recuperacion-Ficticia-2026');
    simulatedFailure.code = code;

    await expect(service.create(context.database, 'Recuperacion-Ficticia-2026')).rejects.toThrow(
      'No se pudo crear la copia de seguridad.',
    );

    expect(context.database.integrityCheck()).toBe('ok');
    expect(context.database.clients.list()).toHaveLength(1);
    const files = readdirSync(join(directory, 'backups'));
    expect(files).toContain(previous.fileName);
    expect(files.filter((name) => name.endsWith('.ocbackup'))).toHaveLength(1);
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/\.(partial|tmp)$/)]));
    expect(service.status().lastErrorAt).not.toBeNull();
  }

  it('preserva datos y limpia temporales ante disco lleno simulado', async () => {
    await expectSafeFailure('ENOSPC');
  });

  it('preserva datos y limpia temporales ante permisos denegados simulados', async () => {
    await expectSafeFailure('EACCES');
  });
});
