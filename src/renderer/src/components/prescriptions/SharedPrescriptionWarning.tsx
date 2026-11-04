import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OpticalJobSummary } from '../../../../shared/database-models';

export function SharedPrescriptionWarning({
  jobs,
  currentJobId,
  total = jobs.length,
  prescriptionId,
}: {
  jobs: readonly OpticalJobSummary[];
  currentJobId?: number;
  total?: number;
  prescriptionId?: number;
}): React.JSX.Element | null {
  if (total <= 1) return null;
  const truncated = total > jobs.length;
  return (
    <div
      className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" size={22} aria-hidden="true" />
        <div>
          <p className="font-bold">Esta graduación está compartida por {total} fichas.</p>
          <p className="mt-1 text-sm leading-6">
            Una corrección modifica la graduación común y se verá reflejada en todas las fichas
            asociadas.
          </p>
          {truncated && (
            <p className="mt-2 text-sm font-semibold">
              Esta advertencia muestra {jobs.length} de las {total} fichas afectadas.
            </p>
          )}
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Fichas afectadas visibles">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  to={`/fichas/trabajo/${job.id}`}
                  className="inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-bold text-amber-950 underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-amber-700"
                >
                  Ficha {job.jobNumber ?? `#${job.id}`}
                  {job.id === currentJobId ? ' (actual)' : ''}
                </Link>
              </li>
            ))}
          </ul>
          {truncated && prescriptionId !== undefined && (
            <Link
              to={`/fichas/receta/${prescriptionId}`}
              className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-amber-400 bg-white px-3 text-sm font-bold text-amber-950 underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-amber-700"
            >
              Consultar todas las fichas relacionadas
            </Link>
          )}
          <p className="mt-3 text-sm font-semibold">
            No se crearán copias ni se cambiarán las asociaciones existentes.
          </p>
        </div>
      </div>
    </div>
  );
}
