import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OpticalJobListPage } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatJobTimestamp, unwrapOpticalJobResult } from '../lib/optical-job-api';

const PAGE_SIZE = 25;
type ListState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; page: OpticalJobListPage };

export function WorkPage(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const debouncedQuery = useDebouncedValue(query, 300);
  const sequence = useRef(0);
  useEffect(() => {
    const request = ++sequence.current;
    void window.optica.opticalJobs
      .list({ query: debouncedQuery, limit: PAGE_SIZE, offset })
      .then(unwrapOpticalJobResult)
      .then((page) => {
        if (sequence.current === request) setState({ status: 'ready', page });
      })
      .catch(() => {
        if (sequence.current === request) setState({ status: 'error' });
      });
  }, [debouncedQuery, offset, reloadToken]);
  const clearSearch = (): void => {
    setState({ status: 'loading' });
    setQuery('');
    setOffset(0);
  };
  return (
    <div>
      <PageHeader
        eyebrow="Gestión comercial"
        title="Trabajos"
        description="Fichas de productos, armazones, tratamientos y acabados de lentes."
        action={
          <Link to="/trabajos/nuevo" className={buttonStyles()}>
            <FilePlus2 size={17} aria-hidden="true" />
            Nueva ficha
          </Link>
        }
      />
      <Card className="mt-6 p-4">
        <label className="text-sm font-semibold text-slate-800">
          Buscar fichas
          <div className="relative mt-1.5 max-w-3xl">
            <Search
              size={18}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pr-10 pl-10 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              placeholder="Número, cliente, producto o modelo"
              value={query}
              onChange={(event) => {
                setState({ status: 'loading' });
                setQuery(event.target.value);
                setOffset(0);
              }}
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                aria-label="Limpiar búsqueda"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </label>
      </Card>
      <Card className="mt-4 overflow-hidden">
        {state.status === 'loading' && (
          <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
            Cargando fichas…
          </div>
        )}
        {state.status === 'error' && (
          <div className="py-20 text-center" role="alert">
            <p className="text-sm font-semibold text-red-800">
              No se pudo cargar el listado de fichas.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => {
                setState({ status: 'loading' });
                setReloadToken((value) => value + 1);
              }}
            >
              <RefreshCw size={16} />
              Reintentar
            </Button>
          </div>
        )}
        {state.status === 'ready' && state.page.items.length === 0 && (
          <EmptyState
            icon={debouncedQuery ? Search : BriefcaseBusiness}
            title={
              debouncedQuery
                ? 'No encontramos fichas con esa búsqueda.'
                : 'Todavía no hay fichas de trabajo.'
            }
            description={
              debouncedQuery
                ? 'Probá con otro número, cliente o producto.'
                : 'Registrá la primera ficha de producto o pedido óptico.'
            }
            action={
              debouncedQuery ? (
                <Button variant="secondary" onClick={clearSearch}>
                  Limpiar búsqueda
                </Button>
              ) : (
                <Link to="/trabajos/nuevo" className={buttonStyles()}>
                  <FilePlus2 size={17} />
                  Registrar ficha
                </Link>
              )
            }
          />
        )}
        {state.status === 'ready' && state.page.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold tracking-wide text-slate-600 uppercase">
                  <tr>
                    <th className="px-5 py-3">Número</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Modelo</th>
                    <th className="px-4 py-3">Registro</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.page.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-semibold">{item.jobNumber ?? 'Sin número'}</td>
                      <td className="px-4 py-4">
                        {item.clientLastName}, {item.clientFirstName}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {item.product ?? 'Sin especificar'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {item.frameModel ?? 'Sin especificar'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatJobTimestamp(item.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/clientes/${item.clientId}`}
                            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          >
                            <UserRound size={15} />
                            Cliente
                          </Link>
                          <Link
                            to={`/trabajos/${item.id}`}
                            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          >
                            Ver detalle <ExternalLink size={15} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold text-slate-600">
                {state.page.total} {state.page.total === 1 ? 'ficha' : 'fichas'} · Página{' '}
                {Math.floor(state.page.offset / state.page.limit) + 1} de{' '}
                {Math.max(1, Math.ceil(state.page.total / state.page.limit))}
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
                  <ChevronLeft size={16} />
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
                  Siguiente <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
