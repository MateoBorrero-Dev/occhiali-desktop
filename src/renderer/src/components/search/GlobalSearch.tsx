import { BriefcaseBusiness, FileText, Search, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GlobalSearchResults } from '../../../../shared/database-models';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatPrescriptionDate } from '../../lib/prescription-api';
import { unwrapQueryResult } from '../../lib/query-api';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; results: GlobalSearchResults };

function hasResults(results: GlobalSearchResults): boolean {
  return results.clients.length + results.prescriptions.length + results.opticalJobs.length > 0;
}

export function GlobalSearch(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const debouncedQuery = useDebouncedValue(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key.toLocaleLowerCase('es-AR') === 'k') {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (event.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const normalized = debouncedQuery.trim();
    if (normalized.length < 2) {
      sequence.current += 1;
      return;
    }
    const request = ++sequence.current;
    void window.optica.search
      .global({ query: normalized, limit: 5 })
      .then(unwrapQueryResult)
      .then((results) => {
        if (sequence.current === request) setState({ status: 'ready', results });
      })
      .catch(() => {
        if (sequence.current === request) setState({ status: 'error' });
      });
  }, [debouncedQuery]);

  const close = (): void => setOpen(false);
  const clear = (): void => {
    setQuery('');
    setState({ status: 'idle' });
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full max-w-3xl" role="search" aria-label="Búsqueda global">
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        maxLength={100}
        placeholder="Buscar clientes, recetas o fichas"
        aria-label="Buscar en Occhiali"
        aria-expanded={open && query.trim().length >= 2}
        aria-controls="global-search-results"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setState(nextQuery.trim().length < 2 ? { status: 'idle' } : { status: 'loading' });
          setOpen(true);
        }}
        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pr-24 pl-10 text-sm shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      {query ? (
        <button
          type="button"
          onClick={clear}
          className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
          aria-label="Limpiar búsqueda global"
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[0.65rem] font-bold text-slate-500">
          Ctrl K
        </kbd>
      )}

      {open && query.trim().length >= 2 && (
        <div
          id="global-search-results"
          className="absolute top-full right-0 left-0 z-40 mt-2 max-h-[min(65vh,520px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          aria-live="polite"
        >
          {state.status === 'loading' && (
            <p className="px-4 py-8 text-center text-sm font-semibold text-slate-600" role="status">
              Buscando…
            </p>
          )}
          {state.status === 'error' && (
            <p className="px-4 py-8 text-center text-sm font-semibold text-red-800" role="alert">
              No se pudo completar la búsqueda. Volvé a intentarlo.
            </p>
          )}
          {state.status === 'ready' && !hasResults(state.results) && (
            <p className="px-4 py-8 text-center text-sm text-slate-600">
              No encontramos resultados para “{debouncedQuery}”.
            </p>
          )}
          {state.status === 'ready' && hasResults(state.results) && (
            <div className="space-y-3">
              {state.results.clients.length > 0 && (
                <section aria-labelledby="global-clients">
                  <h2
                    id="global-clients"
                    className="px-3 py-1 text-xs font-bold text-slate-500 uppercase"
                  >
                    Clientes
                  </h2>
                  {state.results.clients.map((client) => (
                    <Link
                      key={client.id}
                      to={`/clientes/${client.id}`}
                      onClick={close}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700"
                    >
                      <UserRound
                        className="mt-0.5 shrink-0 text-teal-700"
                        size={17}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-bold text-slate-900">
                          {client.lastName}, {client.firstName}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {client.documentNumber
                            ? `DNI ${client.documentNumber}`
                            : (client.phone ?? 'Sin DNI ni teléfono')}
                          {client.isArchived ? ' · Archivado' : ''}
                        </span>
                      </span>
                    </Link>
                  ))}
                </section>
              )}
              {state.results.prescriptions.length > 0 && (
                <section aria-labelledby="global-prescriptions">
                  <h2
                    id="global-prescriptions"
                    className="px-3 py-1 text-xs font-bold text-slate-500 uppercase"
                  >
                    Recetas
                  </h2>
                  {state.results.prescriptions.map((item) => (
                    <Link
                      key={item.id}
                      to={`/recetas/${item.id}`}
                      onClick={close}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700"
                    >
                      <FileText
                        className="mt-0.5 shrink-0 text-teal-700"
                        size={17}
                        aria-hidden="true"
                      />
                      <span className="text-sm">
                        <span className="block font-bold text-slate-900">
                          Receta del {formatPrescriptionDate(item.prescriptionDate)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {item.clientLastName}, {item.clientFirstName}
                        </span>
                      </span>
                    </Link>
                  ))}
                </section>
              )}
              {state.results.opticalJobs.length > 0 && (
                <section aria-labelledby="global-jobs">
                  <h2
                    id="global-jobs"
                    className="px-3 py-1 text-xs font-bold text-slate-500 uppercase"
                  >
                    Fichas
                  </h2>
                  {state.results.opticalJobs.map((item) => (
                    <Link
                      key={item.id}
                      to={`/trabajos/${item.id}`}
                      onClick={close}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700"
                    >
                      <BriefcaseBusiness
                        className="mt-0.5 shrink-0 text-teal-700"
                        size={17}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block truncate font-bold text-slate-900">
                          {item.jobNumber
                            ? `Ficha ${item.jobNumber}`
                            : (item.product ?? `Ficha #${item.id}`)}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {item.clientLastName}, {item.clientFirstName}
                          {item.product ? ` · ${item.product}` : ''}
                        </span>
                      </span>
                    </Link>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
