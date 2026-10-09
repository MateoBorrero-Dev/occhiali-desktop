import type { ApplicationDatabase } from '../database';
import {
  ArchivedClientOpticalJobError,
  DuplicateOpticalJobNumberError,
  OpticalJobClientNotFoundError,
  OpticalJobNotFoundError,
  OpticalJobPrescriptionMismatchError,
  OpticalJobPrescriptionNotFoundError,
} from '../database/repositories/optical-job-repository';
import { TreatmentNotFoundError } from '../database/repositories/treatment-repository';
import {
  OpticalJobValidationError,
  parseCreateOpticalJobInput,
  parseOpticalJobId,
  parseOpticalJobListRequest,
  parseOpticalJobsByClientRequest,
  parseUpdateOpticalJobInput,
} from '../../shared/optical-job-validation';
import { assertArgumentCount, assertNoArguments, IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { OpticalJobIpcError, OpticalJobIpcResult } from '../../shared/ipc-contracts';
import type { OpticalJob, OpticalJobListPage, Treatment } from '../../shared/database-models';

export interface OpticalJobIpcHandlers {
  list: (...args: unknown[]) => OpticalJobIpcResult<OpticalJobListPage>;
  listByClient: (...args: unknown[]) => OpticalJobIpcResult<OpticalJobListPage>;
  get: (...args: unknown[]) => OpticalJobIpcResult<OpticalJob>;
  create: (...args: unknown[]) => OpticalJobIpcResult<OpticalJob>;
  update: (...args: unknown[]) => OpticalJobIpcResult<OpticalJob>;
  treatments: (...args: unknown[]) => OpticalJobIpcResult<Treatment[]>;
}

function isPersistenceConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')
  );
}

function safeError(error: unknown): OpticalJobIpcError {
  if (error instanceof OpticalJobValidationError) {
    return {
      code: 'VALIDATION',
      message: 'Revisá los datos ingresados.',
      fields: Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message])),
    };
  }
  if (error instanceof TypeError)
    return { code: 'VALIDATION', message: 'La solicitud no es válida.' };
  if (error instanceof DuplicateOpticalJobNumberError)
    return { code: 'DUPLICATE_JOB_NUMBER', message: error.message };
  if (error instanceof OpticalJobNotFoundError)
    return { code: 'NOT_FOUND', message: error.message };
  if (error instanceof OpticalJobClientNotFoundError)
    return { code: 'CLIENT_NOT_FOUND', message: error.message };
  if (error instanceof ArchivedClientOpticalJobError)
    return { code: 'ARCHIVED_CLIENT', message: error.message };
  if (error instanceof OpticalJobPrescriptionNotFoundError)
    return { code: 'PRESCRIPTION_NOT_FOUND', message: error.message };
  if (error instanceof OpticalJobPrescriptionMismatchError)
    return { code: 'PRESCRIPTION_MISMATCH', message: error.message };
  if (error instanceof TreatmentNotFoundError)
    return { code: 'TREATMENT_NOT_FOUND', message: error.message };
  if (isPersistenceConflict(error))
    return {
      code: 'CONFLICT',
      message: 'El almacenamiento está ocupado. Esperá un momento y volvé a intentarlo.',
    };
  return { code: 'PERSISTENCE', message: 'No se pudo completar la operación. Volvé a intentarlo.' };
}

function perform<T>(operation: () => T): OpticalJobIpcResult<T> {
  try {
    return { ok: true, data: operation() };
  } catch (error: unknown) {
    return { ok: false, error: safeError(error) };
  }
}

export function createOpticalJobIpcHandlers(database: ApplicationDatabase): OpticalJobIpcHandlers {
  return {
    list: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.opticalJobsList, args, 1);
        return database.opticalJobs.search(parseOpticalJobListRequest(args[0]));
      }),
    listByClient: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.opticalJobsListByClient, args, 1);
        return database.opticalJobs.listByClientPage(parseOpticalJobsByClientRequest(args[0]));
      }),
    get: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.opticalJobsGet, args, 1);
        const job = database.opticalJobs.getById(parseOpticalJobId(args[0]));
        if (!job) throw new OpticalJobNotFoundError();
        return job;
      }),
    create: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.opticalJobsCreate, args, 1);
        return database.opticalJobs.createWithTreatments(parseCreateOpticalJobInput(args[0]));
      }),
    update: (...args) =>
      perform(() => {
        assertArgumentCount(IPC_CHANNELS.opticalJobsUpdate, args, 2);
        return database.opticalJobs.update(
          parseOpticalJobId(args[0]),
          parseUpdateOpticalJobInput(args[1]),
        );
      }),
    treatments: (...args) =>
      perform(() => {
        assertNoArguments(IPC_CHANNELS.treatmentsList, args);
        return database.treatments.listActive();
      }),
  };
}
