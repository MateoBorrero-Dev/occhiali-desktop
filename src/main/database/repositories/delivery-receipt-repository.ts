import type Database from 'better-sqlite3';
import type {
  CreateDeliveryReceiptEventInput,
  CreateDeliveryReceiptInput,
  DeliveryReceipt,
  DeliveryReceiptEvent,
  DeliveryReceiptEventType,
  DeliveryReceiptStatus,
  DeliveryRecipientType,
  FrameCondition,
  FrameMaterial,
  ColorType,
} from '../../../shared/database-models';
import {
  parseCreateDeliveryReceiptInput,
  parseDeliveryReceiptEventInput,
} from '../../../shared/delivery-receipt-validation';

interface ReceiptRow {
  id: number;
  receipt_number: string;
  optical_job_id: number;
  delivered_at: string;
  registered_at: string;
  status: DeliveryReceiptStatus;
  client_first_name: string;
  client_last_name: string;
  client_document_number: string | null;
  client_phone: string | null;
  job_number: string | null;
  product: string | null;
  lens: string | null;
  brand: string | null;
  frame_condition: FrameCondition | null;
  frame_material: FrameMaterial | null;
  frame_model: string | null;
  product_color: string | null;
  supplier: string | null;
  color_type: ColorType | null;
  product_observations: string | null;
  treatment_names_json: string;
  recipient_type: DeliveryRecipientType;
  recipient_full_name: string;
  recipient_document_number: string | null;
  recipient_relationship: string | null;
  authorization_reference: string | null;
  authorization_confirmed: number;
  delivered_by: string;
  delivery_notes: string | null;
  delivery_confirmed: number;
}

interface EventRow {
  id: number;
  receipt_id: number;
  event_type: DeliveryReceiptEventType;
  reason: string;
  created_at: string;
}

interface SnapshotRow {
  optical_job_id: number;
  client_first_name: string;
  client_last_name: string;
  client_document_number: string | null;
  client_phone: string | null;
  job_number: string | null;
  product: string | null;
  lens: string | null;
  brand: string | null;
  frame_condition: FrameCondition | null;
  frame_material: FrameMaterial | null;
  frame_model: string | null;
  product_color: string | null;
  supplier: string | null;
  color_type: ColorType | null;
  product_observations: string | null;
}

export class DeliveryReceiptNotFoundError extends Error {
  public constructor() {
    super('No existe el comprobante solicitado.');
    this.name = 'DeliveryReceiptNotFoundError';
  }
}

export class DeliveryReceiptJobNotFoundError extends Error {
  public constructor() {
    super('No existe la ficha asociada.');
    this.name = 'DeliveryReceiptJobNotFoundError';
  }
}

export class DuplicateDeliveryReceiptError extends Error {
  public constructor() {
    super('La ficha ya tiene un comprobante de retiro.');
    this.name = 'DuplicateDeliveryReceiptError';
  }
}

export class DeliveryReceiptStateError extends Error {
  public constructor(message = 'El comprobante ya está anulado y no admite nuevos cambios.') {
    super(message);
    this.name = 'DeliveryReceiptStateError';
  }
}

function insertedId(result: Database.RunResult): number {
  const id = Number(result.lastInsertRowid);
  if (!Number.isSafeInteger(id)) throw new RangeError('SQLite devolvió un identificador inválido.');
  return id;
}

function parseTreatmentNames(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error('El snapshot de tratamientos no es válido.');
  const names: string[] = [];
  for (const item of parsed as unknown[]) {
    if (typeof item !== 'string') throw new Error('El snapshot de tratamientos no es válido.');
    names.push(item);
  }
  return names;
}

export class DeliveryReceiptRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: CreateDeliveryReceiptInput): DeliveryReceipt {
    const normalized = parseCreateDeliveryReceiptInput(input);
    return this.database.transaction(() => {
      if (this.getByJobId(normalized.opticalJobId)) throw new DuplicateDeliveryReceiptError();
      const snapshot = this.database
        .prepare(
          `SELECT
             j.id AS optical_job_id, c.first_name AS client_first_name,
             c.last_name AS client_last_name, c.document_number AS client_document_number,
             c.phone AS client_phone, j.job_number, j.product, j.frame_condition,
             j.lens, j.brand, j.frame_material, j.frame_model, j.product_color, j.supplier, j.color_type,
             j.observations AS product_observations
           FROM optical_jobs j
           JOIN clients c ON c.id = j.client_id
           WHERE j.id = ?`,
        )
        .get(normalized.opticalJobId) as SnapshotRow | undefined;
      if (!snapshot) throw new DeliveryReceiptJobNotFoundError();
      const treatmentNames = this.database
        .prepare(
          `SELECT t.name FROM optical_job_treatments jt
           JOIN treatments t ON t.id = jt.treatment_id
           WHERE jt.optical_job_id = ? ORDER BY t.name COLLATE NOCASE`,
        )
        .all(normalized.opticalJobId) as Array<{ name: string }>;
      const sequence = this.database
        .prepare(
          `UPDATE delivery_receipt_sequence SET last_number = last_number + 1
           WHERE id = 1 RETURNING last_number`,
        )
        .get() as { last_number: number } | undefined;
      if (!sequence) throw new Error('No se pudo reservar la numeración del comprobante.');
      const receiptNumber = `RET-${String(sequence.last_number).padStart(6, '0')}`;
      const result = this.database
        .prepare(
          `INSERT INTO delivery_receipts (
             receipt_number, optical_job_id, delivered_at, client_first_name, client_last_name,
             client_document_number, client_phone, job_number, product, lens, brand, frame_condition,
             frame_material, frame_model, product_color, supplier, color_type,
             product_observations, treatment_names_json, recipient_type, recipient_full_name,
             recipient_document_number, recipient_relationship, authorization_reference,
             authorization_confirmed, delivered_by, delivery_notes, delivery_confirmed
           ) VALUES (
             @receiptNumber, @opticalJobId, @deliveredAt, @client_first_name, @client_last_name,
             @client_document_number, @client_phone, @job_number, @product, @lens, @brand, @frame_condition,
             @frame_material, @frame_model, @product_color, @supplier, @color_type,
             @product_observations, @treatmentNamesJson, @recipientType, @recipientFullName,
             @recipientDocumentNumber, @recipientRelationship, @authorizationReference,
             @authorizationConfirmed, @deliveredBy, @deliveryNotes, 1
           )`,
        )
        .run({
          ...snapshot,
          ...normalized,
          receiptNumber,
          treatmentNamesJson: JSON.stringify(treatmentNames.map((item) => item.name)),
          authorizationConfirmed: normalized.authorizationConfirmed ? 1 : 0,
        });
      return this.requireById(insertedId(result));
    })();
  }

  public getById(id: number): DeliveryReceipt | null {
    const row = this.database.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id) as
      ReceiptRow | undefined;
    return row ? this.map(row) : null;
  }

  public getByJobId(jobId: number): DeliveryReceipt | null {
    const row = this.database
      .prepare('SELECT * FROM delivery_receipts WHERE optical_job_id = ?')
      .get(jobId) as ReceiptRow | undefined;
    return row ? this.map(row) : null;
  }

  public addEvent(input: CreateDeliveryReceiptEventInput): DeliveryReceipt {
    const normalized = parseDeliveryReceiptEventInput(input);
    return this.database.transaction(() => {
      const current = this.requireById(normalized.receiptId);
      if (current.status === 'ANNULLED') throw new DeliveryReceiptStateError();
      this.database
        .prepare(
          `INSERT INTO delivery_receipt_events (receipt_id, event_type, reason)
           VALUES (@receiptId, @type, @reason)`,
        )
        .run(normalized);
      this.database
        .prepare('UPDATE delivery_receipts SET status = ? WHERE id = ?')
        .run(normalized.type === 'ANNULLED' ? 'ANNULLED' : 'CORRECTED', normalized.receiptId);
      return this.requireById(normalized.receiptId);
    })();
  }

  private events(receiptId: number): DeliveryReceiptEvent[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM delivery_receipt_events WHERE receipt_id = ?
         ORDER BY created_at, id`,
      )
      .all(receiptId) as EventRow[];
    return rows.map((row) => ({
      id: row.id,
      receiptId: row.receipt_id,
      type: row.event_type,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  private map(row: ReceiptRow): DeliveryReceipt {
    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      opticalJobId: row.optical_job_id,
      deliveredAt: row.delivered_at,
      registeredAt: row.registered_at,
      status: row.status,
      clientFirstName: row.client_first_name,
      clientLastName: row.client_last_name,
      clientDocumentNumber: row.client_document_number,
      clientPhone: row.client_phone,
      jobNumber: row.job_number,
      product: row.product,
      lens: row.lens,
      brand: row.brand,
      frameCondition: row.frame_condition,
      frameMaterial: row.frame_material,
      frameModel: row.frame_model,
      productColor: row.product_color,
      supplier: row.supplier,
      colorType: row.color_type,
      productObservations: row.product_observations,
      treatmentNames: parseTreatmentNames(row.treatment_names_json),
      recipientType: row.recipient_type,
      recipientFullName: row.recipient_full_name,
      recipientDocumentNumber: row.recipient_document_number,
      recipientRelationship: row.recipient_relationship,
      authorizationReference: row.authorization_reference,
      authorizationConfirmed: row.authorization_confirmed === 1,
      deliveredBy: row.delivered_by,
      deliveryNotes: row.delivery_notes,
      deliveryConfirmed: true,
      events: this.events(row.id),
    };
  }

  private requireById(id: number): DeliveryReceipt {
    const receipt = this.getById(id);
    if (!receipt) throw new DeliveryReceiptNotFoundError();
    return receipt;
  }
}
