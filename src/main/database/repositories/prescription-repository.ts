import type Database from 'better-sqlite3';
import type { CreatePrescriptionInput, Prescription } from '../../../shared/database-models';
import { calendarDate, optionalText } from '../validation';
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

export class PrescriptionRepository {
  public constructor(
    private readonly database: Database.Database,
    private readonly values: PrescriptionValueRepository,
  ) {}

  public createWithValues(input: CreatePrescriptionInput): Prescription {
    return this.database.transaction(() => {
      const result = this.database
        .prepare(
          `INSERT INTO prescriptions (
            client_id, prescription_date, prescriber_name, notes
          ) VALUES (
            @clientId, @prescriptionDate, @prescriberName, @notes
          )`,
        )
        .run({
          clientId: input.clientId,
          prescriptionDate: calendarDate(input.prescriptionDate, 'La fecha de la receta'),
          prescriberName: optionalText(input.prescriberName),
          notes: optionalText(input.notes),
        });

      const prescriptionId = Number(result.lastInsertRowid);
      for (const value of input.values ?? []) {
        this.values.create(prescriptionId, value);
      }

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

  private requireById(id: number): Prescription {
    const prescription = this.getById(id);
    if (!prescription) {
      throw new Error('No existe la receta solicitada.');
    }
    return prescription;
  }
}
