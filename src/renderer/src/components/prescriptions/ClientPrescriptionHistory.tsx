import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Client, PrescriptionListPage } from '../../../../shared/database-models';
import {
  formatPrescriptionDate,
  formatPrescriptionTimestamp,
  unwrapPrescriptionResult,
} from '../../lib/prescription-api';
import { EmptyState } from '../common/EmptyState';
import { Button } from '../ui/Button';
import { buttonStyles } from '../ui/buttonStyles';
import { Card } from '../ui/Card';

const PAGE_SIZE = 10;

interface ClientPrescriptionHistoryProps {
  client: Client;
}

type HistoryState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; page: PrescriptionListPage };

export function ClientPrescriptionHistory({
  client,
}: ClientPrescriptionHistoryProps): React.JSX.Element {
  const [offset, setOffset] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void window.optica.prescriptions
      .listByClient({ clientId: client.id, limit: PAGE_SIZE, offset })
      .then(unwrapPrescriptionResult)
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <FileText size={19} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-950">Historial de recetas</h2>
            <p className="mt-1 text-sm text-slate-600">
              Prescripciones ordenadas desde la más reciente.
            </p>
          </div>
        </div>
        {client.isArchived ? (
          <p className="max-w-sm text-sm font-semibold text-amber-800">
            El cliente está archivado. Reactivalo para registrar una nueva receta.
          </p>
        ) : (
          <Link to={`/clientes/${client.id}/recetas/nueva`} className={buttonStyles()}>
            <FilePlus2 size={17} aria-hidden="true" />
            Nueva receta
          </Link>
        )}
      </div>
      {state.status === 'loading' && (
        <div className="py-16 text-center text-sm font-semibold text-slate-600" role="status">
          Cargando historial…
        </div>
      )}
      {state.status === 'error' && (
        <div className="py-14 text-center" role="alert">
          <p className="text-sm font-semibold text-red-800">No se pudo cargar el historial.</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => {
              setState({ status: 'loading' });
              setReloadToken((value) => value + 1);
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      )}
      {state.status === 'ready' && state.page.items.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Todavía no hay recetas registradas."
          description={
            client.isArchived
              ? 'El historial se conservará aunque el cliente esté archivado.'
              : 'Registrá la primera prescripción óptica de este cliente.'
          }
          action={
            !client.isArchived ? (
              <Link to={`/clientes/${client.id}/recetas/nueva`} className={buttonStyles()}>
                <FilePlus2 size={17} aria-hidden="true" />
                Registrar receta
              </Link>
            ) : undefined
          }
        />
      )}
      {state.status === 'ready' && state.page.items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold tracking-wide text-slate-600 uppercase">
                <tr>
                  <th className="px-5 py-3">Fecha de receta</th>
                  <th className="px-4 py-3">Profesional</th>
                  <th className="px-4 py-3">Graduaciones</th>
                  <th className="px-4 py-3">Fecha de carga</th>
                  <th className="px-5 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.page.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-4 font-semibold text-slate-950">
                      {formatPrescriptionDate(item.prescriptionDate)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {item.prescriberName ?? 'No informado'}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {item.valueCount} {item.valueCount === 1 ? 'fila' : 'filas'}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatPrescriptionTimestamp(item.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/recetas/${item.id}`}
                        className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                      >
                        Ver detalle <ExternalLink size={15} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold text-slate-600">
              {state.page.total} {state.page.total === 1 ? 'receta' : 'recetas'}
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
                <ChevronLeft size={16} aria-hidden="true" />
                Anterior
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
                Siguiente <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
