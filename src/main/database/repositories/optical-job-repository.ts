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
  UpdateOpticalJobInput,
} from '../../../shared/database-models';
import {
  parseCreateOpticalJobInput,
  parseOpticalJobListRequest,
  parseOpticalJobsByClientRequest,
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
  frame_condition: FrameCondition | null;
  frame_material: FrameMaterial | null;
  frame_model: string | null;
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
    frameCondition: job.frameCondition,
    frameMaterial: job.frameMaterial,
    frameModel: job.frameModel,
    colorType: job.colorType,
    observations: job.observations,
    treatmentIds: job.treatments.map((item) => item.id).sort(),
  });
}

function comparableInput(input: UpdateOpticalJobInput): string {
  return JSON.stringify({
    prescriptionId: input.prescriptionId ?? null,
    jobNumber: input.jobNumber ?? null,
    product: input.product ?? null,
    frameCondition: input.frameCondition ?? null,
    frameMaterial: input.frameMaterial ?? null,
    frameModel: input.frameModel ?? null,
    colorType: input.colorType ?? null,
    observations: input.observations ?? null,
    treatmentIds: [...(input.treatmentIds ?? [])].sort(),
  });
}

export class OpticalJobRepository {
  public constructor(
    private readonly database: Database.Database,
    private readonly treatments: TreatmentRepository,
  ) {}

  public createWithTreatments(input: CreateOpticalJobInput): OpticalJob {
    const normalized = parseCreateOpticalJobInput(input);
    return this.database.transaction(() => {
      this.requireActiveClient(normalized.clientId);
      this.assertPrescriptionBelongsToClient(
        normalized.prescriptionId ?? null,
        normalized.clientId,
      );
      this.assertJobNumberAvailable(normalized.jobNumber ?? null);
      this.treatments.assertIdsExist(normalized.treatmentIds ?? []);

      const result = this.database
        .prepare(
          `INSERT INTO optical_jobs (
            client_id, prescription_id, job_number, product, frame_condition,
            frame_material, frame_model, color_type, observations
          ) VALUES (
            @clientId, @prescriptionId, @jobNumber, @product, @frameCondition,
            @frameMaterial, @frameModel, @colorType, @observations
          )`,
        )
        .run(normalized);

      const opticalJobId = insertedId(result);
      this.treatments.replaceForJob(opticalJobId, normalized.treatmentIds ?? []);
      return this.requireById(opticalJobId);
    })();
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
    const normalized = parseUpdateOpticalJobInput(input);
    return this.database.transaction(() => {
      const current = this.requireById(id);
      this.assertPrescriptionBelongsToClient(normalized.prescriptionId ?? null, current.clientId);
      this.assertJobNumberAvailable(normalized.jobNumber ?? null, id);
      this.treatments.assertIdsExist(normalized.treatmentIds ?? []);
      if (comparable(current) === comparableInput(normalized)) return current;

      this.database
        .prepare(
          `UPDATE optical_jobs SET
            prescription_id = @prescriptionId,
            job_number = @jobNumber,
            product = @product,
            frame_condition = @frameCondition,
            frame_material = @frameMaterial,
            frame_model = @frameModel,
            color_type = @colorType,
            observations = @observations,
            updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({ id, ...normalized, updatedAt: new Date().toISOString() });
      this.treatments.replaceForJob(id, normalized.treatmentIds ?? []);
      return this.requireById(id);
    })();
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
      frameCondition: row.frame_condition,
      frameMaterial: row.frame_material,
      frameModel: row.frame_model,
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
