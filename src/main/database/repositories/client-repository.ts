import type Database from 'better-sqlite3';
import type { Client, CreateClientInput, UpdateClientInput } from '../../../shared/database-models';
import { calendarDate, optionalCalendarDate, optionalText, requiredText } from '../validation';

interface ClientRow {
  id: number;
  first_name: string;
  last_name: string;
  document_number: string | null;
  phone: string | null;
  address: string | null;
  birth_date: string | null;
  notes: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    documentNumber: row.document_number,
    phone: row.phone,
    address: row.address,
    birthDate: row.birth_date,
    notes: row.notes,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function insertedId(result: Database.RunResult): number {
  const id = Number(result.lastInsertRowid);
  if (!Number.isSafeInteger(id)) {
    throw new RangeError('SQLite devolvió un identificador inválido.');
  }
  return id;
}

export class ClientRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: CreateClientInput): Client {
    const result = this.database
      .prepare(
        `INSERT INTO clients (
          first_name, last_name, document_number, phone, address, birth_date, notes
        ) VALUES (
          @firstName, @lastName, @documentNumber, @phone, @address, @birthDate, @notes
        )`,
      )
      .run({
        firstName: requiredText(input.firstName, 'El nombre'),
        lastName: requiredText(input.lastName, 'El apellido'),
        documentNumber: optionalText(input.documentNumber),
        phone: optionalText(input.phone),
        address: optionalText(input.address),
        birthDate: optionalCalendarDate(input.birthDate, 'La fecha de nacimiento'),
        notes: optionalText(input.notes),
      });

    return this.requireById(insertedId(result));
  }

  public getById(id: number): Client | null {
    const row = this.database.prepare('SELECT * FROM clients WHERE id = ?').get(id) as
      ClientRow | undefined;
    return row ? mapClient(row) : null;
  }

  public list(options: { includeArchived?: boolean } = {}): Client[] {
    const where = options.includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.database
      .prepare(
        `SELECT * FROM clients ${where}
         ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, id`,
      )
      .all() as ClientRow[];
    return rows.map(mapClient);
  }

  public update(id: number, input: UpdateClientInput): Client {
    const current = this.requireById(id);
    const nextBirthDate =
      input.birthDate === undefined
        ? current.birthDate
        : optionalCalendarDate(input.birthDate, 'La fecha de nacimiento');

    this.database
      .prepare(
        `UPDATE clients SET
          first_name = @firstName,
          last_name = @lastName,
          document_number = @documentNumber,
          phone = @phone,
          address = @address,
          birth_date = @birthDate,
          notes = @notes,
          is_archived = @isArchived,
          updated_at = @updatedAt
        WHERE id = @id`,
      )
      .run({
        id,
        firstName:
          input.firstName === undefined
            ? current.firstName
            : requiredText(input.firstName, 'El nombre'),
        lastName:
          input.lastName === undefined
            ? current.lastName
            : requiredText(input.lastName, 'El apellido'),
        documentNumber:
          input.documentNumber === undefined
            ? current.documentNumber
            : optionalText(input.documentNumber),
        phone: input.phone === undefined ? current.phone : optionalText(input.phone),
        address: input.address === undefined ? current.address : optionalText(input.address),
        birthDate:
          nextBirthDate === null ? null : calendarDate(nextBirthDate, 'La fecha de nacimiento'),
        notes: input.notes === undefined ? current.notes : optionalText(input.notes),
        isArchived:
          input.isArchived === undefined ? Number(current.isArchived) : Number(input.isArchived),
        updatedAt: new Date().toISOString(),
      });

    return this.requireById(id);
  }

  private requireById(id: number): Client {
    const client = this.getById(id);
    if (!client) {
      throw new Error('No existe el cliente solicitado.');
    }
    return client;
  }
}
