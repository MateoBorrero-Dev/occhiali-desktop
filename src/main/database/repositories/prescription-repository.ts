import type Database from 'better-sqlite3';
import {
  parseCorrectPrescriptionInput,
  parseCreatePrescriptionInput,
  parsePrescriptionListRequest,
  parsePrescriptionsByClientRequest,
} from '../../../shared/prescription-validation';
import type {
  CorrectPrescriptionInput,
  CreatePrescriptionInput,
  CreatePrescriptionValueInput,
  Eye,
  Prescription,
  PrescriptionDistance,
  PrescriptionListPage,
  PrescriptionListRequest,
  PrescriptionRevision,
  PrescriptionRevisionValue,
  PrescriptionsByClientRequest,
  PrescriptionSummary,
} from '../../../shared/database-models';
import { fromScaledHundredths, toScaledHundredths } from '../decimal';
import { escapedLike } from '../search';
import type { PrescriptionValueRepository } from './prescription-value-repository';

interface PrescriptionRow {
  id: number;
  client_id: number;
  prescription_date: string;
  prescriber_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PrescriptionSummaryRow extends PrescriptionRow {
  client_first_name: string;
  client_last_name: string;
  value_count: number;
}

interface PrescriptionRevisionRow {
  id: number;
  prescription_id: number;
  revision_number: number;
  reason: string;
  prescription_date: string;
  prescriber_name: string | null;
  notes: string | null;
  corrected_at: string;
}

interface PrescriptionRevisionValueRow {
  id: number;
  revision_id: number;
  distance: PrescriptionDistance;
  eye: Eye;
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  dip: number | null;
  height: number | null;
}

interface ClientStateRow {
  is_archived: number;
}

interface CountRow {
  total: number;
}

interface MaxRevisionRow {
  maximum: number;
}

export class PrescriptionNotFoundError extends Error {
  public constructor() {
    super('No existe la receta solicitada.');
    this.name = 'PrescriptionNotFoundError';
  }
}

export class PrescriptionClientNotFoundError extends Error {
  public constructor() {
    super('No existe el cliente asociado.');
    this.name = 'PrescriptionClientNotFoundError';
  }
}

export class ArchivedClientPrescriptionError extends Error {
  public constructor() {
    super('El cliente está archivado. Reactivalo para registrar una nueva receta.');
    this.name = 'ArchivedClientPrescriptionError';
  }
}

function insertedId(result: Database.RunResult): number {
  const id = Number(result.lastInsertRowid);
  if (!Number.isSafeInteger(id)) throw new RangeError('SQLite devolvió un identificador inválido.');
  return id;
}

function mapSummary(row: PrescriptionSummaryRow): PrescriptionSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    clientFirstName: row.client_first_name,
    clientLastName: row.client_last_name,
    prescriptionDate: row.prescription_date,
    prescriberName: row.prescriber_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    valueCount: row.value_count,
  };
}

function mapRevisionValue(row: PrescriptionRevisionValueRow): PrescriptionRevisionValue {
  return {
    id: row.id,
    revisionId: row.revision_id,
    distance: row.distance,
    eye: row.eye,
    sphere: fromScaledHundredths(row.sphere),
    cylinder: fromScaledHundredths(row.cylinder),
    axis: row.axis,
    dip: fromScaledHundredths(row.dip),
    height: fromScaledHundredths(row.height),
  };
}

function comparableValues(values: readonly CreatePrescriptionValueInput[]): string {
  return JSON.stringify(
    [...values]
      .sort((left, right) =>
        `${left.distance}:${left.eye}`.localeCompare(`${right.distance}:${right.eye}`),
      )
      .map((value) => ({
        distance: value.distance,
        eye: value.eye,
        sphere: value.sphere ?? null,
        cylinder: value.cylinder ?? null,
        axis: value.axis ?? null,
        dip: value.dip ?? null,
        height: value.height ?? null,
      })),
  );
}

export class PrescriptionRepository {
  public constructor(
    private readonly database: Database.Database,
    private readonly values: PrescriptionValueRepository,
  ) {}

  public createWithValues(input: CreatePrescriptionInput): Prescription {
    const normalized = parseCreatePrescriptionInput(input);
    return this.database.transaction(() => {
      this.requireActiveClient(normalized.clientId);
      const result = this.database
        .prepare(
          `INSERT INTO prescriptions (
            client_id, prescription_date, prescriber_name, notes
          ) VALUES (
            @clientId, @prescriptionDate, @prescriberName, @notes
          )`,
        )
        .run(normalized);

      const prescriptionId = insertedId(result);
      for (const value of normalized.values ?? []) this.values.create(prescriptionId, value);
      return this.requireById(prescriptionId);
    })();
  }

  public getById(id: number): Prescription | null {
    const row = this.database.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id) as
      PrescriptionRow | undefined;
    return row ? this.mapPrescription(row) : null;
  }

  public listByClient(clientId: number): Prescription[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM prescriptions
         WHERE client_id = ?
         ORDER BY prescription_date DESC, id DESC`,
      )
      .all(clientId) as PrescriptionRow[];
    return rows.map((row) => this.mapPrescription(row));
  }

  public listByClientPage(request: PrescriptionsByClientRequest): PrescriptionListPage {
    const options = parsePrescriptionsByClientRequest(request);
    this.requireClient(options.clientId);
    return this.listSummaries('p.client_id = @clientId', {
      clientId: options.clientId,
      limit: options.limit,
      offset: options.offset,
    });
  }

  public search(request: PrescriptionListRequest = {}): PrescriptionListPage {
    const options = parsePrescriptionListRequest(request);
    const filters: string[] = [];
    if (options.query) {
      filters.push(`fold_text(
        c.first_name || ' ' || c.last_name || ' ' || c.last_name || ' ' || c.first_name
      ) LIKE @query ESCAPE '\\'`);
    }
    if (options.dateFrom) filters.push('p.prescription_date >= @dateFrom');
    if (options.dateTo) filters.push('p.prescription_date <= @dateTo');
    return this.listSummaries(filters.length > 0 ? filters.join(' AND ') : '1 = 1', {
      query: escapedLike(options.query),
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      limit: options.limit,
      offset: options.offset,
    });
  }

  public correct(id: number, input: CorrectPrescriptionInput): Prescription {
    const normalized = parseCorrectPrescriptionInput(input);
    return this.database.transaction(() => {
      const current = this.requireById(id);
      const currentValues = current.values.map((value) => ({
        distance: value.distance,
        eye: value.eye,
        sphere: value.sphere,
        cylinder: value.cylinder,
        axis: value.axis,
        dip: value.dip,
        height: value.height,
      }));
      const hasChanges =
        current.prescriptionDate !== normalized.prescriptionDate ||
        current.prescriberName !== (normalized.prescriberName ?? null) ||
        current.notes !== (normalized.notes ?? null) ||
        comparableValues(currentValues) !== comparableValues(normalized.values);
      if (!hasChanges) return current;

      const maximum = this.database
        .prepare(
          `SELECT coalesce(max(revision_number), 0) AS maximum
           FROM prescription_revisions WHERE prescription_id = ?`,
        )
        .get(id) as MaxRevisionRow;
      const revisionResult = this.database
        .prepare(
          `INSERT INTO prescription_revisions (
            prescription_id, revision_number, reason, prescription_date, prescriber_name, notes
          ) VALUES (
            @prescriptionId, @revisionNumber, @reason, @prescriptionDate, @prescriberName, @notes
          )`,
        )
        .run({
          prescriptionId: id,
          revisionNumber: maximum.maximum + 1,
          reason: normalized.reason,
          prescriptionDate: current.prescriptionDate,
          prescriberName: current.prescriberName,
          notes: current.notes,
        });
      const revisionId = insertedId(revisionResult);
      const insertRevisionValue = this.database.prepare(
        `INSERT INTO prescription_revision_values (
          revision_id, distance, eye, sphere, cylinder, axis, dip, height
        ) VALUES (
          @revisionId, @distance, @eye, @sphere, @cylinder, @axis, @dip, @height
        )`,
      );
      for (const value of current.values) {
        insertRevisionValue.run({
          revisionId,
          distance: value.distance,
          eye: value.eye,
          sphere: toScaledHundredths(value.sphere),
          cylinder: toScaledHundredths(value.cylinder),
          axis: value.axis,
          dip: toScaledHundredths(value.dip),
          height: toScaledHundredths(value.height),
        });
      }

      this.database
        .prepare(
          `UPDATE prescriptions SET
            prescription_date = @prescriptionDate,
            prescriber_name = @prescriberName,
            notes = @notes,
            updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({
          id,
          prescriptionDate: normalized.prescriptionDate,
          prescriberName: normalized.prescriberName,
          notes: normalized.notes,
          updatedAt: new Date().toISOString(),
        });
      this.values.replace(id, normalized.values);
      return this.requireById(id);
    })();
  }

  public listRevisions(prescriptionId: number): PrescriptionRevision[] {
    this.requireById(prescriptionId);
    const rows = this.database
      .prepare(
        `SELECT * FROM prescription_revisions
         WHERE prescription_id = ? ORDER BY revision_number DESC`,
      )
      .all(prescriptionId) as PrescriptionRevisionRow[];
    const valuesStatement = this.database.prepare(
      `SELECT * FROM prescription_revision_values
       WHERE revision_id = ?
       ORDER BY CASE distance WHEN 'FAR' THEN 0 ELSE 1 END,
                CASE eye WHEN 'OD' THEN 0 ELSE 1 END`,
    );
    return rows.map((row) => ({
      id: row.id,
      prescriptionId: row.prescription_id,
      revisionNumber: row.revision_number,
      reason: row.reason,
      prescriptionDate: row.prescription_date,
      prescriberName: row.prescriber_name,
      notes: row.notes,
      correctedAt: row.corrected_at,
      values: (valuesStatement.all(row.id) as PrescriptionRevisionValueRow[]).map(mapRevisionValue),
    }));
  }

  private listSummaries(where: string, parameters: Record<string, unknown>): PrescriptionListPage {
    const rows = this.database
      .prepare(
        `SELECT p.*, c.first_name AS client_first_name, c.last_name AS client_last_name,
          (SELECT count(*) FROM prescription_values pv WHERE pv.prescription_id = p.id) AS value_count
         FROM prescriptions p
         JOIN clients c ON c.id = p.client_id
         WHERE ${where}
         ORDER BY p.prescription_date DESC, p.id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(parameters) as PrescriptionSummaryRow[];
    const count = this.database
      .prepare(
        `SELECT count(*) AS total FROM prescriptions p
         JOIN clients c ON c.id = p.client_id WHERE ${where}`,
      )
      .get(parameters) as CountRow;
    return {
      items: rows.map(mapSummary),
      total: count.total,
      limit: parameters.limit as number,
      offset: parameters.offset as number,
    };
  }

  private mapPrescription(row: PrescriptionRow): Prescription {
    return {
      id: row.id,
      clientId: row.client_id,
      prescriptionDate: row.prescription_date,
      prescriberName: row.prescriber_name,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      values: this.values.listByPrescription(row.id),
    };
  }

  private requireClient(id: number): ClientStateRow {
    const client = this.database.prepare('SELECT is_archived FROM clients WHERE id = ?').get(id) as
      ClientStateRow | undefined;
    if (!client) throw new PrescriptionClientNotFoundError();
    return client;
  }

  private requireActiveClient(id: number): void {
    if (this.requireClient(id).is_archived === 1) throw new ArchivedClientPrescriptionError();
  }

  private requireById(id: number): Prescription {
    const prescription = this.getById(id);
    if (!prescription) throw new PrescriptionNotFoundError();
    return prescription;
  }
}
