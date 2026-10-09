import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FileText,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PrescriptionListPage } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  formatPrescriptionDate,
  formatPrescriptionTimestamp,
  unwrapPrescriptionResult,
} from '../lib/prescription-api';

const PAGE_SIZE = 25;
type ListState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; page: PrescriptionListPage };

export function PrescriptionsPage(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const debouncedQuery = useDebouncedValue(query, 300);
  const sequence = useRef(0);

  useEffect(() => {
    const request = ++sequence.current;
    void window.optica.prescriptions
      .list({
        query: debouncedQuery,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit: PAGE_SIZE,
        offset,
      })
      .then(unwrapPrescriptionResult)
      .then((page) => {
        if (sequence.current === request) setState({ status: 'ready', page });
      })
      .catch(() => {
        if (sequence.current === request) setState({ status: 'error' });
      });
  }, [dateFrom, dateTo, debouncedQuery, offset, reloadToken]);

  const filtered = Boolean(debouncedQuery || dateFrom || dateTo);
  const resetFilters = (): void => {
    setState({ status: 'loading' });
    setQuery('');
    setDateFrom('');
    setDateTo('');
    setOffset(0);
  };
  return (
    <div>
      <PageHeader
        eyebrow="Historial óptico"
        title="Recetas"
        description="Consultá prescripciones, graduaciones y correcciones preservadas en SQLite."
        action={
          <Link to="/recetas/nueva" className={buttonStyles()}>
            <FilePlus2 size={17} aria-hidden="true" />
            Nueva receta
          </Link>
        }
      />
      <Card className="mt-6 p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,1fr)_180px_180px_auto] xl:items-end">
          <label className="text-sm font-semibold text-slate-800">
            Buscar por cliente
            <div className="relative mt-1.5">
              <Search
                size={17}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-10 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                placeholder="Nombre o apellido"
                value={query}
                onChange={(event) => {
                  setState({ status: 'loading' });
                  setQuery(event.target.value);
                  setOffset(0);
                }}
              />
            </div>
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Desde
            <input
              type="date"
              className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => {
                setState({ status: 'loading' });
                setDateFrom(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Hasta
            <input
              type="date"
              className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setState({ status: 'loading' });
                setDateTo(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <Button variant="secondary" onClick={resetFilters} disabled={!filtered}>
            <CalendarRange size={16} aria-hidden="true" />
            Limpiar filtros
          </Button>
        </div>
      </Card>
      <Card className="mt-4 overflow-hidden">
        {state.status === 'loading' && (
          <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
            Cargando recetas…
          </div>
        )}
        {state.status === 'error' && (
          <div className="py-20 text-center" role="alert">
            <p className="text-sm font-semibold text-red-800">
              No se pudo cargar el listado de recetas.
            </p>
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
            icon={filtered ? Search : FileText}
            title={
              filtered
                ? 'No encontramos recetas con esos filtros.'
                : 'Todavía no hay recetas registradas.'
            }
            description={
              filtered
                ? 'Probá con otro cliente o rango de fechas.'
                : 'Registrá la primera receta desde este módulo o desde la ficha de un cliente.'
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={resetFilters}>
                  Limpiar filtros
                </Button>
              ) : (
                <Link to="/recetas/nueva" className={buttonStyles()}>
                  <FilePlus2 size={17} aria-hidden="true" />
                  Registrar receta
                </Link>
              )
            }
          />
        )}
        {state.status === 'ready' && state.page.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold tracking-wide text-slate-600 uppercase">
                  <tr>
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-4 py-3">Fecha de receta</th>
                    <th className="px-4 py-3">Profesional</th>
                    <th className="px-4 py-3">Registro</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.page.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-semibold">
                        {item.clientLastName}, {item.clientFirstName}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {formatPrescriptionDate(item.prescriptionDate)}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {item.prescriberName ?? 'No informado'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatPrescriptionTimestamp(item.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/clientes/${item.clientId}`}
                            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          >
                            <UserRound size={15} aria-hidden="true" />
                            Cliente
                          </Link>
                          <Link
                            to={`/recetas/${item.id}`}
                            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          >
                            Ver detalle <ExternalLink size={15} aria-hidden="true" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold text-slate-600">
                {state.page.total} {state.page.total === 1 ? 'receta' : 'recetas'} · Página{' '}
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
    </div>
  );
}
