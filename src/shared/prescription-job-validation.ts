import type { CreatePrescriptionBundleInput } from './database-models';
import { parseCreateIntegratedOpticalJobInput } from './optical-job-validation';
import {
  parseCreatePrescriptionInput,
  PrescriptionValidationError,
} from './prescription-validation';

const BUNDLE_KEYS = ['prescription', 'opticalJob'] as const;

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

  return {
    prescription: parseCreatePrescriptionInput(record.prescription),
    opticalJob:
      record.opticalJob === null ? null : parseCreateIntegratedOpticalJobInput(record.opticalJob),
  };
}
