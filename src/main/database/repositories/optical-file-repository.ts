import type Database from 'better-sqlite3';
import type {
  OpticalFileListPage,
  OpticalFileListRequest,
  OpticalFileSummary,
} from '../../../shared/database-models';
import { parseOpticalFileListRequest } from '../../../shared/optical-job-validation';
import { escapedLike } from '../search';

interface OpticalFileRow {
  kind: 'JOB' | 'PRESCRIPTION_ONLY';
  record_id: number;
  job_id: number | null;
  prescription_id: number | null;
  client_id: number;
  client_first_name: string;
  client_last_name: string;
  file_date: string;
  job_number: string | null;
  product: string | null;
  created_at: string;
  related_job_count: number;
}

interface CountRow {
  total: number;
}

const OPTICAL_FILES_CTE = `
  WITH optical_files AS (
    SELECT
      'JOB' AS kind,
      j.id AS record_id,
      j.id AS job_id,
      j.prescription_id,
      j.client_id,
      c.first_name AS client_first_name,
      c.last_name AS client_last_name,
      coalesce(p.prescription_date, substr(j.created_at, 1, 10)) AS file_date,
      j.job_number,
      j.product,
      j.created_at,
      CASE
        WHEN j.prescription_id IS NULL THEN 0
        ELSE (SELECT count(*) FROM optical_jobs related WHERE related.prescription_id = j.prescription_id)
      END AS related_job_count
    FROM optical_jobs j
    JOIN clients c ON c.id = j.client_id
    LEFT JOIN prescriptions p ON p.id = j.prescription_id

    UNION ALL

    SELECT
      'PRESCRIPTION_ONLY' AS kind,
      p.id AS record_id,
      NULL AS job_id,
      p.id AS prescription_id,
      p.client_id,
      c.first_name AS client_first_name,
      c.last_name AS client_last_name,
      p.prescription_date AS file_date,
      NULL AS job_number,
      NULL AS product,
      p.created_at,
      0 AS related_job_count
    FROM prescriptions p
    JOIN clients c ON c.id = p.client_id
    WHERE NOT EXISTS (
      SELECT 1 FROM optical_jobs related WHERE related.prescription_id = p.id
    )
  )`;

function mapSummary(row: OpticalFileRow): OpticalFileSummary {
  return {
    kind: row.kind,
    recordId: row.record_id,
    jobId: row.job_id,
    prescriptionId: row.prescription_id,
    clientId: row.client_id,
    clientFirstName: row.client_first_name,
    clientLastName: row.client_last_name,
    fileDate: row.file_date,
    jobNumber: row.job_number,
    product: row.product,
    createdAt: row.created_at,
    relatedJobCount: row.related_job_count,
  };
}

export class OpticalFileRepository {
  public constructor(private readonly database: Database.Database) {}

  public search(request: OpticalFileListRequest = {}): OpticalFileListPage {
    const options = parseOpticalFileListRequest(request);
    const conditions: string[] = [];
    if (options.clientId !== undefined) conditions.push('client_id = @clientId');
    if (options.query) {
      conditions.push(`fold_text(
          coalesce(job_number, '') || ' ' ||
          coalesce(product, '') || ' ' ||
          client_first_name || ' ' || client_last_name || ' ' ||
          client_last_name || ' ' || client_first_name
        ) LIKE @query ESCAPE '\\'`);
    }
    const where = conditions.length > 0 ? conditions.join(' AND ') : '1 = 1';
    const parameters = {
      clientId: options.clientId ?? null,
      query: escapedLike(options.query),
      limit: options.limit,
      offset: options.offset,
    };
    const rows = this.database
      .prepare(
        `${OPTICAL_FILES_CTE}
         SELECT * FROM optical_files
         WHERE ${where}
         ORDER BY created_at DESC, kind, record_id DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(parameters) as OpticalFileRow[];
    const count = this.database
      .prepare(`${OPTICAL_FILES_CTE} SELECT count(*) AS total FROM optical_files WHERE ${where}`)
      .get(parameters) as CountRow;
    return {
      items: rows.map(mapSummary),
      total: count.total,
      limit: options.limit,
      offset: options.offset,
    };
  }
}
