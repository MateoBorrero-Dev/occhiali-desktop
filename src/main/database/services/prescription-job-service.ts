import type Database from 'better-sqlite3';
import type {
  CreatePrescriptionBundleInput,
  CreatePrescriptionBundleResult,
} from '../../../shared/database-models';
import { parseCreatePrescriptionBundleInput } from '../../../shared/prescription-job-validation';
import type { OpticalJobRepository } from '../repositories/optical-job-repository';
import type { PrescriptionRepository } from '../repositories/prescription-repository';

export class PrescriptionJobService {
  public constructor(
    private readonly database: Database.Database,
    private readonly prescriptions: PrescriptionRepository,
    private readonly opticalJobs: OpticalJobRepository,
  ) {}

  public create(input: CreatePrescriptionBundleInput): CreatePrescriptionBundleResult {
    const normalized = parseCreatePrescriptionBundleInput(input);

    this.prescriptions.validateCreate(normalized.prescription);
    if (normalized.opticalJob) {
      this.opticalJobs.validateCreate({
        ...normalized.opticalJob,
        clientId: normalized.prescription.clientId,
        prescriptionId: null,
      });
    }

    return this.database.transaction(() => {
      const prescription = this.prescriptions.createWithValuesInTransaction(
        normalized.prescription,
      );
      const opticalJob = normalized.opticalJob
        ? this.opticalJobs.createWithTreatmentsInTransaction({
            ...normalized.opticalJob,
            clientId: prescription.clientId,
            prescriptionId: prescription.id,
          })
        : null;
      return { prescription, opticalJob };
    })();
  }
}
