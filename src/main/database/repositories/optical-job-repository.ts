import type Database from 'better-sqlite3';
import type {
  CreateOpticalJobInput,
  FrameCondition,
  FrameMaterial,
  ColorType,
  OpticalJob,
  OpticalJobListPage,
  OpticalJobListRequest,
  OpticalJobSummary,
  OpticalJobsByClientRequest,
  OpticalJobsByPrescriptionRequest,
  UpdateOpticalJobInput,
} from '../../../shared/database-models';
import {
  OpticalJobValidationError,
  parseCreateOpticalJobInput,
  parseOpticalJobListRequest,
  parseOpticalJobsByClientRequest,
  parseOpticalJobsByPrescriptionRequest,
  parseUpdateOpticalJobInput,
} from '../../../shared/optical-job-validation';
import { escapedLike } from '../search';
import type { TreatmentRepository } from './treatment-repository';

interface OpticalJobRow {
  id: number;
  client_id: number;
  prescription_id: number | null;
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
  observations: string | null;
  created_at: string;
  updated_at: string;
}

interface OpticalJobSummaryRow extends OpticalJobRow {
  client_first_name: string;
  client_last_name: string;
}

interface ClientStateRow {
  is_archived: number;
}

interface CountRow {
  total: number;
}

interface PrescriptionOpticalStateRow {
  addition_od: string | null;
  addition_oi: string | null;
  value_count: number;
}

export class OpticalJobNotFoundError extends Error {
  public constructor() {
    super('No existe la ficha solicitada.');
    this.name = 'OpticalJobNotFoundError';
  }
}

export class OpticalJobClientNotFoundError extends Error {
  public constructor() {
    super('No existe el cliente asociado.');
    this.name = 'OpticalJobClientNotFoundError';
  }
}

export class ArchivedClientOpticalJobError extends Error {
  public constructor() {
    super('El cliente está archivado. Reactivalo para registrar una nueva ficha.');
    this.name = 'ArchivedClientOpticalJobError';
  }
}

export class OpticalJobPrescriptionNotFoundError extends Error {
  public constructor() {
    super('No existe la receta indicada.');
    this.name = 'OpticalJobPrescriptionNotFoundError';
  }
}

export class OpticalJobPrescriptionMismatchError extends Error {
  public constructor() {
    super('La receta indicada pertenece a otro cliente.');
    this.name = 'OpticalJobPrescriptionMismatchError';
  }
}

export class DuplicateOpticalJobNumberError extends Error {
  public constructor() {
    super('Ya existe una ficha registrada con ese número.');
    this.name = 'DuplicateOpticalJobNumberError';
  }
}

function insertedId(result: Database.RunResult): number {
  const id = Number(result.lastInsertRowid);
  if (!Number.isSafeInteger(id)) throw new RangeError('SQLite devolvió un identificador inválido.');
  return id;
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

function mapSummary(row: OpticalJobSummaryRow): OpticalJobSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    clientFirstName: row.client_first_name,
    clientLastName: row.client_last_name,
    prescriptionId: row.prescription_id,
    jobNumber: row.job_number,
    product: row.product,
    frameModel: row.frame_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function comparable(job: OpticalJob): string {
  return JSON.stringify({
    prescriptionId: job.prescriptionId,
    jobNumber: job.jobNumber,
    product: job.product,
    lens: job.lens,
    brand: job.brand,
    frameCondition: job.frameCondition,
    frameMaterial: job.frameMaterial,
    frameModel: job.frameModel,
    productColor: job.productColor,
    supplier: job.supplier,
    colorType: job.colorType,
    observations: job.observations,
    treatmentIds: job.treatments.map((item) => item.id).sort(),
  });
}

function comparableInput(input: UpdateOpticalJobInput, treatmentIds: readonly string[]): string {
  return JSON.stringify({
    prescriptionId: input.prescriptionId ?? null,
    jobNumber: input.jobNumber ?? null,
    product: input.product ?? null,
    lens: input.lens ?? null,
    brand: input.brand ?? null,
    frameCondition: input.frameCondition ?? null,
    frameMaterial: input.frameMaterial ?? null,
    frameModel: input.frameModel ?? null,
    productColor: input.productColor ?? null,
    supplier: input.supplier ?? null,
    colorType: input.colorType ?? null,
    observations: input.observations ?? null,
    treatmentIds: [...treatmentIds].sort(),
  });
}

export class OpticalJobRepository {
  public constructor(
    private readonly database: Database.Database,
    private readonly treatments: TreatmentRepository,
  ) {}

  public validateCreate(input: CreateOpticalJobInput): CreateOpticalJobInput {
    const normalized = parseCreateOpticalJobInput(input);
    this.requireActiveClient(normalized.clientId);
    this.assertPrescriptionBelongsToClient(normalized.prescriptionId ?? null, normalized.clientId);
    this.assertJobNumberAvailable(normalized.jobNumber ?? null);
    this.treatments.assertIdsExist(normalized.treatmentIds ?? []);
    return normalized;
  }

  public createWithTreatments(input: CreateOpticalJobInput): OpticalJob {
    const normalized = this.validateCreate(input);
    return this.database.transaction(() => this.insertWithTreatments(normalized))();
  }

  public createWithTreatmentsInTransaction(input: CreateOpticalJobInput): OpticalJob {
    if (!this.database.inTransaction) {
      throw new Error('La creación integrada requiere una transacción SQLite activa.');
    }
    return this.insertWithTreatments(this.validateCreate(input));
  }

  public getById(id: number): OpticalJob | null {
    const row = this.database.prepare('SELECT * FROM optical_jobs WHERE id = ?').get(id) as
      OpticalJobRow | undefined;
    return row ? this.mapOpticalJob(row) : null;
  }

  public listByClient(clientId: number): OpticalJob[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM optical_jobs
         WHERE client_id = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .all(clientId) as OpticalJobRow[];
    return rows.map((row) => this.mapOpticalJob(row));
  }

  public listByClientPage(request: OpticalJobsByClientRequest): OpticalJobListPage {
    const options = parseOpticalJobsByClientRequest(request);
    this.requireClient(options.clientId);
    return this.listSummaries('j.client_id = @clientId', options);
  }

  public listByPrescriptionPage(request: OpticalJobsByPrescriptionRequest): OpticalJobListPage {
    const options = parseOpticalJobsByPrescriptionRequest(request);
    const prescription = this.database
      .prepare('SELECT id FROM prescriptions WHERE id = ?')
      .get(options.prescriptionId);
    if (!prescription) throw new OpticalJobPrescriptionNotFoundError();
    return this.listSummaries('j.prescription_id = @prescriptionId', options);
  }

  public search(request: OpticalJobListRequest = {}): OpticalJobListPage {
    const options = parseOpticalJobListRequest(request);
    const where = options.query
      ? `fold_text(
          coalesce(j.job_number, '') || ' ' ||
          coalesce(j.product, '') || ' ' ||
          coalesce(j.frame_model, '') || ' ' ||
          c.first_name || ' ' || c.last_name || ' ' || c.last_name || ' ' || c.first_name
        ) LIKE @query ESCAPE '\\'`
      : '1 = 1';
    return this.listSummaries(where, {
      query: escapedLike(options.query),
      limit: options.limit,
      offset: options.offset,
    });
  }

  public update(id: number, input: UpdateOpticalJobInput): OpticalJob {
    return this.database.transaction(() => this.updateInTransaction(id, input))();
  }

  public validateUpdate(
    id: number,
    input: UpdateOpticalJobInput,
    pendingOpticalData = false,
  ): { current: OpticalJob; normalized: UpdateOpticalJobInput } {
    const normalized = parseUpdateOpticalJobInput(input);
    const current = this.requireById(id);
    this.assertPrescriptionBelongsToClient(normalized.prescriptionId ?? null, current.clientId);
    this.assertJobNumberAvailable(normalized.jobNumber ?? null, id);
    this.assertOpticalDataForProductChange(current, normalized, pendingOpticalData);
    this.treatments.assertIdsExist(normalized.treatmentIds ?? []);
    return { current, normalized };
  }

  public updateInTransaction(id: number, input: UpdateOpticalJobInput): OpticalJob {
    if (!this.database.inTransaction) {
      throw new Error('La actualización integrada requiere una transacción SQLite activa.');
    }
    const { current, normalized } = this.validateUpdate(id, input);
    const treatmentIds = this.treatments.resolveSelection(
      normalized.treatmentIds ?? [],
      normalized.treatmentNames ?? [],
    );
    if (comparable(current) === comparableInput(normalized, treatmentIds)) return current;

    this.database
      .prepare(
        `UPDATE optical_jobs SET
            prescription_id = @prescriptionId,
            job_number = @jobNumber,
            product = @product,
            lens = @lens,
            brand = @brand,
            frame_condition = @frameCondition,
            frame_material = @frameMaterial,
            frame_model = @frameModel,
            product_color = @productColor,
            supplier = @supplier,
            color_type = @colorType,
            observations = @observations,
            updated_at = @updatedAt
           WHERE id = @id`,
      )
      .run({ id, ...normalized, updatedAt: new Date().toISOString() });
    this.treatments.replaceForJob(id, treatmentIds);
    return this.requireById(id);
  }

  private listSummaries(where: string, parameters: Record<string, unknown>): OpticalJobListPage {
    const rows = this.database
      .prepare(
        `SELECT j.*, c.first_name AS client_first_name, c.last_name AS client_last_name
         FROM optical_jobs j
         JOIN clients c ON c.id = j.client_id
         WHERE ${where}
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(parameters) as OpticalJobSummaryRow[];
    const count = this.database
      .prepare(
        `SELECT count(*) AS total FROM optical_jobs j
         JOIN clients c ON c.id = j.client_id WHERE ${where}`,
      )
      .get(parameters) as CountRow;
    return {
      items: rows.map(mapSummary),
      total: count.total,
      limit: parameters.limit as number,
      offset: parameters.offset as number,
    };
  }

  private insertWithTreatments(normalized: CreateOpticalJobInput): OpticalJob {
    const treatmentIds = this.treatments.resolveSelection(
      normalized.treatmentIds ?? [],
      normalized.treatmentNames ?? [],
    );
    const result = this.database
      .prepare(
        `INSERT INTO optical_jobs (
          client_id, prescription_id, job_number, product, lens, brand, frame_condition,
          frame_material, frame_model, product_color, supplier, color_type, observations
        ) VALUES (
          @clientId, @prescriptionId, @jobNumber, @product, @lens, @brand, @frameCondition,
          @frameMaterial, @frameModel, @productColor, @supplier, @colorType, @observations
        )`,
      )
      .run(normalized);

    const opticalJobId = insertedId(result);
    this.treatments.replaceForJob(opticalJobId, treatmentIds);
    return this.requireById(opticalJobId);
  }

  private assertJobNumberAvailable(jobNumber: string | null, excludeId?: number): void {
    if (jobNumber === null) return;
    const row = this.database
      .prepare(
        `SELECT id FROM optical_jobs
         WHERE job_number = @jobNumber AND (@excludeId IS NULL OR id <> @excludeId)`,
      )
      .get({ jobNumber, excludeId: excludeId ?? null }) as { id: number } | undefined;
    if (row) throw new DuplicateOpticalJobNumberError();
  }

  private assertPrescriptionBelongsToClient(prescriptionId: number | null, clientId: number): void {
    if (prescriptionId === null) return;
    const prescription = this.database
      .prepare('SELECT client_id FROM prescriptions WHERE id = ?')
      .get(prescriptionId) as { client_id: number } | undefined;
    if (!prescription) throw new OpticalJobPrescriptionNotFoundError();
    if (prescription.client_id !== clientId) throw new OpticalJobPrescriptionMismatchError();
  }

  private assertOpticalDataForProductChange(
    current: OpticalJob,
    next: UpdateOpticalJobInput,
    pendingOpticalData = false,
  ): void {
    const prescriptionId = next.prescriptionId ?? null;
    if (!isPrescriptionGlasses(next.product ?? null)) return;
    if (isPrescriptionGlasses(current.product) && current.prescriptionId === prescriptionId) {
      return;
    }
    if (pendingOpticalData && prescriptionId !== null) return;
    if (prescriptionId !== null) {
      const state = this.database
        .prepare(
          `SELECT p.addition_od, p.addition_oi,
                  count(v.id) AS value_count
           FROM prescriptions p
           LEFT JOIN prescription_values v ON v.prescription_id = p.id
           WHERE p.id = ?
           GROUP BY p.id`,
        )
        .get(prescriptionId) as PrescriptionOpticalStateRow | undefined;
      if (
        state &&
        (state.value_count > 0 || state.addition_od !== null || state.addition_oi !== null)
      ) {
        return;
      }
    }
    throw new OpticalJobValidationError([
      {
        field: 'product',
        message:
          'Primero corregí la graduación de la ficha antes de cambiar el producto a anteojos de receta.',
      },
    ]);
  }

  private requireClient(id: number): ClientStateRow {
    const client = this.database.prepare('SELECT is_archived FROM clients WHERE id = ?').get(id) as
      ClientStateRow | undefined;
    if (!client) throw new OpticalJobClientNotFoundError();
    return client;
  }

  private requireActiveClient(id: number): void {
    if (this.requireClient(id).is_archived === 1) throw new ArchivedClientOpticalJobError();
  }

  private mapOpticalJob(row: OpticalJobRow): OpticalJob {
    return {
      id: row.id,
      clientId: row.client_id,
      prescriptionId: row.prescription_id,
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
      observations: row.observations,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      treatments: this.treatments.listByJob(row.id),
    };
  }

  private requireById(id: number): OpticalJob {
    const job = this.getById(id);
    if (!job) throw new OpticalJobNotFoundError();
    return job;
  }
}
