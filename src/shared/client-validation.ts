import type { ClientListRequest, CreateClientInput, UpdateClientInput } from './database-models';

export type ClientInputField =
  | 'firstName'
  | 'lastName'
  | 'documentNumber'
  | 'phone'
  | 'address'
  | 'birthDate'
  | 'notes'
  | 'form';

export interface ClientValidationIssue {
  field: ClientInputField;
  message: string;
}

const CLIENT_FIELDS = [
  'firstName',
  'lastName',
  'documentNumber',
  'phone',
  'address',
  'birthDate',
  'notes',
] as const;

const CLIENT_UPDATE_FIELDS = [...CLIENT_FIELDS, 'isArchived'] as const;
const LIST_FIELDS = ['query', 'status', 'limit', 'offset'] as const;

export const CLIENT_FIELD_LIMITS = Object.freeze({
  firstName: 100,
  lastName: 100,
  documentNumber: 20,
  phone: 50,
  address: 300,
  notes: 2_000,
  query: 100,
});

export class ClientValidationError extends Error {
  public constructor(public readonly issues: readonly ClientValidationIssue[]) {
    super(issues[0]?.message ?? 'Los datos del cliente no son válidos.');
    this.name = 'ClientValidationError';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ClientValidationError([
      { field: 'form', message: 'Los datos enviados no son válidos.' },
    ]);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new ClientValidationError([
      { field: 'form', message: 'Los datos enviados contienen campos no permitidos.' },
    ]);
  }
}

function optionalString(value: unknown, field: ClientInputField): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ClientValidationError([{ field, message: 'Ingresá un valor de texto válido.' }]);
  }
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function requiredName(value: unknown, field: 'firstName' | 'lastName', label: string): string {
  const normalized = optionalString(value, field)?.replace(/\s+/g, ' ') ?? '';
  if (normalized.length === 0) {
    throw new ClientValidationError([{ field, message: `${label} es obligatorio.` }]);
  }
  if (normalized.length > CLIENT_FIELD_LIMITS[field]) {
    throw new ClientValidationError([
      { field, message: `${label} no puede superar los ${CLIENT_FIELD_LIMITS[field]} caracteres.` },
    ]);
  }
  return normalized;
}

function limitedOptionalText(
  value: unknown,
  field: 'phone' | 'address' | 'notes',
  label: string,
): string | null {
  const normalized = optionalString(value, field);
  if (normalized && normalized.length > CLIENT_FIELD_LIMITS[field]) {
    throw new ClientValidationError([
      { field, message: `${label} no puede superar los ${CLIENT_FIELD_LIMITS[field]} caracteres.` },
    ]);
  }
  return normalized;
}

export function normalizeDocumentNumber(value: unknown): string | null {
  const normalized = optionalString(value, 'documentNumber');
  if (normalized === null) {
    return null;
  }
  if (!/^[\d.\s-]+$/.test(normalized)) {
    throw new ClientValidationError([
      {
        field: 'documentNumber',
        message: 'El DNI solo puede contener números, puntos, espacios o guiones.',
      },
    ]);
  }
  const digits = normalized.replace(/[.\s-]/g, '');
  if (digits.length === 0 || digits.length > CLIENT_FIELD_LIMITS.documentNumber) {
    throw new ClientValidationError([
      { field: 'documentNumber', message: 'Ingresá un DNI válido de hasta 20 dígitos.' },
    ]);
  }
  return digits;
}

function normalizeBirthDate(value: unknown): string | null {
  const normalized = optionalString(value, 'birthDate');
  if (normalized === null) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ClientValidationError([
      { field: 'birthDate', message: 'Ingresá una fecha de nacimiento válida.' },
    ]);
  }
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new ClientValidationError([
      { field: 'birthDate', message: 'Ingresá una fecha de nacimiento válida.' },
    ]);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (normalized > today) {
    throw new ClientValidationError([
      { field: 'birthDate', message: 'La fecha de nacimiento no puede ser futura.' },
    ]);
  }
  return normalized;
}

export function parseCreateClientInput(value: unknown): CreateClientInput {
  const record = asRecord(value);
  assertOnlyKeys(record, CLIENT_FIELDS);
  return {
    firstName: requiredName(record.firstName, 'firstName', 'El nombre'),
    lastName: requiredName(record.lastName, 'lastName', 'El apellido'),
    documentNumber: normalizeDocumentNumber(record.documentNumber),
    phone: limitedOptionalText(record.phone, 'phone', 'El teléfono'),
    address: limitedOptionalText(record.address, 'address', 'La dirección'),
    birthDate: normalizeBirthDate(record.birthDate),
    notes: limitedOptionalText(record.notes, 'notes', 'Las observaciones'),
  };
}

export function parseUpdateClientInput(value: unknown): UpdateClientInput {
  const record = asRecord(value);
  assertOnlyKeys(record, CLIENT_UPDATE_FIELDS);
  if (Object.keys(record).length === 0) {
    throw new ClientValidationError([{ field: 'form', message: 'No hay cambios para guardar.' }]);
  }

  const result: UpdateClientInput = {};
  if ('firstName' in record)
    result.firstName = requiredName(record.firstName, 'firstName', 'El nombre');
  if ('lastName' in record)
    result.lastName = requiredName(record.lastName, 'lastName', 'El apellido');
  if ('documentNumber' in record)
    result.documentNumber = normalizeDocumentNumber(record.documentNumber);
  if ('phone' in record) result.phone = limitedOptionalText(record.phone, 'phone', 'El teléfono');
  if ('address' in record)
    result.address = limitedOptionalText(record.address, 'address', 'La dirección');
  if ('birthDate' in record) result.birthDate = normalizeBirthDate(record.birthDate);
  if ('notes' in record)
    result.notes = limitedOptionalText(record.notes, 'notes', 'Las observaciones');
  if ('isArchived' in record) {
    if (typeof record.isArchived !== 'boolean') {
      throw new ClientValidationError([
        { field: 'form', message: 'El estado del cliente no es válido.' },
      ]);
    }
    result.isArchived = record.isArchived;
  }
  return result;
}

export function parseClientId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new ClientValidationError([
      { field: 'form', message: 'El identificador del cliente no es válido.' },
    ]);
  }
  return value;
}

export function parseClientListRequest(value: unknown): Required<ClientListRequest> {
  const record = value === undefined ? {} : asRecord(value);
  assertOnlyKeys(record, LIST_FIELDS);
  const queryValue = record.query ?? '';
  if (typeof queryValue !== 'string') {
    throw new ClientValidationError([{ field: 'form', message: 'La búsqueda no es válida.' }]);
  }
  const query = queryValue.trim().replace(/\s+/g, ' ');
  if (query.length > CLIENT_FIELD_LIMITS.query) {
    throw new ClientValidationError([
      { field: 'form', message: 'La búsqueda es demasiado larga.' },
    ]);
  }
  const status = record.status ?? 'active';
  if (status !== 'active' && status !== 'archived' && status !== 'all') {
    throw new ClientValidationError([
      { field: 'form', message: 'El filtro de estado no es válido.' },
    ]);
  }
  const limit = record.limit ?? 50;
  const offset = record.offset ?? 0;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ClientValidationError([
      { field: 'form', message: 'El tamaño de página no es válido.' },
    ]);
  }
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new ClientValidationError([
      { field: 'form', message: 'La página solicitada no es válida.' },
    ]);
  }
  return { query, status, limit, offset };
}
