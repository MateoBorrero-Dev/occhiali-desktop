import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PackageCheck,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type {
  DeliveryReceiptListPage,
  DeliveryReceiptStatus,
} from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  deliveryStatusLabel,
  formatDeliveryTimestamp,
  unwrapDeliveryReceiptResult,
} from '../lib/delivery-receipt-api';

const PAGE_SIZE = 25;
const MAX_SAFE_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE) + 1;

type ListState =
  | { status: 'loading' }
  | { status: 'error'; requestKey: string }
  | { status: 'ready'; requestKey: string; page: DeliveryReceiptListPage };

function statusClassName(status: DeliveryReceiptStatus): string {
  if (status === 'ANNULLED') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'CORRECTED') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-teal-200 bg-teal-50 text-teal-900';
}

function statusFromSearchParams(value: string | null): DeliveryReceiptStatus | '' {
  return value === 'CONFIRMED' || value === 'CORRECTED' || value === 'ANNULLED' ? value : '';
}

function dateFromSearchParams(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function pageFromSearchParams(value: string | null): { page: number; valid: boolean } {
  if (value === null) return { page: 1, valid: true };
  if (!/^[1-9]\d*$/.test(value)) return { page: 1, valid: false };
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_SAFE_PAGE
    ? { page, valid: true }
    : { page: 1, valid: false };
}

function createListSearchParams(
  query: string,
  status: DeliveryReceiptStatus | '',
  dateFrom: string,
  dateTo: string,
  page: number,
): URLSearchParams {
  const result = new URLSearchParams();
  if (query) result.set('q', query);
  if (status) result.set('status', status);
  if (dateFrom) result.set('from', dateFrom);
  if (dateTo) result.set('to', dateTo);
  if (page > 1) result.set('page', String(page));
  return result;
}

export function DeliveryReceiptsPage(): React.JSX.Element {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const status = statusFromSearchParams(searchParams.get('status'));
  const dateFrom = dateFromSearchParams(searchParams.get('from'));
  const dateTo = dateFromSearchParams(searchParams.get('to'));
  const parsedPage = pageFromSearchParams(searchParams.get('page'));
  const page = parsedPage.page;
  const offset = (page - 1) * PAGE_SIZE;
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const debouncedQuery = useDebouncedValue(query, 300);
  const querySettled = query === debouncedQuery;
  const sequence = useRef(0);
  const lastQuery = useRef(query);
  const requestKey = JSON.stringify([
    debouncedQuery,
    status,
    dateFrom,
    dateTo,
    page,
    parsedPage.valid,
    reloadToken,
  ]);
  const renderedState: ListState =
    !querySettled || (state.status !== 'loading' && state.requestKey !== requestKey)
      ? { status: 'loading' }
      : state;

  const updateFilter = (name: string, value: string): void => {
    if (name === 'q' && lastQuery.current !== value) {
      lastQuery.current = value;
      sequence.current += 1;
    }
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const updatePage = (nextPage: number): void => {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set('page', String(nextPage));
    else next.delete('page');
    setSearchParams(next);
  };

  useEffect(() => {
    if (lastQuery.current !== query) {
      lastQuery.current = query;
      sequence.current += 1;
    }
  }, [query]);

  useEffect(() => {
    if (parsedPage.valid) return;
    const next = new URLSearchParams(searchParams);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }, [parsedPage.valid, searchParams, setSearchParams]);

  useEffect(() => {
    const request = ++sequence.current;
    if (!parsedPage.valid || !querySettled) return;
    void window.optica.deliveryReceipts
      .list({
        query: debouncedQuery,
        status: status || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit: PAGE_SIZE,
        offset,
      })
      .then(unwrapDeliveryReceiptResult)
      .then((result) => {
        if (sequence.current !== request) return;
        const lastPage = Math.max(1, Math.ceil(result.total / result.limit));
        if (result.total > 0 && page > lastPage) {
          const next = createListSearchParams(debouncedQuery, status, dateFrom, dateTo, lastPage);
          setState({ status: 'loading' });
          setSearchParams(next, { replace: true });
          return;
        }
        setState({ status: 'ready', requestKey, page: result });
      })
      .catch(() => {
        if (sequence.current === request) setState({ status: 'error', requestKey });
      });
  }, [
    dateFrom,
    dateTo,
    debouncedQuery,
    offset,
    page,
    parsedPage.valid,
    querySettled,
    reloadToken,
    requestKey,
    setSearchParams,
    status,
  ]);

  const filtered = Boolean(query || status || dateFrom || dateTo);
  const resetFilters = (): void => {
    if (lastQuery.current) {
      lastQuery.current = '';
      sequence.current += 1;
    }
    setState({ status: 'loading' });
    setSearchParams({}, { replace: true });
  };
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <div>
      <PageHeader
        eyebrow="Historial de entregas"
        title="Retiros"
        description="Consultá comprobantes de entrega, sus aclaraciones y anulaciones sin alterar el registro original."
      />

      <Card className="mt-6 p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,1fr)_210px_180px_180px_auto] xl:items-end">
          <label className="text-sm font-semibold text-slate-800">
            Buscar retiros
            <div className="relative mt-1.5">
              <Search
                size={19}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                className="min-h-12 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-11 text-base outline-none focus:border-teal-700 focus:ring-3 focus:ring-teal-100"
                placeholder="Cliente, comprobante o ficha"
                value={query}
                onChange={(event) => {
                  setState({ status: 'loading' });
                  updateFilter('q', event.target.value);
                }}
              />
            </div>
          </label>

          <label className="text-sm font-semibold text-slate-800">
            Estado
            <select
              className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-3 focus:ring-teal-100"
              value={status}
              onChange={(event) => {
                setState({ status: 'loading' });
                updateFilter('status', event.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="CONFIRMED">Confirmados</option>
              <option value="CORRECTED">Con aclaraciones</option>
              <option value="ANNULLED">Anulados</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-800">
            Entrega desde
            <input
              type="date"
              className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-3 focus:ring-teal-100"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => {
                setState({ status: 'loading' });
                updateFilter('from', event.target.value);
              }}
            />
          </label>

          <label className="text-sm font-semibold text-slate-800">
            Entrega hasta
            <input
              type="date"
              className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-3 focus:ring-teal-100"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setState({ status: 'loading' });
                updateFilter('to', event.target.value);
              }}
            />
          </label>

          <Button variant="secondary" onClick={resetFilters} disabled={!filtered}>
            <CalendarRange size={18} aria-hidden="true" />
            Limpiar filtros
          </Button>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {renderedState.status === 'loading' && (
          <div className="py-24 text-center text-base font-semibold text-slate-600" role="status">
            Cargando retiros…
          </div>
        )}
        {renderedState.status === 'error' && (
          <div className="py-20 text-center" role="alert">
            <p className="text-base font-semibold text-red-800">
              No se pudo cargar el listado de retiros.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => {
                setState({ status: 'loading' });
                setReloadToken((value) => value + 1);
              }}
            >
              <RefreshCw size={18} aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        )}
        {renderedState.status === 'ready' && renderedState.page.items.length === 0 && (
          <EmptyState
            icon={filtered ? Search : PackageCheck}
            title={
              filtered
                ? 'No encontramos retiros con esos filtros.'
                : 'Todavía no hay retiros registrados.'
            }
            description={
              filtered
                ? 'Probá con otra búsqueda, estado o rango de fechas.'
                : 'Los comprobantes aparecerán aquí cuando registres una entrega desde una ficha.'
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={resetFilters}>
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        )}
        {renderedState.status === 'ready' && renderedState.page.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-base">
                <thead className="bg-slate-50 text-sm font-bold tracking-wide text-slate-700 uppercase">
                  <tr>
                    <th className="px-5 py-4">Comprobante</th>
                    <th className="px-4 py-4">Entrega</th>
                    <th className="px-4 py-4">Cliente</th>
                    <th className="px-4 py-4">Ficha</th>
                    <th className="px-4 py-4">Estado</th>
                    <th className="px-5 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {renderedState.page.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-bold text-slate-900">{item.receiptNumber}</td>
                      <td className="px-4 py-4 text-slate-700">
                        {formatDeliveryTimestamp(item.deliveredAt)}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-800">
                        {item.clientLastName}, {item.clientFirstName}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {item.jobNumber ?? `#${item.opticalJobId}`}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-bold ${statusClassName(item.status)}`}
                        >
                          {deliveryStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end">
                          <Link
                            to={{
                              pathname: `/retiros/${item.id}`,
                              search: `?returnTo=${encodeURIComponent(returnTo)}`,
                            }}
                            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          >
                            Ver detalle <ExternalLink size={17} aria-hidden="true" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-sm font-semibold text-slate-600">
                {renderedState.page.total} {renderedState.page.total === 1 ? 'retiro' : 'retiros'} ·
                Página {Math.floor(renderedState.page.offset / renderedState.page.limit) + 1} de{' '}
                {Math.max(1, Math.ceil(renderedState.page.total / renderedState.page.limit))}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={offset === 0}
                  onClick={() => {
                    setState({ status: 'loading' });
                    updatePage(Math.max(1, page - 1));
                  }}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={offset + PAGE_SIZE >= renderedState.page.total}
                  onClick={() => {
                    setState({ status: 'loading' });
                    updatePage(page + 1);
                  }}
                >
                  Siguiente <ChevronRight size={18} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
