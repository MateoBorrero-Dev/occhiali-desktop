import type Database from 'better-sqlite3';
import type {
  CreatePrescriptionBundleInput,
  CreatePrescriptionBundleResult,
  UpdateOpticalFileInput,
  UpdateOpticalFileResult,
} from '../../../shared/database-models';
import {
  parseCreatePrescriptionBundleInput,
  parseUpdateOpticalFileInput,
} from '../../../shared/prescription-job-validation';
import { PrescriptionValidationError } from '../../../shared/prescription-validation';
import {
  OpticalJobNotFoundError,
  type OpticalJobRepository,
} from '../repositories/optical-job-repository';
import type { PrescriptionRepository } from '../repositories/prescription-repository';

export class PrescriptionJobService {
  public constructor(
    private readonly database: Database.Database,
    private readonly prescriptions: PrescriptionRepository,
    private readonly opticalJobs: OpticalJobRepository,
  ) {}

  public create(input: CreatePrescriptionBundleInput): CreatePrescriptionBundleResult {
    const normalized = parseCreatePrescriptionBundleInput(input);

    const requireOpticalData =
      normalized.opticalJob === null || normalized.opticalJob.product === 'Anteojos de receta';
    if (normalized.opticalJob) {
      this.prescriptions.validateIntegratedCreate(normalized.prescription, requireOpticalData);
    } else {
      this.prescriptions.validateCreate(normalized.prescription);
    }
    if (normalized.opticalJob) {
      this.opticalJobs.validateCreate({
        ...normalized.opticalJob,
        clientId: normalized.prescription.clientId,
        prescriptionId: null,
      });
    }

    return this.database.transaction(() => {
      const prescription = normalized.opticalJob
        ? this.prescriptions.createIntegratedWithValuesInTransaction(
            normalized.prescription,
            requireOpticalData,
          )
        : this.prescriptions.createWithValuesInTransaction(normalized.prescription);
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

  public update(jobId: number, input: UpdateOpticalFileInput): UpdateOpticalFileResult {
    const normalized = parseUpdateOpticalFileInput(input);
    const currentJob = this.opticalJobs.getById(jobId);
    if (!currentJob) throw new OpticalJobNotFoundError();
    if ((normalized.opticalJob.prescriptionId ?? null) !== currentJob.prescriptionId) {
      throw new PrescriptionValidationError([
        {
          field: 'form',
          message: 'La edición integrada no puede cambiar la receta asociada a la ficha.',
        },
      ]);
    }

    let correctionChanged = false;
    let requireOpticalData = false;
    let pendingOpticalData = false;
    if (normalized.prescription) {
      if (currentJob.prescriptionId === null) {
        throw new PrescriptionValidationError([
          {
            field: 'form',
            message: 'Esta ficha histórica no tiene una graduación asociada para corregir.',
          },
        ]);
      }
      const linkedProducts = this.database
        .prepare('SELECT id, product FROM optical_jobs WHERE prescription_id = ?')
        .all(currentJob.prescriptionId) as Array<{ id: number; product: string | null }>;
      requireOpticalData = linkedProducts.some((job) =>
        isPrescriptionGlasses(
          job.id === jobId ? (normalized.opticalJob.product ?? null) : job.product,
        ),
      );
      const validation = this.prescriptions.validateCorrection(
        currentJob.prescriptionId,
        normalized.prescription,
        requireOpticalData,
      );
      correctionChanged = validation.changed;
      pendingOpticalData =
        validation.normalized.values.length > 0 ||
        validation.normalized.additionOd !== null ||
        validation.normalized.additionOi !== null;
      if (correctionChanged && linkedProducts.length > 1 && !normalized.confirmSharedPrescription) {
        throw new PrescriptionValidationError([
          {
            field: 'confirmSharedPrescription',
            message:
              'Confirmá que comprendés que la corrección de graduación afecta a todas las fichas vinculadas.',
          },
        ]);
      }
    }

    this.opticalJobs.validateUpdate(jobId, normalized.opticalJob, pendingOpticalData);

    return this.database.transaction(() => {
      let prescription =
        currentJob.prescriptionId === null
          ? null
          : this.prescriptions.getById(currentJob.prescriptionId);
      let prescriptionRevisionCreated = false;
      if (normalized.prescription && currentJob.prescriptionId !== null && correctionChanged) {
        const correction = this.prescriptions.correctInTransaction(
          currentJob.prescriptionId,
          normalized.prescription,
          requireOpticalData,
        );
        prescription = correction.prescription;
        prescriptionRevisionCreated = correction.changed;
      }
      const opticalJob = this.opticalJobs.updateInTransaction(jobId, normalized.opticalJob);
      return { opticalJob, prescription, prescriptionRevisionCreated };
    })();
  }
}

function isPrescriptionGlasses(product: string | null): boolean {
  if (!product) return false;
  const normalized = product
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
  return normalized === 'anteojos de receta' || normalized === 'anteojos recetados';
}
