import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClientListPage, ClientStatusFilter } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { ClientStatusBadge } from '../components/clients/ClientStatusBadge';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatTimestamp, unwrapClientResult } from '../lib/client-api';

const PAGE_SIZE = 25;

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: ClientListPage };

const filterLabels: Record<ClientStatusFilter, string> = {
  active: 'Activos',
  archived: 'Archivados',
  all: 'Todos',
};

export function ClientsPage(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClientStatusFilter>('active');
  const [offset, setOffset] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const debouncedQuery = useDebouncedValue(query, 300);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    void window.optica.clients
      .list({ query: debouncedQuery, status: filter, limit: PAGE_SIZE, offset })
      .then(unwrapClientResult)
      .then((page) => {
        if (requestSequence.current === sequence) setState({ status: 'ready', page });
      })
      .catch(() => {
        if (requestSequence.current === sequence) {
          setState({
            status: 'error',
            message: 'No se pudo cargar el listado de clientes. Volvé a intentarlo.',
          });
        }
      });
  }, [debouncedQuery, filter, offset, reloadToken]);

  const changeFilter = (next: ClientStatusFilter): void => {
    setState({ status: 'loading' });
    setFilter(next);
    setOffset(0);
  };

  const clearSearch = (): void => {
    setState({ status: 'loading' });
    setQuery('');
    setOffset(0);
  };

  const page = state.status === 'ready' ? state.page : null;
  const currentPage = page ? Math.floor(page.offset / page.limit) + 1 : 1;
  const totalPages = page ? Math.max(1, Math.ceil(page.total / page.limit)) : 1;

  return (
    <div>
      <PageHeader
        eyebrow="Gestión de clientes"
        title="Clientes"
        description="Registrá, buscá y consultá la información de las personas atendidas en la óptica."
        action={
          <Link to="/clientes/nuevo" className={buttonStyles()}>
            <UserPlus size={17} aria-hidden="true" />
            Nuevo cliente
          </Link>
        }
      />

      <Card className="mt-6 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <label className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
            Buscar clientes
            <div className="relative mt-1.5 max-w-2xl">
              <Search
                size={18}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setState({ status: 'loading' });
                  setQuery(event.target.value);
                  setOffset(0);
                }}
                placeholder="Nombre, apellido, DNI o teléfono"
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pr-10 pl-10 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-slate-800">Estado</legend>
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
              {(Object.keys(filterLabels) as ClientStatusFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => changeFilter(value)}
                  className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-teal-700 ${
                    filter === value
                      ? 'bg-white text-teal-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {filterLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {state.status === 'loading' && (
          <div className="flex min-h-72 items-center justify-center" role="status">
            <div className="text-center">
              <span
                className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-teal-700 border-t-transparent"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-semibold text-slate-600">Cargando clientes…</p>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div
            className="flex min-h-72 flex-col items-center justify-center px-6 text-center"
            role="alert"
          >
            <p className="text-sm font-semibold text-red-800">{state.message}</p>
            <Button
              className="mt-5"
              variant="secondary"
              onClick={() => {
                setState({ status: 'loading' });
                setReloadToken((v) => v + 1);
              }}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        )}

        {state.status === 'ready' &&
          state.page.items.length === 0 &&
          !debouncedQuery &&
          filter === 'active' && (
            <EmptyState
              icon={Users}
              title="Todavía no hay clientes registrados."
              description="Registrá el primer cliente para comenzar a construir su historial en Occhiali."
              action={
                <Link to="/clientes/nuevo" className={buttonStyles()}>
                  <UserPlus size={17} aria-hidden="true" />
                  Registrar primer cliente
                </Link>
              }
            />
          )}

        {state.status === 'ready' &&
          state.page.items.length === 0 &&
          (debouncedQuery || filter !== 'active') && (
            <EmptyState
              icon={Search}
              title={
                debouncedQuery
                  ? 'No encontramos clientes con esa búsqueda.'
                  : `No hay clientes ${filterLabels[filter].toLowerCase()}.`
              }
              description="Probá con otro término o cambiá el filtro de estado."
              action={
                debouncedQuery ? (
                  <Button variant="secondary" onClick={clearSearch}>
                    Limpiar búsqueda
                  </Button>
                ) : undefined
              }
            />
          )}

        {state.status === 'ready' && state.page.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold tracking-wide text-slate-600 uppercase">
                  <tr>
                    <th className="px-5 py-3">Nombre y apellido</th>
                    <th className="px-4 py-3">DNI</th>
                    <th className="px-4 py-3">Teléfono</th>
                    <th className="px-4 py-3">Registro</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.page.items.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-semibold text-slate-950">
                        {client.lastName}, {client.firstName}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{client.documentNumber ?? '—'}</td>
                      <td className="px-4 py-4 text-slate-600">{client.phone ?? '—'}</td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatTimestamp(client.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <ClientStatusBadge archived={client.isArchived} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          to={`/clientes/${client.id}`}
                          className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          aria-label={`Abrir ficha de ${client.firstName} ${client.lastName}`}
                        >
                          Ver ficha <ExternalLink size={15} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold text-slate-600">
                {state.page.total} {state.page.total === 1 ? 'cliente' : 'clientes'} · Página{' '}
                {currentPage} de {totalPages}
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
                  <ChevronLeft size={16} aria-hidden="true" /> Anterior
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
    </div>
  );
}
