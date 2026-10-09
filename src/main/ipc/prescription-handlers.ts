import type { ApplicationDatabase } from '../database';
import {
  parseCorrectPrescriptionInput,
  parseCreatePrescriptionInput,
  parsePrescriptionId,
  parsePrescriptionListRequest,
  parsePrescriptionsByClientRequest,
  PrescriptionValidationError,
} from '../../shared/prescription-validation';
import {
  ArchivedClientPrescriptionError,
  PrescriptionClientNotFoundError,
  PrescriptionNotFoundError,
} from '../database/repositories/prescription-repository';
import { assertArgumentCount, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { PrescriptionIpcError, PrescriptionIpcResult } from '../../shared/ipc-contracts';
import type {
  Prescription,
  PrescriptionListPage,
  PrescriptionRevision,
} from '../../shared/database-models';

export interface PrescriptionIpcHandlers {
  list: (...args: unknown[]) => PrescriptionIpcResult<PrescriptionListPage>;
  listByClient: (...args: unknown[]) => PrescriptionIpcResult<PrescriptionListPage>;
  get: (...args: unknown[]) => PrescriptionIpcResult<Prescription>;
  create: (...args: unknown[]) => PrescriptionIpcResult<Prescription>;
  correct: (...args: unknown[]) => PrescriptionIpcResult<Prescription>;
  revisions: (...args: unknown[]) => PrescriptionIpcResult<PrescriptionRevision[]>;
}

function isPersistenceConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')
  );
}

function prescriptionError(error: unknown): PrescriptionIpcError {
  if (error instanceof PrescriptionValidationError) {
    return {
      code: 'VALIDATION',
      message: 'Revisá los datos ingresados.',
      fields: Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message])),
    };
  }
  if (error instanceof TypeError) {
    return { code: 'VALIDATION', message: 'La solicitud no es válida.' };
  }
  if (error instanceof PrescriptionNotFoundError) {
    return { code: 'NOT_FOUND', message: error.message };
  }
  if (error instanceof PrescriptionClientNotFoundError) {
    return { code: 'CLIENT_NOT_FOUND', message: error.message };
  }
  if (error instanceof ArchivedClientPrescriptionError) {
    return { code: 'ARCHIVED_CLIENT', message: error.message };
  }
  if (isPersistenceConflict(error)) {
    return {
      code: 'CONFLICT',
      message: 'El almacenamiento está ocupado. Esperá un momento y volvé a intentarlo.',
    };
  }
  return {
    code: 'PERSISTENCE',
    message: 'No se pudo completar la operación. Volvé a intentarlo.',
  };
}

function perform<T>(operation: () => T): PrescriptionIpcResult<T> {
  try {
    return { ok: true, data: operation() };
  } catch (error: unknown) {
    return { ok: false, error: prescriptionError(error) };
  }
}

export function createPrescriptionIpcHandlers(
  database: ApplicationDatabase,
): PrescriptionIpcHandlers {
  return {
    list: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.prescriptionsList, args, 1);
        return database.prescriptions.search(parsePrescriptionListRequest(args[0]));
      }),
    listByClient: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.prescriptionsListByClient, args, 1);
        return database.prescriptions.listByClientPage(parsePrescriptionsByClientRequest(args[0]));
      }),
    get: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.prescriptionsGet, args, 1);
        const prescription = database.prescriptions.getById(parsePrescriptionId(args[0]));
        if (!prescription) throw new PrescriptionNotFoundError();
        return prescription;
      }),
    create: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.prescriptionsCreate, args, 1);
        return database.prescriptions.createWithValues(parseCreatePrescriptionInput(args[0]));
      }),
    correct: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.prescriptionsCorrect, args, 2);
        return database.prescriptions.correct(
          parsePrescriptionId(args[0]),
          parseCorrectPrescriptionInput(args[1]),
        );
      }),
    revisions: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.prescriptionsRevisions, args, 1);
        return database.prescriptions.listRevisions(parsePrescriptionId(args[0]));
      }),
  };
}
