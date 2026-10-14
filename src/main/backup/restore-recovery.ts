import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const STATE_VERSION = 1;
const STAGING_PATTERN = /^\.restore-staging-[a-f0-9]{16}\.sqlite3$/;

export type RestorePhase =
  'pending' | 'active-moved' | 'candidate-placed' | 'verified' | 'confirmed' | 'recovery-required';

interface RestoreState {
  version: typeof STATE_VERSION;
  phase: RestorePhase;
  stagingFileName: string;
  startedAt: string;
}

export interface RestoreRecoveryResult {
  action: 'none' | 'rolled-back' | 'confirmed-cleanup';
  recoveredPreviousDatabase: boolean;
  removedStagingFiles: number;
  removedRollback: boolean;
}

export class RestoreRecoveryError extends Error {}

function removeDatabaseArtifacts(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

function removeStagingFiles(directory: string): number {
  if (!existsSync(directory)) return 0;
  let removed = 0;
  for (const name of readdirSync(directory)) {
    if (STAGING_PATTERN.test(name)) {
      removeDatabaseArtifacts(join(directory, name));
      removed += 1;
    }
  }
  return removed;
}

function parseState(path: string): RestoreState | null {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<RestoreState>;
    const phases: RestorePhase[] = [
      'pending',
      'active-moved',
      'candidate-placed',
      'verified',
      'confirmed',
      'recovery-required',
    ];
    if (
      value.version !== STATE_VERSION ||
      !value.phase ||
      !phases.includes(value.phase) ||
      typeof value.stagingFileName !== 'string' ||
      !STAGING_PATTERN.test(value.stagingFileName) ||
      typeof value.startedAt !== 'string'
    )
      throw new Error('invalid state');
    return value as RestoreState;
  } catch {
    throw new RestoreRecoveryError(
      'El estado de restauración está dañado. Se preservaron los archivos para revisión técnica.',
    );
  }
}

function persistState(path: string, state: RestoreState): void {
  const nextPath = `${path}.next`;
  rmSync(nextPath, { force: true });
  const descriptor = openSync(nextPath, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(state), 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(nextPath, path);
  } catch (error: unknown) {
    rmSync(nextPath, { force: true });
    throw error;
  }
}

function removeStateArtifacts(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}.next`, { force: true });
}

export class RestoreCoordinator {
  public readonly activeDatabasePath: string;
  public readonly rollbackPath: string;
  public readonly statePath: string;
  private readonly directory: string;

  public constructor(activeDatabasePath: string) {
    this.activeDatabasePath = resolve(activeDatabasePath);
    this.directory = dirname(this.activeDatabasePath);
    this.rollbackPath = `${this.activeDatabasePath}.restore-rollback`;
    this.statePath = `${this.activeDatabasePath}.restore-state.json`;
  }

  public begin(stagingPath: string): void {
    const resolvedStaging = resolve(stagingPath);
    const stagingFileName = basename(resolvedStaging);
    if (existsSync(this.statePath) || existsSync(this.rollbackPath))
      throw new RestoreRecoveryError(
        'Existe una restauración pendiente. Reiniciá Occhiali antes de volver a intentar.',
      );
    if (dirname(resolvedStaging) !== this.directory || !STAGING_PATTERN.test(stagingFileName))
      throw new RestoreRecoveryError('El archivo temporal de restauración no es válido.');
    if (!existsSync(this.activeDatabasePath) || !existsSync(resolvedStaging))
      throw new RestoreRecoveryError('No se encontraron los archivos necesarios para restaurar.');
    persistState(this.statePath, {
      version: STATE_VERSION,
      phase: 'pending',
      stagingFileName,
      startedAt: new Date().toISOString(),
    });
  }

  public moveActiveToRollback(): void {
    this.requirePhase('pending');
    renameSync(this.activeDatabasePath, this.rollbackPath);
    this.setPhase('active-moved');
  }

  public placeCandidate(): void {
    const state = this.requirePhase('active-moved');
    renameSync(join(this.directory, state.stagingFileName), this.activeDatabasePath);
    this.setPhase('candidate-placed');
  }

  public markVerified(): void {
    this.requirePhase('candidate-placed');
    this.setPhase('verified');
  }

  public confirmAndCleanup(): boolean {
    this.requirePhase('verified');
    this.setPhase('confirmed');
    try {
      removeDatabaseArtifacts(this.rollbackPath);
      removeStagingFiles(this.directory);
      removeStateArtifacts(this.statePath);
      return true;
    } catch {
      // The durable confirmed marker makes cleanup safely retryable on the next start.
      return false;
    }
  }

  public rollbackPending(): RestoreRecoveryResult {
    const state = parseState(this.statePath);
    if (!state)
      return {
        action: 'none',
        recoveredPreviousDatabase: false,
        removedStagingFiles: removeStagingFiles(this.directory),
        removedRollback: false,
      };
    if (state.phase === 'confirmed') return finalizeConfirmed(this);
    const originalPhase = state.phase;
    if (state.phase !== 'recovery-required') this.setPhase('recovery-required');
    let recoveredPreviousDatabase = false;
    if (existsSync(this.rollbackPath)) {
      removeDatabaseArtifacts(this.activeDatabasePath);
      renameSync(this.rollbackPath, this.activeDatabasePath);
      recoveredPreviousDatabase = true;
    } else if (!existsSync(this.activeDatabasePath) || originalPhase !== 'pending') {
      if (originalPhase !== 'recovery-required') {
        throw new RestoreRecoveryError(
          'No se pudo recuperar automáticamente la base anterior. Se preservó el estado para soporte.',
        );
      }
      if (!existsSync(this.activeDatabasePath)) {
        throw new RestoreRecoveryError(
          'No se encontró una base recuperable. Se preservó el estado para soporte.',
        );
      }
    }
    const removedStagingFiles = removeStagingFiles(this.directory);
    removeStateArtifacts(this.statePath);
    return {
      action: 'rolled-back',
      recoveredPreviousDatabase,
      removedStagingFiles,
      removedRollback: recoveredPreviousDatabase,
    };
  }

  private requirePhase(expected: RestorePhase): RestoreState {
    const state = parseState(this.statePath);
    if (!state || state.phase !== expected)
      throw new RestoreRecoveryError('La secuencia de restauración no es válida.');
    return state;
  }

  private setPhase(phase: RestorePhase): void {
    const state = parseState(this.statePath);
    if (!state) throw new RestoreRecoveryError('No existe un estado de restauración activo.');
    persistState(this.statePath, { ...state, phase });
  }
}

function finalizeConfirmed(coordinator: RestoreCoordinator): RestoreRecoveryResult {
  if (!existsSync(coordinator.activeDatabasePath)) {
    if (!existsSync(coordinator.rollbackPath))
      throw new RestoreRecoveryError(
        'La restauración confirmada no contiene una base recuperable. Se preservó el estado.',
      );
    renameSync(coordinator.rollbackPath, coordinator.activeDatabasePath);
    const removedStagingFiles = removeStagingFiles(dirname(coordinator.activeDatabasePath));
    removeStateArtifacts(coordinator.statePath);
    return {
      action: 'rolled-back',
      recoveredPreviousDatabase: true,
      removedStagingFiles,
      removedRollback: true,
    };
  }
  const removedRollback = existsSync(coordinator.rollbackPath);
  removeDatabaseArtifacts(coordinator.rollbackPath);
  const removedStagingFiles = removeStagingFiles(dirname(coordinator.activeDatabasePath));
  removeStateArtifacts(coordinator.statePath);
  return {
    action: 'confirmed-cleanup',
    recoveredPreviousDatabase: false,
    removedStagingFiles,
    removedRollback,
  };
}

export function recoverInterruptedRestore(activeDatabasePath: string): RestoreRecoveryResult {
  const coordinator = new RestoreCoordinator(activeDatabasePath);
  const state = parseState(coordinator.statePath);
  if (!state) {
    rmSync(`${coordinator.statePath}.next`, { force: true });
    if (existsSync(coordinator.rollbackPath))
      throw new RestoreRecoveryError(
        'Existe una base anterior sin estado de restauración. Se preservó para revisión técnica.',
      );
    return {
      action: 'none',
      recoveredPreviousDatabase: false,
      removedStagingFiles: removeStagingFiles(dirname(resolve(activeDatabasePath))),
      removedRollback: false,
    };
  }
  if (state.phase === 'confirmed') return finalizeConfirmed(coordinator);
  return coordinator.rollbackPending();
}
