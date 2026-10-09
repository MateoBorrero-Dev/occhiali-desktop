import type Database from 'better-sqlite3';
import type {
  DashboardSummary,
  GlobalClientSearchResult,
  GlobalOpticalJobSearchResult,
  GlobalPrescriptionSearchResult,
  GlobalSearchRequest,
  GlobalSearchResults,
} from '../../../shared/database-models';
import { parseGlobalSearchRequest } from '../../../shared/query-validation';
import { escapedLike } from '../search';

interface DashboardRow {
  active_clients: number;
  total_prescriptions: number;
  total_optical_jobs: number;
}

interface ClientRow {
  id: number;
  first_name: string;
  last_name: string;
  document_number: string | null;
  phone: string | null;
  is_archived: number;
}

interface PrescriptionRow {
  id: number;
  client_id: number;
  first_name: string;
  last_name: string;
  prescription_date: string;
}

interface OpticalJobRow {
  id: number;
  client_id: number;
  first_name: string;
  last_name: string;
  job_number: string | null;
  product: string | null;
}

export class QueryRepository {
  public constructor(private readonly database: Database.Database) {}

  public dashboard(): DashboardSummary {
    const row = this.database
      .prepare(
        `SELECT
          (SELECT count(*) FROM clients WHERE is_archived = 0) AS active_clients,
          (SELECT count(*) FROM prescriptions) AS total_prescriptions,
          (SELECT count(*) FROM optical_jobs) AS total_optical_jobs`,
      )
      .get() as DashboardRow;
    return {
      activeClients: row.active_clients,
      totalPrescriptions: row.total_prescriptions,
      totalOpticalJobs: row.total_optical_jobs,
    };
  }

  public globalSearch(request: GlobalSearchRequest): GlobalSearchResults {
    const options = parseGlobalSearchRequest(request);
    const parameters = { query: escapedLike(options.query), limit: options.limit };
    const clients = this.database
      .prepare(
        `SELECT id, first_name, last_name, document_number, phone, is_archived
         FROM clients
         WHERE fold_text(
           first_name || ' ' || last_name || ' ' || last_name || ' ' || first_name || ' ' ||
           coalesce(document_number, '') || ' ' || coalesce(phone, '')
         ) LIKE @query ESCAPE '\\'
         ORDER BY is_archived, last_name COLLATE NOCASE, first_name COLLATE NOCASE, id
         LIMIT @limit`,
      )
      .all(parameters) as ClientRow[];
    const prescriptions = this.database
      .prepare(
        `SELECT p.id, p.client_id, c.first_name, c.last_name, p.prescription_date
         FROM prescriptions p
         JOIN clients c ON c.id = p.client_id
         WHERE fold_text(
           c.first_name || ' ' || c.last_name || ' ' || c.last_name || ' ' || c.first_name || ' ' ||
           coalesce(c.document_number, '') || ' ' || coalesce(c.phone, '')
         ) LIKE @query ESCAPE '\\'
         ORDER BY p.prescription_date DESC, p.id DESC
         LIMIT @limit`,
      )
      .all(parameters) as PrescriptionRow[];
    const opticalJobs = this.database
      .prepare(
        `SELECT j.id, j.client_id, c.first_name, c.last_name, j.job_number, j.product
         FROM optical_jobs j
         JOIN clients c ON c.id = j.client_id
         WHERE fold_text(
           c.first_name || ' ' || c.last_name || ' ' || c.last_name || ' ' || c.first_name || ' ' ||
           coalesce(c.document_number, '') || ' ' || coalesce(c.phone, '') || ' ' ||
           coalesce(j.job_number, '') || ' ' || coalesce(j.product, '')
         ) LIKE @query ESCAPE '\\'
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT @limit`,
      )
      .all(parameters) as OpticalJobRow[];
    return {
      clients: clients.map(mapClient),
      prescriptions: prescriptions.map(mapPrescription),
      opticalJobs: opticalJobs.map(mapOpticalJob),
      limit: options.limit,
    };
  }
}

function mapClient(row: ClientRow): GlobalClientSearchResult {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    documentNumber: row.document_number,
    phone: row.phone,
    isArchived: row.is_archived === 1,
  };
}

function mapPrescription(row: PrescriptionRow): GlobalPrescriptionSearchResult {
  return {
    id: row.id,
    clientId: row.client_id,
    clientFirstName: row.first_name,
    clientLastName: row.last_name,
    prescriptionDate: row.prescription_date,
  };
}

function mapOpticalJob(row: OpticalJobRow): GlobalOpticalJobSearchResult {
  return {
    id: row.id,
    clientId: row.client_id,
    clientFirstName: row.first_name,
    clientLastName: row.last_name,
    jobNumber: row.job_number,
    product: row.product,
  };
}
