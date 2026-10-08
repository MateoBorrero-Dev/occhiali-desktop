import type Database from 'better-sqlite3';
import { openSqliteDatabase } from './connection';
import { applyMigrations } from './migrations';
import { ClientRepository } from './repositories/client-repository';
import { OpticalJobRepository } from './repositories/optical-job-repository';
import { PrescriptionRepository } from './repositories/prescription-repository';
import { PrescriptionValueRepository } from './repositories/prescription-value-repository';
import { TreatmentRepository } from './repositories/treatment-repository';

interface MigrationRow {
  id: string;
}

export class ApplicationDatabase {
  public readonly clients: ClientRepository;
  public readonly prescriptionValues: PrescriptionValueRepository;
  public readonly prescriptions: PrescriptionRepository;
  public readonly treatments: TreatmentRepository;
  public readonly opticalJobs: OpticalJobRepository;

  private constructor(private readonly database: Database.Database) {
    this.clients = new ClientRepository(database);
    this.prescriptionValues = new PrescriptionValueRepository(database);
    this.prescriptions = new PrescriptionRepository(database, this.prescriptionValues);
    this.treatments = new TreatmentRepository(database);
    this.opticalJobs = new OpticalJobRepository(database, this.treatments);
  }

  public static open(filePath: string): ApplicationDatabase {
    const database = openSqliteDatabase(filePath);
    try {
      applyMigrations(database);
      return new ApplicationDatabase(database);
    } catch (error: unknown) {
      database.close();
      throw error;
    }
  }

  public reapplyMigrations(): void {
    applyMigrations(this.database);
  }

  public getAppliedMigrationIds(): string[] {
    const rows = this.database
      .prepare('SELECT id FROM schema_migrations ORDER BY id')
      .all() as MigrationRow[];
    return rows.map((row) => row.id);
  }

  public transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }

  public foreignKeyViolations(): unknown[] {
    return this.database.pragma('foreign_key_check') as unknown[];
  }

  public integrityCheck(): string {
    const rows = this.database.pragma('integrity_check') as Array<{ integrity_check: string }>;
    return rows.map((row) => row.integrity_check).join(', ');
  }

  public close(): void {
    if (this.database.open) {
      this.database.close();
    }
  }
}
