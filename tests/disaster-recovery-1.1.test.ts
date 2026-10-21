import { createCipheriv, scrypt as nodeScrypt } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupCredentialStore } from '../src/main/backup/backup-credential-store';
import { BackupService } from '../src/main/backup/backup-service';
import { RestoreCoordinator } from '../src/main/backup/restore-recovery';
import { ApplicationDatabase } from '../src/main/database';
import { getMigrationIds } from '../src/main/database/migrations';
import { SecurityManager } from '../src/main/security/security-manager';
import { createTestDatabase, destroyTestDatabase } from './database/helpers';
import type { TestDatabase } from './database/helpers';

const RECOVERY_PASSWORD = 'Recuperacion-Desastre-2026';
const NEW_ACCESS_PASSWORD = 'Acceso-Nuevo-Equipo-2026';
const KDF = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

interface HistoricalMetadata {
  formatVersion: 1;
  createdAt: string;
  appVersion: string;
  schemaMigrations: string[];
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 32, KDF, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

async function createControlledHistoricalFixture(
  database: ApplicationDatabase,
  directory: string,
  appVersion: '0.9.0' | '1.0.0',
): Promise<string> {
  const sqlitePath = join(directory, `historical-${appVersion}.sqlite3`);
  await database.backupTo(sqlitePath);
  const metadata: HistoricalMetadata = {
    formatVersion: 1,
    createdAt: '2026-10-18T12:00:00.000Z',
    appVersion,
    schemaMigrations: [...getMigrationIds()],
  };
  const salt = Buffer.alloc(16, appVersion === '0.9.0' ? 9 : 10);
  const nonce = Buffer.alloc(12, appVersion === '0.9.0' ? 19 : 20);
  const kdf = {
    name: 'scrypt' as const,
    salt: salt.toString('base64'),
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
  };
  const cipherMetadata = {
    name: 'aes-256-gcm' as const,
    nonce: nonce.toString('base64'),
  };
  const authenticatedHeader = Buffer.from(
    JSON.stringify({ magic: 'OCCHIALI_BACKUP', metadata, kdf, cipher: cipherMetadata }),
  );
  const cipher = createCipheriv('aes-256-gcm', await derive(RECOVERY_PASSWORD, salt), nonce);
  cipher.setAAD(authenticatedHeader);
  const payload = Buffer.concat([cipher.update(readFileSync(sqlitePath)), cipher.final()]);
  const fixturePath = join(directory, `fixture-${appVersion}.ocbackup`);
  writeFileSync(
    fixturePath,
    JSON.stringify({
      magic: 'OCCHIALI_BACKUP',
      metadata,
      kdf,
      cipher: { ...cipherMetadata, tag: cipher.getAuthTag().toString('base64') },
      payload: payload.toString('base64'),
    }),
  );
  rmSync(sqlitePath, { force: true });
  return fixturePath;
}

describe('recuperación ante desastres 1.1', () => {
  let source: TestDatabase | null = null;
  const directories: string[] = [];

  afterEach(() => {
    if (source) {
      destroyTestDatabase(source);
      source = null;
    }
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  function temporaryDirectory(prefix: string): string {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    directories.push(directory);
    return directory;
  }

  function populateSource() {
    source = createTestDatabase();
    const client = source.database.clients.create({
      firstName: 'Recuperación',
      lastName: 'Ficticia',
      documentNumber: '30999991',
      phone: '0000000000',
    });
    const prescription = source.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-10-18',
      additionOd: '1.25',
      additionOi: '1.50',
      values: [
        { distance: 'FAR', eye: 'OD', sphere: '-2.00', cylinder: '-0.50', axis: 90 },
        { distance: 'NEAR', eye: 'OI', sphere: '1.00', dip: '31.50', height: '18.00' },
      ],
    });
    source.database.prescriptions.correct(prescription.id, {
      prescriptionDate: '2026-10-18',
      additionOd: '1.50',
      additionOi: null,
      reason: 'Corrección de recuperación ficticia',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.75' }],
    });
    const job = source.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: prescription.id,
      jobNumber: 'DR-0001',
      product: 'Anteojos recetados',
      productColor: 'Carey',
      supplier: 'Proveedor ficticio',
      treatmentIds: ['edge-polish'],
      treatmentNames: ['Acabado ficticio recuperable'],
    });
    const receipt = source.database.deliveryReceipts.create({
      opticalJobId: job.id,
      deliveredAt: '2026-10-18T15:00:00.000Z',
      recipientType: 'OWNER',
      recipientFullName: 'Recuperación Ficticia',
      deliveredBy: 'Responsable QA',
      deliveryConfirmed: true,
    });
    return { client, prescription, job, receipt };
  }

  it.each(['0.9.0', '1.0.0'] as const)(
    'abre un fixture criptográfico controlado de %s en un perfil nuevo',
    async (version) => {
      const records = populateSource();
      const exchange = temporaryDirectory('occhiali-disaster-exchange-');
      const newProfile = temporaryDirectory('occhiali-disaster-profile-');
      const fixture = await createControlledHistoricalFixture(source!.database, exchange, version);
      const credentials = new BackupCredentialStore(join(newProfile, 'backup-credential.json'), {
        isEncryptionAvailable: () => false,
        encryptStringAsync: () => Promise.reject(new Error('DPAPI no disponible')),
        decryptStringAsync: () => Promise.reject(new Error('DPAPI no disponible')),
      });
      expect(credentials.state()).toBe('UNAVAILABLE');
      expect(existsSync(join(newProfile, 'backup-credential.json'))).toBe(false);

      const backups = new BackupService(join(newProfile, 'backup-settings.json'), '1.1.0');
      backups.setSelectedRestorePath(fixture);
      await expect(backups.verifySelected(RECOVERY_PASSWORD)).resolves.toMatchObject({
        appVersion: version,
        formatVersion: 1,
      });
      const prepared = await backups.prepareRestore(RECOVERY_PASSWORD);
      const restored = ApplicationDatabase.open(prepared.sqlitePath);
      try {
        expect(restored.clients.getById(records.client.id)?.documentNumber).toBe('30999991');
        expect(restored.prescriptions.getById(records.prescription.id)).toMatchObject({
          additionOd: '1.50',
          additionOi: null,
          values: [{ distance: 'FAR', eye: 'OD', sphere: '-1.75' }],
        });
        expect(restored.prescriptions.listRevisions(records.prescription.id)).toHaveLength(1);
        expect(restored.opticalJobs.getById(records.job.id)).toMatchObject({
          product: 'Anteojos recetados',
          productColor: 'Carey',
        });
        expect(restored.opticalJobs.getById(records.job.id)?.treatments).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'Pulido de bordes' }),
            expect.objectContaining({ name: 'Acabado ficticio recuperable' }),
          ]),
        );
        expect(restored.deliveryReceipts.getById(records.receipt.id)?.receiptNumber).toBe(
          'RET-000001',
        );
        expect(restored.integrityCheck()).toBe('ok');
        expect(restored.foreignKeyViolations()).toEqual([]);
      } finally {
        restored.close();
        await prepared.cleanup();
      }
    },
  );

  it('reemplaza una base nueva sin depender de seguridad o DPAPI del equipo original', async () => {
    const records = populateSource();
    const exchange = temporaryDirectory('occhiali-disaster-transfer-');
    const newProfile = temporaryDirectory('occhiali-disaster-new-machine-');
    const fixture = await createControlledHistoricalFixture(source!.database, exchange, '0.9.0');
    const securityPath = join(newProfile, 'security.json');
    const security = new SecurityManager(securityPath);
    expect(security.status().configured).toBe(false);
    await security.setup(NEW_ACCESS_PASSWORD, 15);

    const activePath = join(newProfile, 'optica.sqlite3');
    const emptyCurrent = ApplicationDatabase.open(activePath);
    emptyCurrent.clients.create({ firstName: 'Base', lastName: 'Nueva temporal' });
    emptyCurrent.close();
    const backups = new BackupService(join(newProfile, 'backup-settings.json'), '1.1.0');
    backups.setSelectedRestorePath(fixture);
    const prepared = await backups.prepareRestore(RECOVERY_PASSWORD);
    const coordinator = new RestoreCoordinator(activePath);
    coordinator.begin(prepared.sqlitePath);
    prepared.transferOwnership();
    coordinator.moveActiveToRollback();
    coordinator.placeCandidate();
    const candidate = ApplicationDatabase.open(activePath);
    try {
      expect(candidate.integrityCheck()).toBe('ok');
      expect(candidate.foreignKeyViolations()).toEqual([]);
    } finally {
      candidate.close();
    }
    coordinator.markVerified();
    expect(coordinator.confirmAndCleanup()).toBe(true);

    const reopened = ApplicationDatabase.open(activePath);
    try {
      expect(reopened.clients.getById(records.client.id)?.firstName).toBe('Recuperación');
      expect(reopened.prescriptions.getById(records.prescription.id)).toBeDefined();
      expect(reopened.opticalJobs.getById(records.job.id)?.product).toBe('Anteojos recetados');
      expect(reopened.deliveryReceipts.getById(records.receipt.id)).toBeDefined();
      expect(reopened.treatments.list().map((item) => item.name)).toContain(
        'Acabado ficticio recuperable',
      );
    } finally {
      reopened.close();
    }
    expect(new SecurityManager(securityPath).status()).toMatchObject({
      configured: true,
      authenticated: false,
    });
    await expect(
      new SecurityManager(securityPath).login(NEW_ACCESS_PASSWORD),
    ).resolves.toBeDefined();
    expect(existsSync(join(newProfile, 'backup-credential.json'))).toBe(false);
    expect(existsSync(join(newProfile, 'backup-history.json'))).toBe(false);
  });

  it('rechaza contraseña incorrecta y truncamiento sin modificar la base del perfil nuevo', async () => {
    populateSource();
    const exchange = temporaryDirectory('occhiali-disaster-damaged-');
    const newProfile = temporaryDirectory('occhiali-disaster-protected-');
    const fixture = await createControlledHistoricalFixture(source!.database, exchange, '1.0.0');
    const selected = join(exchange, 'selected.ocbackup');
    copyFileSync(fixture, selected);
    const activePath = join(newProfile, 'optica.sqlite3');
    const active = ApplicationDatabase.open(activePath);
    const protectedClient = active.clients.create({ firstName: 'No', lastName: 'Sobrescribir' });
    active.close();
    const backups = new BackupService(join(newProfile, 'backup-settings.json'), '1.1.0');
    backups.setSelectedRestorePath(selected);

    await expect(backups.prepareRestore('Recuperacion-Incorrecta-2026')).rejects.toThrow(
      'incorrecta o el archivo está dañado',
    );
    const raw = readFileSync(selected);
    writeFileSync(selected, raw.subarray(0, Math.floor(raw.length / 2)));
    await expect(backups.prepareRestore(RECOVERY_PASSWORD)).rejects.toThrow();
    expect(readdirSync(newProfile).filter((name) => name.startsWith('.restore-staging-'))).toEqual(
      [],
    );

    const unchanged = ApplicationDatabase.open(activePath);
    try {
      expect(unchanged.clients.getById(protectedClient.id)?.lastName).toBe('Sobrescribir');
      expect(unchanged.clients.list({ includeArchived: true })).toHaveLength(1);
      expect(unchanged.integrityCheck()).toBe('ok');
    } finally {
      unchanged.close();
    }
  });
});
