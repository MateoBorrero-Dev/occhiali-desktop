import type Database from 'better-sqlite3';

export interface Migration {
  id: string;
  up: (database: Database.Database) => void;
}

const migrations: readonly Migration[] = [
  {
    id: '001_initial_schema',
    up: (database) => {
      database.exec(`
        CREATE TABLE clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
          last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
          document_number TEXT,
          phone TEXT,
          address TEXT,
          birth_date TEXT CHECK (
            birth_date IS NULL OR
            (birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(birth_date) = birth_date)
          ),
          notes TEXT,
          is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ) STRICT;

        CREATE UNIQUE INDEX clients_document_number_unique
          ON clients(document_number)
          WHERE document_number IS NOT NULL;
        CREATE INDEX clients_name_index ON clients(last_name COLLATE NOCASE, first_name COLLATE NOCASE);
        CREATE INDEX clients_archived_index ON clients(is_archived);

        CREATE TABLE prescriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          prescription_date TEXT NOT NULL CHECK (
            prescription_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND
            date(prescription_date) = prescription_date
          ),
          prescriber_name TEXT,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE (id, client_id),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT
        ) STRICT;

        CREATE INDEX prescriptions_client_date_index
          ON prescriptions(client_id, prescription_date DESC, id DESC);

        CREATE TABLE prescription_values (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          prescription_id INTEGER NOT NULL,
          distance TEXT NOT NULL CHECK (distance IN ('FAR', 'NEAR')),
          eye TEXT NOT NULL CHECK (eye IN ('OD', 'OI')),
          sphere INTEGER,
          cylinder INTEGER,
          axis INTEGER CHECK (axis IS NULL OR axis BETWEEN 0 AND 180),
          dip INTEGER,
          height INTEGER,
          UNIQUE (prescription_id, distance, eye),
          FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON UPDATE RESTRICT ON DELETE RESTRICT
        ) STRICT;

        CREATE INDEX prescription_values_prescription_index
          ON prescription_values(prescription_id);

        CREATE TABLE optical_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          prescription_id INTEGER,
          job_number TEXT,
          product TEXT,
          frame_condition TEXT CHECK (frame_condition IS NULL OR frame_condition IN ('NEW', 'USED')),
          frame_material TEXT CHECK (frame_material IS NULL OR frame_material IN ('ZILO', 'METAL')),
          frame_model TEXT,
          color_type TEXT CHECK (color_type IS NULL OR color_type IN ('FULL', 'GRADIENT')),
          observations TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
          FOREIGN KEY (prescription_id, client_id)
            REFERENCES prescriptions(id, client_id) ON UPDATE RESTRICT ON DELETE RESTRICT
        ) STRICT;

        CREATE UNIQUE INDEX optical_jobs_job_number_unique
          ON optical_jobs(job_number)
          WHERE job_number IS NOT NULL;
        CREATE INDEX optical_jobs_client_index ON optical_jobs(client_id, created_at DESC, id DESC);
        CREATE INDEX optical_jobs_prescription_index ON optical_jobs(prescription_id);

        CREATE TABLE treatments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ) STRICT;

        CREATE TABLE optical_job_treatments (
          optical_job_id INTEGER NOT NULL,
          treatment_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          PRIMARY KEY (optical_job_id, treatment_id),
          FOREIGN KEY (optical_job_id) REFERENCES optical_jobs(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
          FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON UPDATE RESTRICT ON DELETE RESTRICT
        ) STRICT;

        CREATE INDEX optical_job_treatments_treatment_index
          ON optical_job_treatments(treatment_id);
      `);
    },
  },
  {
    id: '002_seed_treatments',
    up: (database) => {
      database
        .prepare(
          `INSERT INTO treatments (id, name) VALUES
            ('anti-scratch-stark', 'Antirrayas Stark'),
            ('ar-asa-pro', 'AR ASA Pro'),
            ('ar-asa-plus', 'AR ASA Plus'),
            ('edge-polish', 'Pulido de bordes'),
            ('shape-change', 'Cambio de forma')
          ON CONFLICT(id) DO NOTHING`,
        )
        .run();
    },
  },
];

interface AppliedMigrationRow {
  id: string;
}

export function applyMigrations(
  database: Database.Database,
  availableMigrations: readonly Migration[] = migrations,
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT;
  `);

  const appliedRows = database
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all() as AppliedMigrationRow[];
  const availableIds = new Set(availableMigrations.map((migration) => migration.id));

  for (const row of appliedRows) {
    if (!availableIds.has(row.id)) {
      throw new Error(`La base contiene una migración desconocida: ${row.id}.`);
    }
  }

  const appliedIds = new Set(appliedRows.map((row) => row.id));
  const recordMigration = database.prepare('INSERT INTO schema_migrations (id) VALUES (?)');

  for (const migration of availableMigrations) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    database.transaction(() => {
      migration.up(database);
      recordMigration.run(migration.id);
    })();
  }
}

export function getMigrationIds(): readonly string[] {
  return migrations.map((migration) => migration.id);
}
