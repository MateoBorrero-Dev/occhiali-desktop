import type {
  CreateDeliveryReceiptEventInput,
  CreateDeliveryReceiptInput,
  DeliveryReceiptListRequest,
  DeliveryRecipientType,
  DeliveryReceiptEventType,
} from './database-models';

export class DeliveryReceiptValidationError extends Error {
  public constructor(public readonly issues: readonly { field: string; message: string }[]) {
    super(issues[0]?.message ?? 'Los datos del retiro no son válidos.');
    this.name = 'DeliveryReceiptValidationError';
  }
}

export const DELIVERY_RECEIPT_LIMITS = Object.freeze({
  fullName: 200,
  documentNumber: 30,
  relationship: 100,
  authorizationReference: 500,
  deliveredBy: 200,
  notes: 2_000,
  reason: 1_000,
  query: 200,
});

const CREATE_KEYS = [
  'opticalJobId',
  'deliveredAt',
  'recipientType',
  'recipientFullName',
  'recipientDocumentNumber',
  'recipientRelationship',
  'authorizationReference',
  'authorizationConfirmed',
  'deliveredBy',
  'deliveryNotes',
  'deliveryConfirmed',
] as const;
const EVENT_KEYS = ['receiptId', 'type', 'reason'] as const;
const LIST_KEYS = ['query', 'status', 'dateFrom', 'dateTo', 'limit', 'offset'] as const;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new DeliveryReceiptValidationError([
      { field: 'form', message: 'La solicitud no es válida.' },
    ]);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new DeliveryReceiptValidationError([
      { field: 'form', message: 'La solicitud contiene campos no permitidos.' },
    ]);
}

export function parseDeliveryReceiptId(value: unknown, field = 'receiptId'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new DeliveryReceiptValidationError([
      { field, message: 'El identificador no es válido.' },
    ]);
  return value;
}

function calendarDate(value: unknown, field: string, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new DeliveryReceiptValidationError([{ field, message: `${label} no es válida.` }]);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new DeliveryReceiptValidationError([{ field, message: `${label} no es válida.` }]);
  return value;
}

export function parseDeliveryReceiptListRequest(
  value: unknown,
): Required<DeliveryReceiptListRequest> {
  const input = value === undefined ? {} : record(value);
  onlyKeys(input, LIST_KEYS);

  const queryValue = input.query ?? '';
  if (typeof queryValue !== 'string')
    throw new DeliveryReceiptValidationError([
      { field: 'query', message: 'La búsqueda no es válida.' },
    ]);
  const query = queryValue.trim().replace(/\s+/g, ' ');
  if (query.length > DELIVERY_RECEIPT_LIMITS.query)
    throw new DeliveryReceiptValidationError([
      { field: 'query', message: 'La búsqueda es demasiado larga.' },
    ]);

  const statusValue = input.status ?? null;
  if (
    statusValue !== null &&
    statusValue !== 'CONFIRMED' &&
    statusValue !== 'CORRECTED' &&
    statusValue !== 'ANNULLED'
  )
    throw new DeliveryReceiptValidationError([
      { field: 'status', message: 'El estado no es válido.' },
    ]);

  const dateFrom =
    input.dateFrom == null || input.dateFrom === ''
      ? null
      : calendarDate(input.dateFrom, 'dateFrom', 'La fecha desde');
  const dateTo =
    input.dateTo == null || input.dateTo === ''
      ? null
      : calendarDate(input.dateTo, 'dateTo', 'La fecha hasta');
  if (dateFrom && dateTo && dateFrom > dateTo)
    throw new DeliveryReceiptValidationError([
      { field: 'dateTo', message: 'La fecha hasta debe ser igual o posterior a la fecha desde.' },
    ]);

  const limit = input.limit ?? 25;
  const offset = input.offset ?? 0;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new DeliveryReceiptValidationError([
      { field: 'form', message: 'El tamaño de página no es válido.' },
    ]);
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0)
    throw new DeliveryReceiptValidationError([
      { field: 'form', message: 'La página solicitada no es válida.' },
    ]);

  return { query, status: statusValue, dateFrom, dateTo, limit, offset };
}

function requiredText(value: unknown, field: string, label: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim())
    throw new DeliveryReceiptValidationError([{ field, message: `${label} es obligatorio.` }]);
  const normalized = value.trim();
  if (normalized.length > limit)
    throw new DeliveryReceiptValidationError([
      { field, message: `${label} no puede superar los ${limit} caracteres.` },
    ]);
  return normalized;
}

function optionalText(value: unknown, field: string, label: string, limit: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string')
    throw new DeliveryReceiptValidationError([{ field, message: `${label} no es válido.` }]);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > limit)
    throw new DeliveryReceiptValidationError([
      { field, message: `${label} no puede superar los ${limit} caracteres.` },
    ]);
  return normalized;
}

function recipientType(value: unknown): DeliveryRecipientType {
  if (value !== 'OWNER' && value !== 'AUTHORIZED_THIRD_PARTY')
    throw new DeliveryReceiptValidationError([
      { field: 'recipientType', message: 'Indicá quién retira el producto.' },
    ]);
  return value;
}

export function parseCreateDeliveryReceiptInput(value: unknown): CreateDeliveryReceiptInput {
  const input = record(value);
  onlyKeys(input, CREATE_KEYS);
  const type = recipientType(input.recipientType);
  const deliveredAt = requiredText(input.deliveredAt, 'deliveredAt', 'La fecha y hora', 40);
  if (!Number.isFinite(Date.parse(deliveredAt)))
    throw new DeliveryReceiptValidationError([
      { field: 'deliveredAt', message: 'Ingresá una fecha y hora válidas.' },
    ]);
  const recipientDocumentNumber = optionalText(
    input.recipientDocumentNumber,
    'recipientDocumentNumber',
    'El DNI',
    DELIVERY_RECEIPT_LIMITS.documentNumber,
  );
  const recipientRelationship = optionalText(
    input.recipientRelationship,
    'recipientRelationship',
    'El vínculo',
    DELIVERY_RECEIPT_LIMITS.relationship,
  );
  const authorizationReference = optionalText(
    input.authorizationReference,
    'authorizationReference',
    'La referencia de autorización',
    DELIVERY_RECEIPT_LIMITS.authorizationReference,
  );
  if (type === 'AUTHORIZED_THIRD_PARTY') {
    if (!recipientDocumentNumber)
      throw new DeliveryReceiptValidationError([
        { field: 'recipientDocumentNumber', message: 'El DNI de quien retira es obligatorio.' },
      ]);
    if (!recipientRelationship)
      throw new DeliveryReceiptValidationError([
        { field: 'recipientRelationship', message: 'El vínculo con el titular es obligatorio.' },
      ]);
    if (!authorizationReference)
      throw new DeliveryReceiptValidationError([
        { field: 'authorizationReference', message: 'Describí la autorización presentada.' },
      ]);
    if (input.authorizationConfirmed !== true)
      throw new DeliveryReceiptValidationError([
        {
          field: 'authorizationConfirmed',
          message: 'Confirmá que comprobaste la identidad y la autorización.',
        },
      ]);
  }
  if (input.deliveryConfirmed !== true)
    throw new DeliveryReceiptValidationError([
      {
        field: 'deliveryConfirmed',
        message: 'Confirmá expresamente que el producto fue entregado.',
      },
    ]);
  return {
    opticalJobId: parseDeliveryReceiptId(input.opticalJobId, 'opticalJobId'),
    deliveredAt: new Date(deliveredAt).toISOString(),
    recipientType: type,
    recipientFullName: requiredText(
      input.recipientFullName,
      'recipientFullName',
      'El nombre de quien retira',
      DELIVERY_RECEIPT_LIMITS.fullName,
    ),
    recipientDocumentNumber,
    recipientRelationship: type === 'OWNER' ? null : recipientRelationship,
    authorizationReference: type === 'OWNER' ? null : authorizationReference,
    authorizationConfirmed: type === 'AUTHORIZED_THIRD_PARTY',
    deliveredBy: requiredText(
      input.deliveredBy,
      'deliveredBy',
      'La persona responsable de la entrega',
      DELIVERY_RECEIPT_LIMITS.deliveredBy,
    ),
    deliveryNotes: optionalText(
      input.deliveryNotes,
      'deliveryNotes',
      'Las observaciones',
      DELIVERY_RECEIPT_LIMITS.notes,
    ),
    deliveryConfirmed: true,
  };
}

export function parseDeliveryReceiptEventInput(value: unknown): CreateDeliveryReceiptEventInput {
  const input = record(value);
  onlyKeys(input, EVENT_KEYS);
  const type: DeliveryReceiptEventType =
    input.type === 'CORRECTION_NOTE'
      ? 'CORRECTION_NOTE'
      : input.type === 'ANNULLED'
        ? 'ANNULLED'
        : (() => {
            throw new DeliveryReceiptValidationError([
              { field: 'type', message: 'El tipo de evento no es válido.' },
            ]);
          })();
  return {
    receiptId: parseDeliveryReceiptId(input.receiptId),
    type,
    reason: requiredText(input.reason, 'reason', 'El motivo', DELIVERY_RECEIPT_LIMITS.reason),
  };
}
