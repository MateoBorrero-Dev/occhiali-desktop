import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { BackupService } from './backup/backup-service';
import { RestoreCoordinator } from './backup/restore-recovery';
import { ApplicationDatabase } from './database';
import { getMigrationIds } from './database/migrations';
import { SecurityManager } from './security/security-manager';

const QA_PREFIX = 'occhiali-packaged-qa-';

function requireTemporaryQaDirectory(value: string | undefined): string {
  if (!value || !isAbsolute(value)) throw new Error('La ruta de QA debe ser absoluta.');
  const target = resolve(value);
  const temporaryRoot = resolve(tmpdir());
  const fromTemporaryRoot = relative(temporaryRoot, target);
  if (
    fromTemporaryRoot.startsWith('..') ||
    isAbsolute(fromTemporaryRoot) ||
    !basename(target).startsWith(QA_PREFIX)
  )
    throw new Error('La prueba empaquetada solo admite un perfil temporal aislado.');
  mkdirSync(target, { recursive: true });
  return target;
}

function assertHealthy(database: ApplicationDatabase): void {
  if (database.integrityCheck() !== 'ok' || database.foreignKeyViolations().length > 0)
    throw new Error('La base empaquetada no superó la verificación de integridad.');
  if (JSON.stringify(database.getAppliedMigrationIds()) !== JSON.stringify(getMigrationIds()))
    throw new Error('La aplicación empaquetada no aplicó todas las migraciones.');
}

async function writeScenario(directory: string): Promise<void> {
  const databasePath = join(directory, 'optica.sqlite3');
  const settingsPath = join(directory, 'backup-settings.json');
  const securityPath = join(directory, 'security.json');
  const security = new SecurityManager(securityPath);
  const accessPassword = randomBytes(18).toString('base64url');
  await security.setup(accessPassword, 15);

  let database: ApplicationDatabase | null = ApplicationDatabase.open(databasePath);
  const recoveryPassword = randomBytes(24).toString('base64url');
  const backups = new BackupService(settingsPath, '0.9.0');
  try {
    assertHealthy(database);
    const client = database.clients.create({
      firstName: 'Empaquetada',
      lastName: 'Ficticia',
      phone: '0000000000',
    });
    const job = database.opticalJobs.createWithTreatments({
      clientId: client.id,
      product: 'Lentes de contacto',
      productColor: 'Transparente',
      supplier: 'Proveedor QA empaquetado',
      treatmentNames: ['Tratamiento libre empaquetado'],
    });
    const created = await backups.create(database, recoveryPassword);
    const backupPath = join(directory, 'backups', created.fileName);
    if (!existsSync(backupPath)) throw new Error('No se generó el backup empaquetado.');
    backups.setSelectedRestorePath(backupPath);
    await backups.verifySelected(recoveryPassword);
    const prepared = await backups.prepareRestore(recoveryPassword);

    database.close();
    database = null;
    const coordinator = new RestoreCoordinator(databasePath);
    coordinator.begin(prepared.sqlitePath);
    prepared.transferOwnership();
    coordinator.moveActiveToRollback();
    coordinator.placeCandidate();
    const candidate = ApplicationDatabase.open(databasePath);
    try {
      assertHealthy(candidate);
      if (candidate.clients.getById(client.id)?.firstName !== 'Empaquetada')
        throw new Error('La restauración empaquetada no conservó el registro ficticio.');
      if (
        candidate.opticalJobs.getById(job.id)?.supplier !== 'Proveedor QA empaquetado' ||
        candidate.opticalJobs.getById(job.id)?.treatments[0]?.name !==
          'Tratamiento libre empaquetado'
      )
        throw new Error('La restauración empaquetada no conservó la ficha del Bloque 1.');
    } finally {
      candidate.close();
    }
    coordinator.markVerified();
    if (!coordinator.confirmAndCleanup())
      throw new Error('La restauración empaquetada dejó una limpieza pendiente.');
  } finally {
    database?.close();
  }

  process.stdout.write(
    `PACKAGED_QA_WRITE_OK electron=${process.versions.electron ?? 'unknown'} modules=${process.versions.modules}\n`,
  );
}

function readScenario(directory: string): void {
  const databasePath = join(directory, 'optica.sqlite3');
  const database = ApplicationDatabase.open(databasePath);
  try {
    assertHealthy(database);
    const stored = database.clients.list({ includeArchived: true });
    if (stored.length !== 1 || stored[0]?.firstName !== 'Empaquetada')
      throw new Error('La reapertura empaquetada no conservó la información.');
    const job = database.opticalJobs.listByClient(stored[0].id)[0];
    if (
      job?.product !== 'Lentes de contacto' ||
      job.productColor !== 'Transparente' ||
      job.supplier !== 'Proveedor QA empaquetado' ||
      job.treatments[0]?.name !== 'Tratamiento libre empaquetado'
    )
      throw new Error('La reapertura empaquetada no conservó la ficha del Bloque 1.');
  } finally {
    database.close();
  }
  if (!new SecurityManager(join(directory, 'security.json')).status().configured)
    throw new Error('La configuración de acceso no persistió.');
  const backupFiles = readdirSync(join(directory, 'backups')).filter((name) =>
    name.endsWith('.ocbackup'),
  );
  if (backupFiles.length !== 1) throw new Error('El backup cifrado no persistió.');

  process.stdout.write('PACKAGED_QA_READ_OK persistence=true security=true backup=true\n');
}

async function main(): Promise<void> {
  if (process.env.OCCHIALI_PACKAGED_QA !== '1')
    throw new Error('La utilidad de QA empaquetado está deshabilitada.');
  const mode = process.argv[2];
  const directory = requireTemporaryQaDirectory(process.argv[3]);
  if (mode === 'write') await writeScenario(directory);
  else if (mode === 'read') readScenario(directory);
  else throw new Error('Modo de QA empaquetado desconocido.');
}

void main().catch((error: unknown) => {
  process.stderr.write(`PACKAGED_QA_FAILED ${error instanceof Error ? error.message : 'error'}\n`);
  process.exitCode = 1;
});
