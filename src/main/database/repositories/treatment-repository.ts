import type Database from 'better-sqlite3';
import type { OpticalJobTreatment, Treatment } from '../../../shared/database-models';

interface TreatmentRow {
  id: string;
  name: string;
  is_active: number;
  created_at: string;
}

interface OpticalJobTreatmentRow {
  optical_job_id: number;
  treatment_id: string;
  created_at: string;
}

export class TreatmentNotFoundError extends Error {
  public constructor() {
    super('Uno de los tratamientos o acabados seleccionados no existe.');
    this.name = 'TreatmentNotFoundError';
  }
}

function mapTreatment(row: TreatmentRow): Treatment {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

export class TreatmentRepository {
  public constructor(private readonly database: Database.Database) {}

  public list(): Treatment[] {
    const rows = this.database
      .prepare('SELECT * FROM treatments ORDER BY name COLLATE NOCASE, id')
      .all() as TreatmentRow[];
    return rows.map(mapTreatment);
  }

  public listActive(): Treatment[] {
    const rows = this.database
      .prepare('SELECT * FROM treatments WHERE is_active = 1 ORDER BY name COLLATE NOCASE, id')
      .all() as TreatmentRow[];
    return rows.map(mapTreatment);
  }

  public assertIdsExist(treatmentIds: readonly string[]): void {
    const statement = this.database.prepare(
      'SELECT 1 FROM treatments WHERE id = ? AND is_active = 1',
    );
    for (const treatmentId of treatmentIds) {
      if (!statement.get(treatmentId)) {
        throw new TreatmentNotFoundError();
      }
    }
  }

  public replaceForJob(opticalJobId: number, treatmentIds: readonly string[]): void {
    this.database
      .prepare('DELETE FROM optical_job_treatments WHERE optical_job_id = ?')
      .run(opticalJobId);
    for (const treatmentId of treatmentIds) this.addToJob(opticalJobId, treatmentId);
  }

  public listByJob(opticalJobId: number): Treatment[] {
    const rows = this.database
      .prepare(
        `SELECT treatments.*
         FROM treatments
         INNER JOIN optical_job_treatments
           ON optical_job_treatments.treatment_id = treatments.id
         WHERE optical_job_treatments.optical_job_id = ?
         ORDER BY treatments.name COLLATE NOCASE, treatments.id`,
      )
      .all(opticalJobId) as TreatmentRow[];
    return rows.map(mapTreatment);
  }

  public addToJob(opticalJobId: number, treatmentId: string): OpticalJobTreatment {
    this.database
      .prepare(
        `INSERT INTO optical_job_treatments (optical_job_id, treatment_id)
         VALUES (?, ?)`,
      )
      .run(opticalJobId, treatmentId);

    const row = this.database
      .prepare(
        `SELECT * FROM optical_job_treatments
         WHERE optical_job_id = ? AND treatment_id = ?`,
      )
      .get(opticalJobId, treatmentId) as OpticalJobTreatmentRow;

    return {
      opticalJobId: row.optical_job_id,
      treatmentId: row.treatment_id,
      createdAt: row.created_at,
    };
  }
}
