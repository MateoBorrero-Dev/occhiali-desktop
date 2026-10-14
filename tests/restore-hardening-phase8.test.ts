import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupService } from '../src/main/backup/backup-service';
import { recoverInterruptedRestore, RestoreCoordinator } from '../src/main/backup/restore-recovery';
import { ApplicationDatabase } from '../src/main/database';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

const RECOVERY = 'Recuperacion-Hardening-2026';

interface RestoreFixture {
  directory: string;
  activePath: string;
  stagingPath: string;
  coordinator: RestoreCoordinator;
}

function writeDatabase(path: string, firstName: string): number {
  const database = ApplicationDatabase.open(path);
  try {
    return database.clients.create({ firstName, lastName: 'Ficticia' }).id;
  } finally {
    database.close();
  }
}

function firstName(path: string): string | undefined {
  const database = ApplicationDatabase.open(path);
  try {
    return database.clients.list({ includeArchived: true })[0]?.firstName;
  } finally {
    database.close();
  }
}

function fixture(suffix = '1111111111111111'): RestoreFixture {
  const directory = mkdtempSync(join(tmpdir(), 'occhiali-restore-hardening-'));
  const activePath = join(directory, 'optica.sqlite3');
  const stagingPath = join(directory, `.restore-staging-${suffix}.sqlite3`);
  writeDatabase(activePath, 'Anterior');
  writeDatabase(stagingPath, 'Restaurada');
  return {
    directory,
    activePath,
    stagingPath,
    coordinator: new RestoreCoordinator(activePath),
  };
}

describe('estado durable de restauración', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  });

  function tracked(suffix?: string): RestoreFixture {
    const value = fixture(suffix);
    directories.push(value.directory);
    return value;
  }

  it('un corte antes de mover la base conserva la activa y limpia el staging', () => {
    const value = tracked();
    value.coordinator.begin(value.stagingPath);

    const recovery = recoverInterruptedRestore(value.activePath);

    expect(recovery.action).toBe('rolled-back');
    expect(recovery.recoveredPreviousDatabase).toBe(false);
    expect(firstName(value.activePath)).toBe('Anterior');
    expect(existsSync(value.stagingPath)).toBe(false);
    expect(existsSync(value.coordinator.statePath)).toBe(false);
  });

  it('un corte después de mover la base recupera el rollback al iniciar', () => {
    const value = tracked();
    value.coordinator.begin(value.stagingPath);
    value.coordinator.moveActiveToRollback();
    expect(existsSync(value.activePath)).toBe(false);

    const recovery = recoverInterruptedRestore(value.activePath);

    expect(recovery.recoveredPreviousDatabase).toBe(true);
    expect(firstName(value.activePath)).toBe('Anterior');
    expect(existsSync(value.coordinator.rollbackPath)).toBe(false);
  });

  it('un corte después de colocar la candidata vuelve a la base anterior', () => {
    const value = tracked();
    value.coordinator.begin(value.stagingPath);
    value.coordinator.moveActiveToRollback();
    value.coordinator.placeCandidate();
    expect(firstName(value.activePath)).toBe('Restaurada');

    recoverInterruptedRestore(value.activePath);

    expect(firstName(value.activePath)).toBe('Anterior');
    expect(existsSync(value.coordinator.rollbackPath)).toBe(false);
  });

  it('una candidata verificada pero no confirmada también se revierte', () => {
    const value = tracked();
    value.coordinator.begin(value.stagingPath);
    value.coordinator.moveActiveToRollback();
    value.coordinator.placeCandidate();
    const candidate = ApplicationDatabase.open(value.activePath);
    expect(candidate.integrityCheck()).toBe('ok');
    candidate.close();
    value.coordinator.markVerified();

    recoverInterruptedRestore(value.activePath);

    expect(firstName(value.activePath)).toBe('Anterior');
  });

  it('una restauración confirmada conserva la candidata y elimina rollback y estado', () => {
    const value = tracked();
    value.coordinator.begin(value.stagingPath);
    value.coordinator.moveActiveToRollback();
    value.coordinator.placeCandidate();
    value.coordinator.markVerified();

    expect(value.coordinator.confirmAndCleanup()).toBe(true);

    expect(firstName(value.activePath)).toBe('Restaurada');
    expect(existsSync(value.coordinator.rollbackPath)).toBe(false);
    expect(existsSync(value.coordinator.statePath)).toBe(false);
    const restored = ApplicationDatabase.open(value.activePath);
    try {
      expect(restored.clients.create({ firstName: 'Nueva', lastName: 'Escritura' }).id).toBe(2);
    } finally {
      restored.close();
    }
  });

  it('completa la limpieza al iniciar si la confirmación durable ya fue escrita', () => {
    const value = tracked();
    value.coordinator.begin(value.stagingPath);
    value.coordinator.moveActiveToRollback();
    value.coordinator.placeCandidate();
    value.coordinator.markVerified();
    const state = JSON.parse(readFileSync(value.coordinator.statePath, 'utf8')) as {
      phase: string;
    };
    writeFileSync(value.coordinator.statePath, JSON.stringify({ ...state, phase: 'confirmed' }));

    const recovery = recoverInterruptedRestore(value.activePath);

    expect(recovery.action).toBe('confirmed-cleanup');
    expect(firstName(value.activePath)).toBe('Restaurada');
    expect(existsSync(value.coordinator.rollbackPath)).toBe(false);
    expect(existsSync(value.coordinator.statePath)).toBe(false);
  });

  it('permite un segundo intento solamente después de recuperar el primero', () => {
    const first = tracked();
    first.coordinator.begin(first.stagingPath);
    first.coordinator.moveActiveToRollback();
    first.coordinator.placeCandidate();
    recoverInterruptedRestore(first.activePath);
    expect(firstName(first.activePath)).toBe('Anterior');

    const secondStaging = join(first.directory, '.restore-staging-2222222222222222.sqlite3');
    writeDatabase(secondStaging, 'Segundo intento');
    const second = new RestoreCoordinator(first.activePath);
    second.begin(secondStaging);
    second.moveActiveToRollback();
    second.placeCandidate();
    second.markVerified();
    expect(second.confirmAndCleanup()).toBe(true);
    expect(firstName(first.activePath)).toBe('Segundo intento');
  });

  it('no sobrescribe un rollback o estado pendiente con otra restauración', () => {
    const value = tracked();
    value.coordinator.begin(value.stagingPath);
    value.coordinator.moveActiveToRollback();
    const secondStaging = join(value.directory, '.restore-staging-3333333333333333.sqlite3');
    writeDatabase(secondStaging, 'Otra');

    expect(() => new RestoreCoordinator(value.activePath).begin(secondStaging)).toThrow(
      'restauración pendiente',
    );
    expect(firstName(value.coordinator.rollbackPath)).toBe('Anterior');
  });
});

describe('limpieza de staging descifrado', () => {
  let context: TestDatabase | null = null;
  const directories: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    if (context) {
      destroyTestDatabase(context);
      context = null;
    }
    const { rm } = await import('node:fs/promises');
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  });

  it('elimina SQLite, WAL y SHM si falla la apertura posterior al descifrado', async () => {
    context = createTestDatabase();
    context.database.clients.create({ firstName: 'Persona', lastName: 'Ficticia' });
    const directory = mkdtempSync(join(tmpdir(), 'occhiali-restore-validation-'));
    directories.push(directory);
    const service = new BackupService(join(directory, 'backup-settings.json'), '0.1.0');
    const created = await service.create(context.database, RECOVERY);
    service.setSelectedRestorePath(join(directory, 'backups', created.fileName));
    const realOpen = ApplicationDatabase.open.bind(ApplicationDatabase);
    vi.spyOn(ApplicationDatabase, 'open').mockImplementation((path) => {
      if (basename(path).startsWith('.restore-staging-')) throw new Error('fallo simulado');
      return realOpen(path);
    });

    await expect(service.verifySelected(RECOVERY)).rejects.toThrow(
      'contraseña de recuperación es incorrecta o el archivo está dañado',
    );

    expect(
      (await import('node:fs'))
        .readdirSync(directory)
        .some((name) => name.startsWith('.restore-staging-')),
    ).toBe(false);
    expect(context.database.integrityCheck()).toBe('ok');
  });

  it('transfiere explícitamente la limpieza al coordinador de restauración', async () => {
    context = createTestDatabase();
    const service = new BackupService(join(context.directory, 'backup-settings.json'), '0.1.0');
    const created = await service.create(context.database, RECOVERY);
    service.setSelectedRestorePath(join(context.directory, 'backups', created.fileName));
    const prepared = await service.prepareRestore(RECOVERY);
    expect(existsSync(prepared.sqlitePath)).toBe(true);

    const coordinator = new RestoreCoordinator(context.filePath);
    coordinator.begin(prepared.sqlitePath);
    expect(prepared.transferOwnership()).toBe(prepared.sqlitePath);
    await prepared.cleanup();
    expect(existsSync(prepared.sqlitePath)).toBe(true);

    coordinator.rollbackPending();
    expect(existsSync(prepared.sqlitePath)).toBe(false);
  });
});
