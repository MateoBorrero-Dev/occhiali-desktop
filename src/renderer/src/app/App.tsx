import { useEffect, useState } from 'react';

type AppStatus = 'cargando' | 'lista' | 'error';

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<AppStatus>('cargando');
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    let active = true;

    window.optica
      .getAppInfo()
      .then((info) => {
        if (active) {
          setVersion(info.version);
          setStatus('lista');
        }
      })
      .catch(() => {
        if (active) {
          setStatus('error');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 sm:px-10 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl items-center">
        <section
          className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.35)]"
          aria-labelledby="page-title"
        >
          <div className="grid lg:grid-cols-[1.45fr_0.55fr]">
            <div className="px-8 py-12 sm:px-14 sm:py-16 lg:px-16 lg:py-20">
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-2xl font-semibold text-white shadow-sm">
                Ó
              </div>
              <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-teal-700 uppercase">
                Aplicación de escritorio
              </p>
              <h1
                id="page-title"
                className="max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl"
              >
                Sistema de Gestión Óptica
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Gestión de clientes, recetas e historiales ópticos.
              </p>
              <div
                className="mt-10 flex flex-wrap gap-3"
                aria-label="Características de la aplicación"
              >
                <span className="status-pill">100% local</span>
                <span className="status-pill">Uso simple y seguro</span>
                <span className="status-pill">Preparada para crecer</span>
              </div>
            </div>

            <aside className="flex min-h-64 flex-col justify-between bg-teal-950 px-8 py-10 text-teal-50 sm:px-12 lg:min-h-full">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-teal-300 uppercase">
                  Estado del sistema
                </p>
                <p className="mt-4 text-2xl leading-snug font-medium">
                  {status === 'lista' && 'Entorno de escritorio listo.'}
                  {status === 'cargando' && 'Iniciando entorno seguro…'}
                  {status === 'error' && 'No se pudo comprobar el entorno.'}
                </p>
              </div>
              <div className="mt-12 border-t border-teal-800 pt-5 text-sm text-teal-300">
                <p>Fase 1 · Base de la aplicación</p>
                {version && <p className="mt-1">Versión {version}</p>}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
