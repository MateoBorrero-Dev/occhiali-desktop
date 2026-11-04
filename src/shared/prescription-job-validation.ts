import type { CreatePrescriptionBundleInput, UpdateOpticalFileInput } from './database-models';
import {
  parseCreateIntegratedOpticalJobInput,
  parseUpdateOpticalJobInput,
} from './optical-job-validation';
import {
  parseCorrectPrescriptionInput,
  parseCreatePrescriptionInput,
  parseIntegratedPrescriptionInput,
  PrescriptionValidationError,
} from './prescription-validation';

const BUNDLE_KEYS = ['prescription', 'opticalJob'] as const;
const UPDATE_KEYS = ['opticalJob', 'prescription', 'confirmSharedPrescription'] as const;

export function parseCreatePrescriptionBundleInput(value: unknown): CreatePrescriptionBundleInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'Los datos enviados no son válidos.' },
    ]);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !(BUNDLE_KEYS as readonly string[]).includes(key)) ||
    !Object.hasOwn(record, 'prescription') ||
    !Object.hasOwn(record, 'opticalJob')
  ) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'La solicitud integrada no es válida.' },
    ]);
  }

  const opticalJob =
    record.opticalJob === null ? null : parseCreateIntegratedOpticalJobInput(record.opticalJob);
  const requireOpticalData = opticalJob === null || opticalJob.product === 'Anteojos de receta';
  return {
    prescription: opticalJob
      ? parseIntegratedPrescriptionInput(record.prescription, requireOpticalData)
      : parseCreatePrescriptionInput(record.prescription),
    opticalJob,
  };
}

export function parseUpdateOpticalFileInput(value: unknown): UpdateOpticalFileInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'Los datos enviados no son válidos.' },
    ]);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !(UPDATE_KEYS as readonly string[]).includes(key)) ||
    !Object.hasOwn(record, 'opticalJob') ||
    !Object.hasOwn(record, 'prescription') ||
    typeof record.confirmSharedPrescription !== 'boolean'
  ) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'La solicitud de actualización integrada no es válida.' },
    ]);
  }
  return {
    opticalJob: parseUpdateOpticalJobInput(record.opticalJob),
    prescription:
      record.prescription === null
        ? null
        : parseCorrectPrescriptionInput(record.prescription, false),
    confirmSharedPrescription: record.confirmSharedPrescription,
  };
}
