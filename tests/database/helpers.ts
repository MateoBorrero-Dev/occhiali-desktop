import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { ApplicationDatabase } from '../../src/main/database';
import type {
  CreateClientInput,
  CreatePrescriptionValueInput,
} from '../../src/shared/database-models';

export interface TestDatabase {
  directory: string;
  filePath: string;
  database: ApplicationDatabase;
}

export const TEST_CLIENT: CreateClientInput = {
  firstName: 'Cliente',
  lastName: 'Prueba',
  documentNumber: null,
  phone: '011 5555 0000',
  address: 'Calle Ficticia 123',
  birthDate: '1980-05-20',
  notes: 'Dato completamente ficticio.',
};

export const FOUR_PRESCRIPTION_VALUES: CreatePrescriptionValueInput[] = [
  { distance: 'FAR', eye: 'OD', sphere: '-1.25', cylinder: '0.00', axis: 0, dip: '31.50' },
  { distance: 'FAR', eye: 'OI', sphere: '1.50', cylinder: '-0.50', axis: 180, dip: '31.25' },
  { distance: 'NEAR', eye: 'OD', sphere: '2.00', cylinder: null, axis: null, height: '18.00' },
  { distance: 'NEAR', eye: 'OI', sphere: '0.00', cylinder: '0.25', axis: 90, height: null },
];

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'occhiali-test-'));
  const filePath = join(directory, 'test.sqlite3');
  return {
    directory,
    filePath,
    database: ApplicationDatabase.open(filePath),
  };
}

export function destroyTestDatabase(context: TestDatabase): void {
  context.database.close();
  const resolvedDirectory = resolve(context.directory);
  if (!basename(resolvedDirectory).startsWith('occhiali-test-')) {
    throw new Error('Se rechazó eliminar un directorio que no pertenece al QA de Occhiali.');
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}
