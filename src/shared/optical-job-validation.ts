import type {
  CreateOpticalJobInput,
  OpticalJobListRequest,
  OpticalJobsByClientRequest,
  UpdateOpticalJobInput,
} from './database-models';

export class OpticalJobValidationError extends Error {
  public constructor(public readonly issues: readonly { field: string; message: string }[]) {
    super(issues[0]?.message ?? 'Los datos de la ficha no son válidos.');
    this.name = 'OpticalJobValidationError';
  }
}

export const OPTICAL_JOB_FIELD_LIMITS = Object.freeze({
  jobNumber: 50,
  product: 200,
  frameModel: 200,
  observations: 2_000,
  query: 100,
  treatmentId: 100,
});

const CREATE_KEYS = [
  'clientId',
  'prescriptionId',
  'jobNumber',
  'product',
  'frameCondition',
  'frameMaterial',
  'frameModel',
  'colorType',
  'observations',
  'treatmentIds',
] as const;
const UPDATE_KEYS = CREATE_KEYS.filter((key) => key !== 'clientId');
const LIST_KEYS = ['query', 'limit', 'offset'] as const;
const BY_CLIENT_KEYS = ['clientId', 'limit', 'offset'] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpticalJobValidationError([
      { field: 'form', message: 'Los datos enviados no son válidos.' },
    ]);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new OpticalJobValidationError([
      { field: 'form', message: 'Los datos enviados contienen campos no permitidos.' },
    ]);
  }
}

export function parseOpticalJobId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new OpticalJobValidationError([
      { field: 'form', message: 'El identificador de la ficha no es válido.' },
    ]);
  }
  return value;
}

export function parseOpticalJobClientId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new OpticalJobValidationError([
      { field: 'clientId', message: 'Seleccioná un cliente válido.' },
    ]);
  }
  return value;
}

function optionalId(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new OpticalJobValidationError([{ field, message: 'Seleccioná una receta válida.' }]);
  }
  return value;
}

function optionalText(
  value: unknown,
  field: 'jobNumber' | 'product' | 'frameModel' | 'observations',
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new OpticalJobValidationError([{ field, message: `${label} no es válido.` }]);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > OPTICAL_JOB_FIELD_LIMITS[field]) {
    throw new OpticalJobValidationError([
      {
        field,
        message: `${label} no puede superar los ${OPTICAL_JOB_FIELD_LIMITS[field]} caracteres.`,
      },
    ]);
  }
  return normalized;
}

function enumeration<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  message: string,
): T | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new OpticalJobValidationError([{ field, message }]);
  }
  return value as T;
}

function treatmentIds(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) {
    throw new OpticalJobValidationError([
      { field: 'treatmentIds', message: 'La selección de tratamientos no es válida.' },
    ]);
  }
  const parsed = value.map((item) => {
    if (
      typeof item !== 'string' ||
      !item.trim() ||
      item.length > OPTICAL_JOB_FIELD_LIMITS.treatmentId
    ) {
      throw new OpticalJobValidationError([
        { field: 'treatmentIds', message: 'La selección de tratamientos no es válida.' },
      ]);
    }
    return item.trim();
  });
  if (new Set(parsed).size !== parsed.length) {
    throw new OpticalJobValidationError([
      { field: 'treatmentIds', message: 'No se puede repetir un tratamiento o acabado.' },
    ]);
  }
  return parsed;
}

function parseCore(record: Record<string, unknown>): UpdateOpticalJobInput {
  return {
    prescriptionId: optionalId(record.prescriptionId, 'prescriptionId'),
    jobNumber: optionalText(record.jobNumber, 'jobNumber', 'El número de ficha'),
    product: optionalText(record.product, 'product', 'El producto'),
    frameCondition: enumeration<'NEW' | 'USED'>(
      record.frameCondition,
      'frameCondition',
      ['NEW', 'USED'],
      'La condición del armazón no es válida.',
    ),
    frameMaterial: enumeration<'ZILO' | 'METAL'>(
      record.frameMaterial,
      'frameMaterial',
      ['ZILO', 'METAL'],
      'El material del armazón no es válido.',
    ),
    frameModel: optionalText(record.frameModel, 'frameModel', 'El modelo del armazón'),
    colorType: enumeration<'FULL' | 'GRADIENT'>(
      record.colorType,
      'colorType',
      ['FULL', 'GRADIENT'],
      'La coloración no es válida.',
    ),
    observations: optionalText(record.observations, 'observations', 'Las observaciones'),
    treatmentIds: treatmentIds(record.treatmentIds),
  };
}

export function parseCreateOpticalJobInput(value: unknown): CreateOpticalJobInput {
  const record = asRecord(value);
  assertOnlyKeys(record, CREATE_KEYS);
  return { clientId: parseOpticalJobClientId(record.clientId), ...parseCore(record) };
}

export function parseUpdateOpticalJobInput(value: unknown): UpdateOpticalJobInput {
  const record = asRecord(value);
  assertOnlyKeys(record, UPDATE_KEYS);
  return parseCore(record);
}

function page(record: Record<string, unknown>): { limit: number; offset: number } {
  const limit = record.limit ?? 25;
  const offset = record.offset ?? 0;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new OpticalJobValidationError([
      { field: 'form', message: 'El tamaño de página no es válido.' },
    ]);
  }
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new OpticalJobValidationError([
      { field: 'form', message: 'La página solicitada no es válida.' },
    ]);
  }
  return { limit, offset };
}

export function parseOpticalJobListRequest(value: unknown): Required<OpticalJobListRequest> {
  const record = value === undefined ? {} : asRecord(value);
  assertOnlyKeys(record, LIST_KEYS);
  const queryValue = record.query ?? '';
  if (typeof queryValue !== 'string') {
    throw new OpticalJobValidationError([{ field: 'query', message: 'La búsqueda no es válida.' }]);
  }
  const query = queryValue.trim().replace(/\s+/g, ' ');
  if (query.length > OPTICAL_JOB_FIELD_LIMITS.query) {
    throw new OpticalJobValidationError([
      { field: 'query', message: 'La búsqueda es demasiado larga.' },
    ]);
  }
  return { query, ...page(record) };
}

export function parseOpticalJobsByClientRequest(
  value: unknown,
): Required<OpticalJobsByClientRequest> {
  const record = asRecord(value);
  assertOnlyKeys(record, BY_CLIENT_KEYS);
  return { clientId: parseOpticalJobClientId(record.clientId), ...page(record) };
}
