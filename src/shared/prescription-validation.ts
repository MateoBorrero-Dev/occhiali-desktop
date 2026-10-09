import type {
  CorrectPrescriptionInput,
  CreatePrescriptionInput,
  CreatePrescriptionValueInput,
  PrescriptionsByClientRequest,
  PrescriptionListRequest,
} from './database-models';

export type PrescriptionInputField =
  | 'clientId'
  | 'prescriptionDate'
  | 'prescriberName'
  | 'notes'
  | 'values'
  | 'reason'
  | 'query'
  | 'dateFrom'
  | 'dateTo'
  | 'form';

export interface PrescriptionValidationIssue {
  field: string;
  message: string;
}

export class PrescriptionValidationError extends Error {
  public constructor(public readonly issues: readonly PrescriptionValidationIssue[]) {
    super(issues[0]?.message ?? 'Los datos de la receta no son válidos.');
    this.name = 'PrescriptionValidationError';
  }
}

export const PRESCRIPTION_FIELD_LIMITS = Object.freeze({
  prescriberName: 200,
  notes: 2_000,
  reason: 500,
  query: 100,
  decimal: 16,
});

const VALUE_KEYS = ['distance', 'eye', 'sphere', 'cylinder', 'axis', 'dip', 'height'] as const;
const CREATE_KEYS = ['clientId', 'prescriptionDate', 'prescriberName', 'notes', 'values'] as const;
const CORRECTION_KEYS = [
  'prescriptionDate',
  'prescriberName',
  'notes',
  'values',
  'reason',
] as const;
const LIST_KEYS = ['query', 'dateFrom', 'dateTo', 'limit', 'offset'] as const;
const BY_CLIENT_KEYS = ['clientId', 'limit', 'offset'] as const;

function asRecord(value: unknown, field: PrescriptionInputField = 'form'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PrescriptionValidationError([
      { field, message: 'Los datos enviados no son válidos.' },
    ]);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'Los datos enviados contienen campos no permitidos.' },
    ]);
  }
}

function optionalText(
  value: unknown,
  field: 'prescriberName' | 'notes',
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new PrescriptionValidationError([{ field, message: `${label} no es válido.` }]);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > PRESCRIPTION_FIELD_LIMITS[field]) {
    throw new PrescriptionValidationError([
      {
        field,
        message: `${label} no puede superar los ${PRESCRIPTION_FIELD_LIMITS[field]} caracteres.`,
      },
    ]);
  }
  return normalized;
}

function calendarDate(
  value: unknown,
  field: 'prescriptionDate' | 'dateFrom' | 'dateTo',
  label: string,
): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PrescriptionValidationError([{ field, message: `${label} no es válida.` }]);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new PrescriptionValidationError([{ field, message: `${label} no es válida.` }]);
  }
  return value;
}

export function parsePrescriptionId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'El identificador de la receta no es válido.' },
    ]);
  }
  return value;
}

export function parsePrescriptionClientId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new PrescriptionValidationError([
      { field: 'clientId', message: 'Seleccioná un cliente válido.' },
    ]);
  }
  return value;
}

export function normalizeOpticalDecimal(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new PrescriptionValidationError([{ field, message: 'Ingresá un número válido.' }]);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (
    normalized.length > PRESCRIPTION_FIELD_LIMITS.decimal ||
    !/^[+-]?\d+(?:[.,]\d{1,2})?$/.test(normalized)
  ) {
    throw new PrescriptionValidationError([
      { field, message: 'Usá un número con hasta dos decimales, por ejemplo -2,50.' },
    ]);
  }
  const canonical = normalized.replace(',', '.');
  const negative = canonical.startsWith('-');
  const unsigned = canonical.replace(/^[+-]/, '');
  const [integerPart = '0', decimalPart = ''] = unsigned.split('.');
  const integer = String(Number(integerPart));
  const decimals = decimalPart.padEnd(2, '0');
  return `${negative ? '-' : ''}${integer}.${decimals}`;
}

function parseAxis(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isInteger(numeric) || numeric < 0 || numeric > 180) {
    throw new PrescriptionValidationError([
      { field, message: 'El eje debe ser un número entero entre 0 y 180.' },
    ]);
  }
  return numeric;
}

function parseValue(value: unknown, index: number): CreatePrescriptionValueInput {
  const record = asRecord(value, 'values');
  assertOnlyKeys(record, VALUE_KEYS);
  if (record.distance !== 'FAR' && record.distance !== 'NEAR') {
    throw new PrescriptionValidationError([
      { field: `values.${index}.distance`, message: 'El tipo de visión no es válido.' },
    ]);
  }
  if (record.eye !== 'OD' && record.eye !== 'OI') {
    throw new PrescriptionValidationError([
      { field: `values.${index}.eye`, message: 'El ojo indicado no es válido.' },
    ]);
  }
  return {
    distance: record.distance,
    eye: record.eye,
    sphere: normalizeOpticalDecimal(record.sphere, `values.${index}.sphere`),
    cylinder: normalizeOpticalDecimal(record.cylinder, `values.${index}.cylinder`),
    axis: parseAxis(record.axis, `values.${index}.axis`),
    dip: normalizeOpticalDecimal(record.dip, `values.${index}.dip`),
    height: normalizeOpticalDecimal(record.height, `values.${index}.height`),
  };
}

function meaningfulValue(value: CreatePrescriptionValueInput): boolean {
  return (
    value.sphere !== null ||
    value.cylinder !== null ||
    value.axis !== null ||
    value.dip !== null ||
    value.height !== null
  );
}

function parseValues(value: unknown): CreatePrescriptionValueInput[] {
  if (!Array.isArray(value) || value.length > 4) {
    throw new PrescriptionValidationError([
      { field: 'values', message: 'La receta puede contener hasta cuatro filas de graduación.' },
    ]);
  }
  const parsed = value.map(parseValue).filter(meaningfulValue);
  if (parsed.length === 0) {
    throw new PrescriptionValidationError([
      { field: 'values', message: 'Ingresá al menos un dato óptico antes de guardar.' },
    ]);
  }
  const combinations = new Set<string>();
  for (const item of parsed) {
    const key = `${item.distance}:${item.eye}`;
    if (combinations.has(key)) {
      throw new PrescriptionValidationError([
        { field: 'values', message: 'No se puede repetir la misma combinación de visión y ojo.' },
      ]);
    }
    combinations.add(key);
  }
  return parsed;
}

function parsePrescriptionCore(record: Record<string, unknown>) {
  return {
    prescriptionDate: calendarDate(
      record.prescriptionDate,
      'prescriptionDate',
      'La fecha de la receta',
    ),
    prescriberName: optionalText(record.prescriberName, 'prescriberName', 'El profesional'),
    notes: optionalText(record.notes, 'notes', 'Las observaciones'),
    values: parseValues(record.values),
  };
}

export function parseCreatePrescriptionInput(value: unknown): CreatePrescriptionInput {
  const record = asRecord(value);
  assertOnlyKeys(record, CREATE_KEYS);
  return { clientId: parsePrescriptionClientId(record.clientId), ...parsePrescriptionCore(record) };
}

export function parseCorrectPrescriptionInput(value: unknown): CorrectPrescriptionInput {
  const record = asRecord(value);
  assertOnlyKeys(record, CORRECTION_KEYS);
  const reasonValue = record.reason;
  if (typeof reasonValue !== 'string' || !reasonValue.trim()) {
    throw new PrescriptionValidationError([
      { field: 'reason', message: 'Indicá el motivo de la corrección.' },
    ]);
  }
  const reason = reasonValue.trim();
  if (reason.length > PRESCRIPTION_FIELD_LIMITS.reason) {
    throw new PrescriptionValidationError([
      {
        field: 'reason',
        message: `El motivo no puede superar los ${PRESCRIPTION_FIELD_LIMITS.reason} caracteres.`,
      },
    ]);
  }
  return { ...parsePrescriptionCore(record), reason };
}

function parsePage(value: Record<string, unknown>): { limit: number; offset: number } {
  const limit = value.limit ?? 25;
  const offset = value.offset ?? 0;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'El tamaño de página no es válido.' },
    ]);
  }
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new PrescriptionValidationError([
      { field: 'form', message: 'La página solicitada no es válida.' },
    ]);
  }
  return { limit, offset };
}

export function parsePrescriptionListRequest(value: unknown): Required<PrescriptionListRequest> {
  const record = value === undefined ? {} : asRecord(value);
  assertOnlyKeys(record, LIST_KEYS);
  const queryValue = record.query ?? '';
  if (typeof queryValue !== 'string') {
    throw new PrescriptionValidationError([
      { field: 'query', message: 'La búsqueda no es válida.' },
    ]);
  }
  const query = queryValue.trim().replace(/\s+/g, ' ');
  if (query.length > PRESCRIPTION_FIELD_LIMITS.query) {
    throw new PrescriptionValidationError([
      { field: 'query', message: 'La búsqueda es demasiado larga.' },
    ]);
  }
  const dateFrom =
    record.dateFrom == null || record.dateFrom === ''
      ? null
      : calendarDate(record.dateFrom, 'dateFrom', 'La fecha desde');
  const dateTo =
    record.dateTo == null || record.dateTo === ''
      ? null
      : calendarDate(record.dateTo, 'dateTo', 'La fecha hasta');
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new PrescriptionValidationError([
      { field: 'dateTo', message: 'La fecha hasta debe ser igual o posterior a la fecha desde.' },
    ]);
  }
  return { query, dateFrom, dateTo, ...parsePage(record) };
}

export function parsePrescriptionsByClientRequest(
  value: unknown,
): Required<PrescriptionsByClientRequest> {
  const record = asRecord(value);
  assertOnlyKeys(record, BY_CLIENT_KEYS);
  return { clientId: parsePrescriptionClientId(record.clientId), ...parsePage(record) };
}
