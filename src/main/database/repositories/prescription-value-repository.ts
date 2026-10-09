import type Database from 'better-sqlite3';
import type {
  CreatePrescriptionValueInput,
  Eye,
  PrescriptionDistance,
  PrescriptionValue,
} from '../../../shared/database-models';
import { fromScaledHundredths, toScaledHundredths } from '../decimal';
import { axisDegrees } from '../validation';

interface PrescriptionValueRow {
  id: number;
  prescription_id: number;
  distance: PrescriptionDistance;
  eye: Eye;
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  dip: number | null;
  height: number | null;
}

function mapValue(row: PrescriptionValueRow): PrescriptionValue {
  return {
    id: row.id,
    prescriptionId: row.prescription_id,
    distance: row.distance,
    eye: row.eye,
    sphere: fromScaledHundredths(row.sphere),
    cylinder: fromScaledHundredths(row.cylinder),
    axis: row.axis,
    dip: fromScaledHundredths(row.dip),
    height: fromScaledHundredths(row.height),
  };
}

export class PrescriptionValueRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(prescriptionId: number, input: CreatePrescriptionValueInput): void {
    this.database
      .prepare(
        `INSERT INTO prescription_values (
          prescription_id, distance, eye, sphere, cylinder, axis, dip, height
        ) VALUES (
          @prescriptionId, @distance, @eye, @sphere, @cylinder, @axis, @dip, @height
        )`,
      )
      .run({
        prescriptionId,
        distance: input.distance,
        eye: input.eye,
        sphere: toScaledHundredths(input.sphere),
        cylinder: toScaledHundredths(input.cylinder),
        axis: axisDegrees(input.axis),
        dip: toScaledHundredths(input.dip),
        height: toScaledHundredths(input.height),
      });
  }

  public listByPrescription(prescriptionId: number): PrescriptionValue[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM prescription_values
         WHERE prescription_id = ?
         ORDER BY
           CASE distance WHEN 'FAR' THEN 0 ELSE 1 END,
           CASE eye WHEN 'OD' THEN 0 ELSE 1 END`,
      )
      .all(prescriptionId) as PrescriptionValueRow[];
    return rows.map(mapValue);
  }

  public replace(prescriptionId: number, values: readonly CreatePrescriptionValueInput[]): void {
    this.database
      .prepare('DELETE FROM prescription_values WHERE prescription_id = ?')
      .run(prescriptionId);
    for (const value of values) {
      this.create(prescriptionId, value);
    }
  }
}
