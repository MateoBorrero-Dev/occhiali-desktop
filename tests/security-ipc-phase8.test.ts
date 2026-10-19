import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registered = vi.hoisted(
  () => new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
);

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    relaunch: vi.fn(),
    exit: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      registered.set(channel, handler),
    ),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

import { BackupError, BackupService } from '../src/main/backup/backup-service';
import { ApplicationDatabase } from '../src/main/database';
import { registerIpcHandlers } from '../src/main/ipc/register-handlers';
import { SecurityManager } from '../src/main/security/security-manager';
import { IPC_CHANNELS } from '../src/shared/ipc-contracts';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

describe('autorización IPC de Fase 8', () => {
  let context: TestDatabase;
  let directory: string;
  let security: SecurityManager;
  let backups: BackupService;

  beforeEach(() => {
    registered.clear();
    context = createTestDatabase();
    directory = mkdtempSync(join(tmpdir(), 'occhiali-ipc-security-'));
    security = new SecurityManager(join(directory, 'security.json'));
    backups = new BackupService(join(context.directory, 'backup-settings.json'), '0.1.0');
    registerIpcHandlers(context.database, security, backups, context.filePath);
  });

  afterEach(async () => {
    destroyTestDatabase(context);
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });

  it('rechaza canales de datos antes de autenticar en Main', () => {
    const listClients = registered.get(IPC_CHANNELS.clientsList);
    expect(listClients).toBeDefined();
    expect(() => listClients?.({})).toThrow('Autenticación requerida');
  });

  it('permite datos después de autenticar y vuelve a bloquear al cerrar sesión', async () => {
    await security.setup('Acceso-Ficticio-2026', 15);
    const listClients = registered.get(IPC_CHANNELS.clientsList)!;
    expect(listClients({}, undefined)).toMatchObject({ ok: true, data: { total: 0 } });
    security.logout();
    expect(() => listClients({}, undefined)).toThrow('Autenticación requerida');
  });

  it('valida cantidad de argumentos en canales nuevos', () => {
    const login = registered.get(IPC_CHANNELS.securityLogin)!;
    expect(() => login({})).toThrow('requiere 1 argumento');
  });

  it('rechaza backup sin sesión con un error controlado', async () => {
    const status = registered.get(IPC_CHANNELS.backupStatus)!;
    await expect(status({})).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SECURITY',
        message: 'La sesión está bloqueada. Volvé a ingresar tu contraseña.',
      },
    });
  });

  it('protege el historial y rechaza argumentos o rutas desde React', async () => {
    const history = registered.get(IPC_CHANNELS.backupHistory)!;
    expect(() => history({}, 'C:\\ruta-no-permitida')).toThrow('requiere 0 argumento');
    await expect(history({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'SECURITY' },
    });
    await security.setup('Acceso-Ficticio-2026', 15);
    await expect(history({})).resolves.toMatchObject({
      ok: true,
      data: { events: [], available: true },
    });
  });

  it('convierte un fallo de archivos en un mensaje seguro para la interfaz', async () => {
    await security.setup('Acceso-Ficticio-2026', 15);
    vi.spyOn(backups, 'create').mockRejectedValue(
      new BackupError('No se pudo crear la copia de seguridad.'),
    );
    const createBackup = registered.get(IPC_CHANNELS.backupCreate)!;
    await expect(createBackup({}, 'Recuperacion-Ficticia-2026')).resolves.toMatchObject({
      ok: false,
      error: { code: 'BACKUP', message: 'No se pudo crear la copia de seguridad.' },
    });
  });

  it('exige confirmación y restaura sobre una base existente conservando la anterior', async () => {
    await security.setup('Acceso-Ficticio-2026', 15);
    const original = context.database.clients.create({ firstName: 'Original', lastName: 'QA' });
    const created = await backups.create(context.database, 'Recuperacion-Ficticia-2026');
    backups.setSelectedRestorePath(join(context.directory, 'backups', created.fileName));
    context.database.clients.create({ firstName: 'Posterior', lastName: 'QA' });
    const restore = registered.get(IPC_CHANNELS.backupRestore)!;

    await expect(restore({}, 'Recuperacion-Ficticia-2026', false)).resolves.toMatchObject({
      ok: false,
      error: { code: 'BACKUP' },
    });
    await expect(restore({}, 'Recuperacion-Ficticia-2026', true)).resolves.toMatchObject({
      ok: true,
      data: { restartRequired: true },
    });

    const restored = ApplicationDatabase.open(context.filePath);
    try {
      expect(restored.clients.getById(original.id)?.firstName).toBe('Original');
      expect(restored.clients.list()).toHaveLength(1);
      expect(restored.integrityCheck()).toBe('ok');
    } finally {
      restored.close();
    }
    expect(existsSync(`${context.filePath}.restore-rollback`)).toBe(false);
    expect(existsSync(`${context.filePath}.restore-state.json`)).toBe(false);
    expect(backups.history().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'RESTORE', result: 'SUCCESS' }),
      ]),
    );
  });
});
