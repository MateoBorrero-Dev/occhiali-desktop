import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OpticalJobListPage } from '../../../../shared/database-models';
import { formatJobTimestamp, unwrapOpticalJobResult } from '../../lib/optical-job-api';
import { Button } from '../ui/Button';
import { buttonStyles } from '../ui/buttonStyles';
import { Card } from '../ui/Card';

const PAGE_SIZE = 10;
type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; page: OpticalJobListPage };

export function PrescriptionOpticalJobs({
  prescriptionId,
}: {
  prescriptionId: number;
}): React.JSX.Element {
  const [offset, setOffset] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    void window.optica.opticalJobs
      .listByPrescription({ prescriptionId, limit: PAGE_SIZE, offset })
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
  }, [offset, prescriptionId, reloadToken]);

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-200 p-6">
        <BriefcaseBusiness className="text-teal-700" size={20} aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold">Fichas asociadas</h2>
          <p className="mt-1 text-sm text-slate-600">Trabajos ópticos que utilizan esta receta.</p>
        </div>
      </div>
      {state.status === 'loading' && (
        <p className="py-12 text-center text-sm font-semibold text-slate-600" role="status">
          Cargando fichas asociadas…
        </p>
      )}
      {state.status === 'error' && (
        <div className="py-10 text-center" role="alert">
          <p className="text-sm font-semibold text-red-800">
            No se pudieron consultar las fichas asociadas.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={() => {
              setState({ status: 'loading' });
              setReloadToken((value) => value + 1);
            }}
          >
            <RefreshCw size={15} aria-hidden="true" /> Reintentar
          </Button>
        </div>
      )}
      {state.status === 'ready' && state.page.items.length === 0 && (
        <p className="px-6 py-8 text-sm text-slate-600">
          Esta receta todavía no está vinculada a ninguna ficha.
        </p>
      )}
      {state.status === 'ready' && state.page.items.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100">
            {state.page.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {item.jobNumber ? `Ficha ${item.jobNumber}` : `Ficha #${item.id}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.product ?? 'Producto sin especificar'} ·{' '}
                    {formatJobTimestamp(item.createdAt)}
                  </p>
                </div>
                <Link
                  to={`/trabajos/${item.id}`}
                  className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                >
                  Ver ficha <ExternalLink size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold text-slate-600">
              {state.page.total} {state.page.total === 1 ? 'ficha asociada' : 'fichas asociadas'}
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
                <ChevronLeft size={15} aria-hidden="true" /> Anterior
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
                Siguiente <ChevronRight size={15} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
