import type Database from 'better-sqlite3';
import {
  parseClientListRequest,
  parseCreateClientInput,
  parseUpdateClientInput,
} from '../../../shared/client-validation';
import type {
  Client,
  ClientListPage,
  ClientListRequest,
  CreateClientInput,
  UpdateClientInput,
} from '../../../shared/database-models';

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

interface CountRow {
  total: number;
}

export class ClientNotFoundError extends Error {
  public constructor() {
    super('No existe el cliente solicitado.');
    this.name = 'ClientNotFoundError';
  }
}

export class DuplicateClientDocumentError extends Error {
  public constructor() {
    super('Ya existe un cliente registrado con ese DNI.');
    this.name = 'DuplicateClientDocumentError';
  }
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

function foldSearchText(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR');
}

function escapedLike(value: string): string {
  return `%${foldSearchText(value).replace(/[\\%_]/g, '\\$&')}%`;
}

function isDuplicateDocumentError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function sameEditableValues(
  left: Client,
  right: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>,
): boolean {
  return (
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.documentNumber === right.documentNumber &&
    left.phone === right.phone &&
    left.address === right.address &&
    left.birthDate === right.birthDate &&
    left.notes === right.notes &&
    left.isArchived === right.isArchived
  );
}

export class ClientRepository {
  public constructor(private readonly database: Database.Database) {
    database.function('fold_text', { deterministic: true }, foldSearchText);
  }

  public create(input: CreateClientInput): Client {
    const normalized = parseCreateClientInput(input);
    try {
      const result = this.database
        .prepare(
          `INSERT INTO clients (
            first_name, last_name, document_number, phone, address, birth_date, notes
          ) VALUES (
            @firstName, @lastName, @documentNumber, @phone, @address, @birthDate, @notes
          )`,
        )
        .run(normalized);
      return this.requireById(insertedId(result));
    } catch (error: unknown) {
      if (isDuplicateDocumentError(error)) {
        throw new DuplicateClientDocumentError();
      }
      throw error;
    }
  }

  public getById(id: number): Client | null {
    const row = this.database.prepare('SELECT * FROM clients WHERE id = ?').get(id) as
      ClientRow | undefined;
    return row ? mapClient(row) : null;
  }

  public list(options: { includeArchived?: boolean } = {}): Client[] {
    return this.search({ status: options.includeArchived ? 'all' : 'active', limit: 100 }).items;
  }

  public search(request: ClientListRequest = {}): ClientListPage {
    const options = parseClientListRequest(request);
    const filters: string[] = [];
    if (options.status === 'active') filters.push('is_archived = 0');
    if (options.status === 'archived') filters.push('is_archived = 1');
    if (options.query) {
      filters.push(`fold_text(
        first_name || ' ' || last_name || ' ' || last_name || ' ' || first_name || ' ' ||
        coalesce(document_number, '') || ' ' || coalesce(phone, '')
      ) LIKE @query ESCAPE '\\'`);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const parameters = {
      query: escapedLike(options.query),
      limit: options.limit,
      offset: options.offset,
    };
    const rows = this.database
      .prepare(
        `SELECT * FROM clients ${where}
         ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, id
         LIMIT @limit OFFSET @offset`,
      )
      .all(parameters) as ClientRow[];
    const count = this.database
      .prepare(`SELECT count(*) AS total FROM clients ${where}`)
      .get(parameters) as CountRow;
    return {
      items: rows.map(mapClient),
      total: count.total,
      limit: options.limit,
      offset: options.offset,
    };
  }

  public update(id: number, input: UpdateClientInput): Client {
    const current = this.requireById(id);
    const normalized = parseUpdateClientInput(input);
    const next = {
      firstName: normalized.firstName ?? current.firstName,
      lastName: normalized.lastName ?? current.lastName,
      documentNumber:
        normalized.documentNumber === undefined
          ? current.documentNumber
          : normalized.documentNumber,
      phone: normalized.phone === undefined ? current.phone : normalized.phone,
      address: normalized.address === undefined ? current.address : normalized.address,
      birthDate: normalized.birthDate === undefined ? current.birthDate : normalized.birthDate,
      notes: normalized.notes === undefined ? current.notes : normalized.notes,
      isArchived: normalized.isArchived ?? current.isArchived,
    };
    if (sameEditableValues(current, next)) {
      return current;
    }

    try {
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
          ...next,
          id,
          isArchived: Number(next.isArchived),
          updatedAt: new Date().toISOString(),
        });
      return this.requireById(id);
    } catch (error: unknown) {
      if (isDuplicateDocumentError(error)) {
        throw new DuplicateClientDocumentError();
      }
      throw error;
    }
  }

  public archive(id: number): Client {
    return this.update(id, { isArchived: true });
  }

  public restore(id: number): Client {
    return this.update(id, { isArchived: false });
  }

  private requireById(id: number): Client {
    const client = this.getById(id);
    if (!client) {
      throw new ClientNotFoundError();
    }
    return client;
  }
}
