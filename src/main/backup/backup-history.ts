import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import type {
  BackupExternalState,
  BackupHistoryEvent,
  BackupHistoryOperation,
  BackupHistoryResult,
  BackupHistoryTrigger,
  BackupHistorySnapshot,
  BackupLocalState,
} from '../../shared/database-models';

const HISTORY_VERSION = 1;
export const BACKUP_HISTORY_LIMIT = 90;

interface HistoryFile {
  version: typeof HISTORY_VERSION;
  events: BackupHistoryEvent[];
}

export type BackupHistoryInput = Omit<BackupHistoryEvent, 'id'>;

const operations: BackupHistoryOperation[] = ['CREATE', 'VERIFY', 'EXPORT', 'RESTORE', 'RETENTION'];
const results: BackupHistoryResult[] = ['STARTED', 'SUCCESS', 'PARTIAL', 'FAILURE'];
const triggers: BackupHistoryTrigger[] = ['MANUAL', 'AUTOMATIC', 'RETRY'];
const localStates: BackupLocalState[] = ['VALID', 'MISSING', 'FAILED', 'NOT_APPLICABLE'];
const externalStates: BackupExternalState[] = [
  'NOT_CONFIGURED',
  'PENDING',
  'COPIED',
  'FAILED',
  'MISSING',
  'UNKNOWN',
  'NOT_APPLICABLE',
];

function isEvent(value: unknown): value is BackupHistoryEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Partial<BackupHistoryEvent>;
  return (
    typeof event.id === 'string' &&
    event.id.length <= 80 &&
    typeof event.occurredAt === 'string' &&
    Number.isFinite(Date.parse(event.occurredAt)) &&
    !!event.operation &&
    operations.includes(event.operation) &&
    (event.trigger === undefined || triggers.includes(event.trigger)) &&
    !!event.result &&
    results.includes(event.result) &&
    !!event.localState &&
    localStates.includes(event.localState) &&
    !!event.externalState &&
    externalStates.includes(event.externalState) &&
    (event.fileName === undefined ||
      (typeof event.fileName === 'string' &&
        (/^occhiali-backup-\d{17}\.ocbackup$/.test(event.fileName) ||
          event.fileName === 'respaldo-seleccionado.ocbackup'))) &&
    (event.sizeBytes === undefined ||
      (typeof event.sizeBytes === 'number' &&
        Number.isSafeInteger(event.sizeBytes) &&
        event.sizeBytes >= 0)) &&
    (event.error === undefined || (typeof event.error === 'string' && event.error.length <= 240))
  );
}

function replaceFile(nextPath: string, path: string): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(nextPath, path);
      return;
    } catch (error: unknown) {
      const transient =
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES');
      if (!transient || attempt >= 7) throw error;
      Atomics.wait(signal, 0, 0, (attempt + 1) * 10);
    }
  }
}

export class BackupHistoryStore {
  private events: BackupHistoryEvent[] = [];
  private writeFailed = false;
  private writeBlocked = false;
  private recoveredFromDamage = false;

  public constructor(
    private readonly path: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.events = this.load();
  }

  public append(input: BackupHistoryInput): boolean {
    if (this.writeBlocked) return false;
    const event: BackupHistoryEvent = {
      ...input,
      id: `${Date.parse(input.occurredAt)}-${randomBytes(6).toString('hex')}`,
    };
    if (!isEvent(event)) return false;
    const next = [event, ...this.events].slice(0, BACKUP_HISTORY_LIMIT);
    try {
      this.persist(next);
      this.events = next;
      this.writeFailed = false;
      return true;
    } catch {
      this.writeFailed = true;
      return false;
    }
  }

  public snapshot(): BackupHistorySnapshot {
    return {
      events: this.events.map((event) => ({ ...event })),
      available: !this.writeFailed,
      recoveredFromDamage: this.recoveredFromDamage,
    };
  }

  private load(): BackupHistoryEvent[] {
    if (!existsSync(this.path)) return [];
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<HistoryFile>;
      if (
        value.version !== HISTORY_VERSION ||
        !Array.isArray(value.events) ||
        !value.events.every(isEvent)
      )
        throw new Error('invalid history');
      return value.events.slice(0, BACKUP_HISTORY_LIMIT);
    } catch {
      this.recoveredFromDamage = true;
      const suffix = this.now().toISOString().replace(/\D/g, '').slice(0, 17);
      try {
        renameSync(this.path, `${this.path}.corrupt-${suffix}`);
      } catch {
        // Preserve the damaged source in place instead of risking an overwrite.
        this.writeFailed = true;
        this.writeBlocked = true;
      }
      return [];
    }
  }

  private persist(events: BackupHistoryEvent[]): void {
    const nextPath = `${this.path}.next`;
    rmSync(nextPath, { force: true });
    const descriptor = openSync(nextPath, 'wx', 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify({ version: HISTORY_VERSION, events }), 'utf8');
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    try {
      replaceFile(nextPath, this.path);
    } catch (error: unknown) {
      rmSync(nextPath, { force: true });
      throw error;
    }
  }
}
