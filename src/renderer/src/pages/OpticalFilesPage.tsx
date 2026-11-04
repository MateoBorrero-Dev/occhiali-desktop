import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  Files,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { OpticalFileListPage, OpticalFileSummary } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { unwrapOpticalJobResult } from '../lib/optical-job-api';
import { formatPrescriptionDate } from '../lib/prescription-api';

const PAGE_SIZE = 25;
const MAX_SAFE_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE) + 1;
type ListState =
  | { status: 'loading' }
  | { status: 'error'; requestKey: string }
  | { status: 'ready'; requestKey: string; page: OpticalFileListPage };

function pageFromSearchParams(value: string | null): { page: number; valid: boolean } {
  if (value === null) return { page: 1, valid: true };
  if (!/^[1-9]\d*$/.test(value)) return { page: 1, valid: false };
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_SAFE_PAGE
    ? { page, valid: true }
    : { page: 1, valid: false };
}

function createListSearchParams(query: string, page: number): URLSearchParams {
  const result = new URLSearchParams();
  if (query) result.set('q', query);
  if (page > 1) result.set('page', String(page));
  return result;
}

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

export function OpticalFilesPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const parsedPage = pageFromSearchParams(searchParams.get('page'));
  const pageNumber = parsedPage.page;
  const offset = (pageNumber - 1) * PAGE_SIZE;
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const debouncedQuery = useDebouncedValue(query, 300);
  const querySettled = query === debouncedQuery;
  const sequence = useRef(0);
  const lastQuery = useRef(query);
  const requestKey = JSON.stringify([debouncedQuery, pageNumber, parsedPage.valid, reloadToken]);
  const renderedState: ListState =
    !querySettled || (state.status !== 'loading' && state.requestKey !== requestKey)
      ? { status: 'loading' }
      : state;

  const updateQuery = (value: string): void => {
    if (lastQuery.current !== value) {
      lastQuery.current = value;
      sequence.current += 1;
    }
    setState({ status: 'loading' });
    setSearchParams(createListSearchParams(value, 1), { replace: true });
  };

  const updatePage = (nextPage: number): void => {
    setState({ status: 'loading' });
    setSearchParams(createListSearchParams(query, nextPage));
  };

  useEffect(() => {
    if (lastQuery.current !== query) {
      lastQuery.current = query;
      sequence.current += 1;
    }
  }, [query]);

  useEffect(() => {
    if (parsedPage.valid) return;
    setSearchParams(createListSearchParams(query, 1), { replace: true });
  }, [parsedPage.valid, query, setSearchParams]);

  useEffect(() => {
    const request = ++sequence.current;
    if (!parsedPage.valid || !querySettled) return;
    void window.optica.opticalJobs
      .listFiles({ query: debouncedQuery, limit: PAGE_SIZE, offset })
      .then(unwrapOpticalJobResult)
      .then((page) => {
        if (sequence.current !== request) return;
        const lastPage = Math.max(1, Math.ceil(page.total / page.limit));
        if (pageNumber > lastPage) {
          setState({ status: 'loading' });
          setSearchParams(createListSearchParams(debouncedQuery, lastPage), { replace: true });
          return;
        }
        setState({ status: 'ready', requestKey, page });
      })
      .catch(() => {
        if (sequence.current === request) setState({ status: 'error', requestKey });
      });
  }, [
    debouncedQuery,
    offset,
    pageNumber,
    parsedPage.valid,
    querySettled,
    reloadToken,
    requestKey,
    setSearchParams,
  ]);

  const clearSearch = (): void => {
    updateQuery('');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Historial óptico y gestión comercial"
        title="Fichas ópticas"
        description="Consultá graduaciones, productos, armazones y retiros desde un único listado."
        action={
          <Link to="/fichas/nueva" className={buttonStyles()}>
            <FilePlus2 size={19} aria-hidden="true" /> Nueva ficha
          </Link>
        }
      />

      <Card className="mt-6 p-4">
        <label className="text-base font-semibold text-slate-800">
          Buscar fichas
          <div className="relative mt-2 max-w-3xl">
            <Search
              size={20}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pr-12 pl-12 text-base outline-none focus-visible:border-teal-700 focus-visible:ring-3 focus-visible:ring-teal-100"
              placeholder="Número de ficha, cliente o producto"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-teal-700"
                aria-label="Limpiar búsqueda"
              >
                <X size={19} aria-hidden="true" />
              </button>
            )}
          </div>
        </label>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {renderedState.status === 'loading' && (
          <div className="py-24 text-center text-base font-semibold text-slate-600" role="status">
            Cargando fichas ópticas…
          </div>
        )}
        {renderedState.status === 'error' && (
          <div className="py-20 text-center" role="alert">
            <p className="text-base font-semibold text-red-800">
              No se pudo cargar el listado de fichas ópticas.
            </p>
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
        {renderedState.status === 'ready' && renderedState.page.items.length === 0 && (
          <EmptyState
            icon={debouncedQuery ? Search : Files}
            title={
              debouncedQuery
                ? 'No encontramos fichas con esa búsqueda.'
                : 'Todavía no hay fichas ópticas.'
            }
            description={
              debouncedQuery
                ? 'Probá con otro número, cliente o producto.'
                : 'Registrá la primera ficha con sus datos ópticos y comerciales.'
            }
            action={
              debouncedQuery ? (
                <Button variant="secondary" onClick={clearSearch}>
                  Limpiar búsqueda
                </Button>
              ) : (
                <Link to="/fichas/nueva" className={buttonStyles()}>
                  <FilePlus2 size={19} aria-hidden="true" /> Nueva ficha
                </Link>
              )
            }
          />
        )}
        {renderedState.status === 'ready' && renderedState.page.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-base">
                <thead className="bg-slate-50 text-sm font-bold tracking-wide text-slate-700 uppercase">
                  <tr>
                    <th className="px-5 py-4">Número</th>
                    <th className="px-4 py-4">Cliente</th>
                    <th className="px-4 py-4">Fecha</th>
                    <th className="px-4 py-4">Producto</th>
                    <th className="px-4 py-4">Información</th>
                    <th className="px-5 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {renderedState.page.items.map((item) => (
                    <tr key={`${item.kind}:${item.recordId}`} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4 font-bold text-slate-950">
                        {item.jobNumber ?? (item.kind === 'JOB' ? `#${item.jobId}` : 'Histórica')}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-800">
                        {item.clientLastName}, {item.clientFirstName}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {formatPrescriptionDate(item.fileDate)}
                      </td>
                      <td className="px-4 py-4 text-slate-700">{item.product ?? '—'}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex min-h-8 items-center rounded-full border border-teal-200 bg-teal-50 px-3 text-sm font-bold text-teal-900">
                          {historyLabel(item)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/clientes/${item.clientId}`}
                            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          >
                            <UserRound size={17} aria-hidden="true" /> Cliente
                          </Link>
                          <Link
                            to={detailPath(item)}
                            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                          >
                            Ver ficha <ExternalLink size={17} aria-hidden="true" />
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
                {renderedState.page.total} {renderedState.page.total === 1 ? 'ficha' : 'fichas'} ·
                Página {Math.floor(renderedState.page.offset / renderedState.page.limit) + 1} de{' '}
                {Math.max(1, Math.ceil(renderedState.page.total / renderedState.page.limit))}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pageNumber === 1}
                  onClick={() => updatePage(Math.max(1, pageNumber - 1))}
                >
                  <ChevronLeft size={18} aria-hidden="true" /> Anterior
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={offset + PAGE_SIZE >= renderedState.page.total}
                  onClick={() => updatePage(pageNumber + 1)}
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
