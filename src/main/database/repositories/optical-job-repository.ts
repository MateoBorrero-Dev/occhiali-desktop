import type Database from 'better-sqlite3';
import type {
  ColorType,
  CreateOpticalJobInput,
  FrameCondition,
  FrameMaterial,
  OpticalJob,
} from '../../../shared/database-models';
import { optionalText } from '../validation';
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

export class OpticalJobRepository {
  public constructor(
    private readonly database: Database.Database,
    private readonly treatments: TreatmentRepository,
  ) {}

  public createWithTreatments(input: CreateOpticalJobInput): OpticalJob {
    return this.database.transaction(() => {
      this.assertPrescriptionBelongsToClient(input.prescriptionId ?? null, input.clientId);

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
        .run({
          clientId: input.clientId,
          prescriptionId: input.prescriptionId ?? null,
          jobNumber: optionalText(input.jobNumber),
          product: optionalText(input.product),
          frameCondition: input.frameCondition ?? null,
          frameMaterial: input.frameMaterial ?? null,
          frameModel: optionalText(input.frameModel),
          colorType: input.colorType ?? null,
          observations: optionalText(input.observations),
        });

      const opticalJobId = Number(result.lastInsertRowid);
      for (const treatmentId of input.treatmentIds ?? []) {
        this.treatments.addToJob(opticalJobId, treatmentId);
      }

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

  private assertPrescriptionBelongsToClient(prescriptionId: number | null, clientId: number): void {
    if (prescriptionId === null) {
      return;
    }

    const prescription = this.database
      .prepare('SELECT client_id FROM prescriptions WHERE id = ?')
      .get(prescriptionId) as { client_id: number } | undefined;
    if (!prescription) {
      throw new Error('No existe la receta indicada.');
    }
    if (prescription.client_id !== clientId) {
      throw new Error('La receta indicada pertenece a otro cliente.');
    }
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
    const opticalJob = this.getById(id);
    if (!opticalJob) {
      throw new Error('No existe el trabajo óptico solicitado.');
    }
    return opticalJob;
  }
}
