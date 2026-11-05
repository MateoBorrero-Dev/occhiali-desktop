import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BackupService } from '../src/main/backup/backup-service';
import { RestoreCoordinator } from '../src/main/backup/restore-recovery';
import { ApplicationDatabase } from '../src/main/database';
import { openSqliteDatabase } from '../src/main/database/connection';
import {
  applyMigrations,
  getAvailableMigrations,
  getMigrationIds,
} from '../src/main/database/migrations';
import { SecurityManager } from '../src/main/security/security-manager';

const FIXTURE_DIRECTORY = join(process.cwd(), 'tests', 'fixtures', 'v1.1-authentic');
const ACCESS_PASSWORD = 'Acceso-Fixture-1.1.0-Solo-QA';
const RECOVERY_PASSWORD = 'Recuperacion-Fixture-1.1.0-Solo-QA';
const NEW_ACCESS_PASSWORD = 'Acceso-Perfil-Nuevo-1.2.0-Solo-QA';
const LEGACY_MIGRATIONS = [
  '001_initial_schema',
  '002_seed_treatments',
  '003_prescription_revisions',
  '004_optical_job_product_details',
  '005_prescription_additions',
  '006_delivery_receipts',
];

interface FixtureManifest {
  sourceTag: string;
  sourceCommit: string;
  expectedMigrationIds: string[];
  files: Record<string, { bytes: number; sha256: string }>;
}

interface LegacyBackupSettings {
  lastBackupFile: string;
}

function fixturePath(name: string): string {
  return join(FIXTURE_DIRECTORY, name);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function copyFixture(name: string, destination: string): void {
  copyFileSync(fixturePath(name), destination);
}

function readAppliedMigrations(path: string): string[] {
  const database = openSqliteDatabase(path);
  try {
    return (
      database.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{
        id: string;
      }>
    ).map((row) => row.id);
  } finally {
    database.close();
  }
}

function expectRepresentativeData(database: ApplicationDatabase): void {
  expect(database.clients.list({ includeArchived: true })).toHaveLength(2);
  expect(database.clients.getById(1)).toMatchObject({
    firstName: 'Compatibilidad',
    lastName: 'Uno Uno',
    documentNumber: '30111122',
    notes: 'Cliente ficticio generado por v1.1.0',
  });

  const prescription = database.prescriptions.getById(1);
  expect(prescription).toMatchObject({
    prescriptionDate: '2026-10-19',
    prescriberName: 'Profesional Ficticia',
    additionOd: '1.50',
    additionOi: '1.75',
    notes: 'Notas corregidas y conservadas',
  });
  expect(prescription?.values).toHaveLength(4);
  expect(prescription?.values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ distance: 'FAR', eye: 'OD', sphere: '-2.00', axis: 92 }),
      expect.objectContaining({ distance: 'FAR', eye: 'OI', sphere: '-1.75', axis: 87 }),
      expect.objectContaining({ distance: 'NEAR', eye: 'OD', sphere: '-0.75', axis: 92 }),
      expect.objectContaining({ distance: 'NEAR', eye: 'OI', sphere: '-0.50', axis: 87 }),
    ]),
  );
  const revisions = database.prescriptions.listRevisions(1);
  expect(revisions).toHaveLength(1);
  expect(revisions[0]).toMatchObject({
    revisionNumber: 1,
    reason: 'Corrección histórica ficticia',
    prescriptionDate: '2026-10-18',
    additionOd: '1.25',
    additionOi: '1.50',
    notes: 'Notas originales de receta 1.1.0',
  });
  expect(revisions[0]?.values).toHaveLength(4);

  const firstJob = database.opticalJobs.getById(1);
  expect(firstJob).toMatchObject({
    prescriptionId: 1,
    jobNumber: 'V11-0001',
    product: 'Anteojos recetados',
    lens: null,
    brand: null,
    frameCondition: 'USED',
    frameMaterial: 'ZILO',
    frameModel: 'Modelo histórico A',
    productColor: 'Carey',
    supplier: 'Proveedor ficticio 1.1',
    colorType: 'FULL',
    observations: 'Observaciones comerciales históricas',
  });
  expect(firstJob?.treatments.map((treatment) => treatment.name)).toEqual(
    expect.arrayContaining(['AR ASA Plus', 'Pulido de bordes', 'Tratamiento personalizado 1.1']),
  );
  expect(database.opticalJobs.getById(2)).toMatchObject({
    prescriptionId: 1,
    jobNumber: 'V11-0002',
  });
  expect(database.opticalJobs.getById(3)).toMatchObject({
    prescriptionId: null,
    jobNumber: 'V11-0003',
    product: 'Lentes de contacto',
  });
  const opticalFiles = database.opticalFiles.search({ limit: 25 });
  expect(opticalFiles.total).toBe(3);
  expect(opticalFiles.items.filter((item) => item.prescriptionId === 1)).toHaveLength(2);
  expect(opticalFiles.items.filter((item) => item.prescriptionId === 1)).toEqual(
    expect.arrayContaining([expect.objectContaining({ relatedJobCount: 2 })]),
  );

  const firstReceipt = database.deliveryReceipts.getById(1);
  expect(firstReceipt).toMatchObject({
    receiptNumber: 'RET-000001',
    status: 'CORRECTED',
    product: 'Anteojos recetados',
    lens: null,
    brand: null,
  });
  expect(firstReceipt?.treatmentNames).toEqual(
    expect.arrayContaining(['AR ASA Plus', 'Pulido de bordes', 'Tratamiento personalizado 1.1']),
  );
  expect(firstReceipt?.events).toEqual([expect.objectContaining({ type: 'CORRECTION_NOTE' })]);
  expect(database.deliveryReceipts.getById(2)).toMatchObject({
    receiptNumber: 'RET-000002',
    status: 'ANNULLED',
    recipientType: 'AUTHORIZED_THIRD_PARTY',
    recipientFullName: 'Tercera Persona Ficticia',
    events: [expect.objectContaining({ type: 'ANNULLED' })],
  });
  expect(database.deliveryReceipts.list({ limit: 25 }).total).toBe(2);
  expect(database.integrityCheck()).toBe('ok');
  expect(database.foreignKeyViolations()).toEqual([]);
}

describe('compatibilidad auténtica Occhiali 1.1.0 → 1.2.0', () => {
  const directories: string[] = [];
  let manifest: FixtureManifest;

  beforeAll(() => {
    manifest = JSON.parse(readFileSync(fixturePath('manifest.json'), 'utf8')) as FixtureManifest;
    expect(manifest).toMatchObject({
      sourceTag: 'v1.1.0',
      sourceCommit: 'bde9b1a9de2960fd628e2c38fa2891f791695055',
      expectedMigrationIds: LEGACY_MIGRATIONS,
    });
    for (const [name, expected] of Object.entries(manifest.files)) {
      expect(readFileSync(fixturePath(name))).toHaveLength(expected.bytes);
      expect(sha256(fixturePath(name))).toBe(expected.sha256);
    }
  });

  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  function temporaryDirectory(prefix: string): string {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    directories.push(directory);
    return directory;
  }

  function prepareLegacyProfile(): {
    profile: string;
    databasePath: string;
    backupPath: string;
  } {
    const profile = temporaryDirectory('occhiali-authentic-upgrade-');
    const databasePath = join(profile, 'optica.sqlite3');
    copyFixture('optica-1.1.0.sqlite-fixture', databasePath);
    copyFixture('security-1.1.0.json-fixture', join(profile, 'security.json'));
    copyFixture('backup-settings-1.1.0.json-fixture', join(profile, 'backup-settings.json'));
    const settings = JSON.parse(
      readFileSync(fixturePath('backup-settings-1.1.0.json-fixture'), 'utf8'),
    ) as LegacyBackupSettings;
    mkdirSync(join(profile, 'backups'));
    const backupPath = join(profile, 'backups', settings.lastBackupFile);
    copyFixture('backup-1.1.0.ocbackup-fixture', backupPath);
    return { profile, databasePath, backupPath };
  }

  it('migra el perfil auténtico 001–006 a 007, conserva datos y es idempotente', async () => {
    const { profile, databasePath, backupPath } = prepareLegacyProfile();
    expect(readAppliedMigrations(databasePath)).toEqual(LEGACY_MIGRATIONS);

    const before = openSqliteDatabase(databasePath);
    try {
      const jobColumns = before.pragma('table_info(optical_jobs)') as Array<{ name: string }>;
      expect(jobColumns.map((column) => column.name)).not.toContain('lens');
      expect(jobColumns.map((column) => column.name)).not.toContain('brand');
      expect(before.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(before.pragma('foreign_key_check')).toEqual([]);
    } finally {
      before.close();
    }

    let upgraded = ApplicationDatabase.open(databasePath);
    expect(upgraded.getAppliedMigrationIds()).toEqual(getMigrationIds());
    expectRepresentativeData(upgraded);
    upgraded.close();

    upgraded = ApplicationDatabase.open(databasePath);
    expect(upgraded.getAppliedMigrationIds()).toEqual(getMigrationIds());
    expectRepresentativeData(upgraded);
    upgraded.close();

    const security = new SecurityManager(join(profile, 'security.json'));
    await expect(security.login(ACCESS_PASSWORD)).resolves.toMatchObject({
      configured: true,
      authenticated: true,
      inactivityMinutes: 30,
    });

    const backups = new BackupService(join(profile, 'backup-settings.json'), '1.2.0');
    expect(backups.status()).toMatchObject({
      automaticEnabled: false,
      automaticHour: 4,
      retentionCount: 7,
      lastBackupExists: true,
    });
    backups.setSelectedRestorePath(backupPath);
    await expect(backups.verifySelected(RECOVERY_PASSWORD)).resolves.toMatchObject({
      appVersion: '1.1.0',
      schemaMigrations: LEGACY_MIGRATIONS,
    });
  });

  it('restaura el .ocbackup auténtico en un perfil nuevo y conserva el original', async () => {
    const profile = temporaryDirectory('occhiali-authentic-restore-');
    const exchange = temporaryDirectory('occhiali-authentic-exchange-');
    const selected = join(exchange, 'selected-v1.1.0.ocbackup');
    copyFixture('backup-1.1.0.ocbackup-fixture', selected);
    const originalHash = sha256(selected);

    const security = new SecurityManager(join(profile, 'security.json'));
    expect(security.status().configured).toBe(false);
    await security.setup(NEW_ACCESS_PASSWORD, 20);
    security.logout();

    const activePath = join(profile, 'optica.sqlite3');
    const initial = ApplicationDatabase.open(activePath);
    initial.clients.create({ firstName: 'Base', lastName: 'Temporal reemplazable' });
    initial.close();

    const backups = new BackupService(join(profile, 'backup-settings.json'), '1.2.0');
    backups.setSelectedRestorePath(selected);
    await expect(backups.verifySelected(RECOVERY_PASSWORD)).resolves.toMatchObject({
      formatVersion: 1,
      appVersion: '1.1.0',
      schemaMigrations: LEGACY_MIGRATIONS,
    });
    const prepared = await backups.prepareRestore(RECOVERY_PASSWORD);
    const staged = ApplicationDatabase.open(prepared.sqlitePath);
    expect(staged.getAppliedMigrationIds()).toEqual(getMigrationIds());
    expectRepresentativeData(staged);
    staged.close();

    const coordinator = new RestoreCoordinator(activePath);
    coordinator.begin(prepared.sqlitePath);
    prepared.transferOwnership();
    coordinator.moveActiveToRollback();
    coordinator.placeCandidate();
    const candidate = ApplicationDatabase.open(activePath);
    expectRepresentativeData(candidate);
    candidate.close();
    coordinator.markVerified();
    expect(coordinator.confirmAndCleanup()).toBe(true);

    const reopened = ApplicationDatabase.open(activePath);
    expectRepresentativeData(reopened);
    reopened.close();
    await expect(
      new SecurityManager(join(profile, 'security.json')).login(NEW_ACCESS_PASSWORD),
    ).resolves.toMatchObject({ authenticated: true });
    expect(sha256(selected)).toBe(originalHash);
    expect(existsSync(selected)).toBe(true);
  });

  it('rechaza contraseña, corrupción, truncamiento y downgrade sin alterar la base activa', async () => {
    const profile = temporaryDirectory('occhiali-authentic-failures-');
    const exchange = temporaryDirectory('occhiali-authentic-damaged-');
    const activePath = join(profile, 'optica.sqlite3');
    const active = ApplicationDatabase.open(activePath);
    const protectedClient = active.clients.create({
      firstName: 'No',
      lastName: 'Sobrescribir',
      documentNumber: '30000009',
    });
    active.close();
    const activeHash = sha256(activePath);

    const selected = join(exchange, 'selected.ocbackup');
    copyFixture('backup-1.1.0.ocbackup-fixture', selected);
    const fixtureHash = sha256(selected);
    const backups = new BackupService(join(profile, 'backup-settings.json'), '1.2.0');
    backups.setSelectedRestorePath(selected);
    await expect(backups.prepareRestore('Contrasena-Incorrecta-1.2.0-QA')).rejects.toThrow(
      'incorrecta o el archivo está dañado',
    );

    const corrupted = join(exchange, 'corrupted.ocbackup');
    const envelope = JSON.parse(readFileSync(selected, 'utf8')) as { payload: string };
    envelope.payload = `${envelope.payload[0] === 'A' ? 'B' : 'A'}${envelope.payload.slice(1)}`;
    writeFileSync(corrupted, JSON.stringify(envelope));
    backups.setSelectedRestorePath(corrupted);
    await expect(backups.prepareRestore(RECOVERY_PASSWORD)).rejects.toThrow(
      'incorrecta o el archivo está dañado',
    );

    const truncated = join(exchange, 'truncated.ocbackup');
    const raw = readFileSync(selected);
    writeFileSync(truncated, raw.subarray(0, Math.floor(raw.length / 2)));
    backups.setSelectedRestorePath(truncated);
    await expect(backups.prepareRestore(RECOVERY_PASSWORD)).rejects.toThrow(
      'no es un respaldo válido',
    );

    expect(readdirSync(profile).filter((name) => name.startsWith('.restore-staging-'))).toEqual([]);
    expect(sha256(activePath)).toBe(activeHash);
    expect(sha256(selected)).toBe(fixtureHash);
    const unchanged = ApplicationDatabase.open(activePath);
    expect(unchanged.clients.getById(protectedClient.id)?.lastName).toBe('Sobrescribir');
    unchanged.close();

    const downgradedPath = join(profile, 'downgrade.sqlite3');
    copyFixture('optica-1.1.0.sqlite-fixture', downgradedPath);
    const migrated = ApplicationDatabase.open(downgradedPath);
    migrated.close();
    const legacyRuntimeView = openSqliteDatabase(downgradedPath);
    try {
      expect(() =>
        applyMigrations(legacyRuntimeView, getAvailableMigrations().slice(0, 6)),
      ).toThrow('La base contiene una migración desconocida: 007_optical_job_commercial_details.');
      expect(legacyRuntimeView.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(legacyRuntimeView.pragma('foreign_key_check')).toEqual([]);
    } finally {
      legacyRuntimeView.close();
    }
  });
});
