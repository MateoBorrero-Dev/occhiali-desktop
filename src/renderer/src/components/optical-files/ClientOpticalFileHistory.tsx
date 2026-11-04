import { ChevronLeft, ChevronRight, ExternalLink, FilePlus2, Files, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Client,
  OpticalFileListPage,
  OpticalFileSummary,
} from '../../../../shared/database-models';
import { formatPrescriptionDate } from '../../lib/prescription-api';
import { unwrapOpticalJobResult } from '../../lib/optical-job-api';
import { EmptyState } from '../common/EmptyState';
import { Button } from '../ui/Button';
import { buttonStyles } from '../ui/buttonStyles';
import { Card } from '../ui/Card';

const PAGE_SIZE = 10;
type HistoryState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; page: OpticalFileListPage };

function detailPath(item: OpticalFileSummary): string {
  return item.kind === 'JOB'
    ? `/fichas/trabajo/${item.jobId}`
    : `/fichas/receta/${item.prescriptionId}`;
}

function historyLabel(item: OpticalFileSummary): string {
  if (item.kind === 'PRESCRIPTION_ONLY') return 'Receta histórica sin trabajo';
  if (item.prescriptionId === null) return 'Ficha histórica sin graduación';
  if (item.relatedJobCount > 1) return `Graduación compartida con ${item.relatedJobCount} fichas`;
  return 'Ficha completa';
}

export function ClientOpticalFileHistory({ client }: { client: Client }): React.JSX.Element {
  const [offset, setOffset] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void window.optica.opticalJobs
      .listFiles({ clientId: client.id, limit: PAGE_SIZE, offset })
      .then(unwrapOpticalJobResult)
      .then((page) => {
        if (active) setState({ status: 'ready', page });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [client.id, offset, reloadToken]);

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Files size={21} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Fichas ópticas</h2>
            <p className="mt-1 text-sm text-slate-600">
              Graduaciones y datos comerciales del cliente en un único historial.
            </p>
          </div>
        </div>
        {client.isArchived ? (
          <p className="max-w-sm text-sm font-semibold text-amber-800">
            El cliente está archivado. Reactivalo para registrar una nueva ficha.
          </p>
        ) : (
          <Link to={`/clientes/${client.id}/recetas/nueva`} className={buttonStyles()}>
            <FilePlus2 size={18} aria-hidden="true" /> Nueva ficha
          </Link>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="py-16 text-center text-base font-semibold text-slate-600" role="status">
          Cargando fichas ópticas…
        </div>
      )}
      {state.status === 'error' && (
        <div className="py-14 text-center" role="alert">
          <p className="text-base font-semibold text-red-800">No se pudieron cargar las fichas.</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => {
              setState({ status: 'loading' });
              setReloadToken((value) => value + 1);
            }}
          >
            <RefreshCw size={18} aria-hidden="true" /> Reintentar
          </Button>
        </div>
      )}
      {state.status === 'ready' && state.page.items.length === 0 && (
        <EmptyState
          icon={Files}
          title="Todavía no hay fichas ópticas."
          description={
            client.isArchived
              ? 'El historial permanece disponible aunque el cliente esté archivado.'
              : 'Registrá la primera ficha óptica de este cliente.'
          }
          action={
            client.isArchived ? undefined : (
              <Link to={`/clientes/${client.id}/recetas/nueva`} className={buttonStyles()}>
                <FilePlus2 size={18} aria-hidden="true" /> Registrar ficha
              </Link>
            )
          }
        />
      )}
      {state.status === 'ready' && state.page.items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-base">
              <thead className="bg-slate-50 text-sm font-bold tracking-wide text-slate-700 uppercase">
                <tr>
                  <th className="px-5 py-4">Fecha</th>
                  <th className="px-4 py-4">Número</th>
                  <th className="px-4 py-4">Producto</th>
                  <th className="px-4 py-4">Información</th>
                  <th className="px-5 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.page.items.map((item) => (
                  <tr key={`${item.kind}:${item.recordId}`} className="hover:bg-slate-50/80">
                    <td className="px-5 py-4 font-semibold text-slate-950">
                      {formatPrescriptionDate(item.fileDate)}
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {item.jobNumber ?? (item.kind === 'JOB' ? `#${item.jobId}` : 'Histórica')}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{item.product ?? '—'}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                      {historyLabel(item)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={detailPath(item)}
                        className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                      >
                        Ver ficha <ExternalLink size={17} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-600">
              {state.page.total} {state.page.total === 1 ? 'ficha' : 'fichas'}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={offset === 0}
                onClick={() => {
                  setState({ status: 'loading' });
                  setOffset((value) => Math.max(0, value - PAGE_SIZE));
                }}
              >
                <ChevronLeft size={18} aria-hidden="true" /> Anterior
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={offset + PAGE_SIZE >= state.page.total}
                onClick={() => {
                  setState({ status: 'loading' });
                  setOffset((value) => value + PAGE_SIZE);
                }}
              >
                Siguiente <ChevronRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
