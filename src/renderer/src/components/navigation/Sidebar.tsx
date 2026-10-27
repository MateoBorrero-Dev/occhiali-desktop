import { Files, House, Settings, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { RECIPES_AND_JOBS_PATH } from '../../app/routes';
import occhialiGlassesWhite from '../../../../../resources/branding/occhiali-anteojos-blanco-transparente.png';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
  activePrefixes?: readonly string[];
}

type SystemStatus = { state: 'loading' } | { state: 'ready'; version: string } | { state: 'error' };

const navigationItems: readonly NavigationItem[] = [
  { label: 'Inicio', path: '/', icon: House, end: true },
  { label: 'Clientes', path: '/clientes', icon: Users },
  {
    label: 'Recetas y trabajos',
    path: RECIPES_AND_JOBS_PATH,
    icon: Files,
    activePrefixes: ['/recetas', '/trabajos'],
  },
  { label: 'Configuración', path: '/configuracion', icon: Settings },
];

function navigationClassName(isActive: boolean): string {
  const base =
    'group flex min-h-12 items-center justify-center gap-3 rounded-lg px-3 text-base font-semibold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-300 lg:justify-start';
  return isActive
    ? `${base} bg-white/12 text-white shadow-[inset_3px_0_0_#5eead4]`
    : `${base} text-slate-300 hover:bg-white/7 hover:text-white`;
}

export function Sidebar(): React.JSX.Element {
  const location = useLocation();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ state: 'loading' });

  useEffect(() => {
    let active = true;

    window.optica
      .getAppInfo()
      .then((appInfo) => {
        if (active) {
          setSystemStatus({ state: 'ready', version: appInfo.version });
        }
      })
      .catch(() => {
        if (active) {
          setSystemStatus({ state: 'error' });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <aside className="flex h-screen w-20 shrink-0 flex-col overflow-hidden bg-slate-950 text-white lg:w-64">
      <div className="flex min-h-24 items-center justify-center gap-3 border-b border-white/8 px-3 lg:justify-start lg:px-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-600 shadow-sm">
          <img
            src={occhialiGlassesWhite}
            alt=""
            className="h-7 w-10 object-contain"
            aria-hidden="true"
          />
        </div>
        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="truncate text-lg font-bold tracking-[0.08em]">OCCHIALI</p>
          <p className="whitespace-normal text-xs leading-5 text-slate-300">
            Sistema de Gestión Óptica
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5" aria-label="Navegación principal">
        <p className="sr-only mb-2 px-3 text-xs font-bold tracking-[0.14em] text-slate-400 uppercase lg:not-sr-only">
          Menú principal
        </p>
        <ul className="space-y-1">
          {navigationItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  navigationClassName(
                    isActive ||
                      Boolean(
                        item.activePrefixes?.some(
                          (prefix) =>
                            location.pathname === prefix ||
                            location.pathname.startsWith(`${prefix}/`),
                        ),
                      ),
                  )
                }
              >
                <item.icon size={22} strokeWidth={1.9} aria-hidden="true" />
                <span className="sr-only lg:not-sr-only">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-white/8 px-3 py-4 lg:px-5" aria-live="polite">
        {systemStatus.state === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-300 lg:justify-start">
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Comprobando entorno…</span>
          </div>
        )}
        {systemStatus.state === 'ready' && (
          <div className="flex items-start justify-center gap-2.5 lg:justify-start">
            <span className="mt-1 h-2 w-2 rounded-full bg-teal-400" aria-hidden="true" />
            <div className="sr-only lg:not-sr-only">
              <p className="text-xs font-semibold text-slate-300">Sistema local listo</p>
              <p className="mt-0.5 text-xs text-slate-500">Versión {systemStatus.version}</p>
            </div>
          </div>
        )}
        {systemStatus.state === 'error' && (
          <div className="flex items-center justify-center gap-2 text-xs text-amber-300 lg:justify-start">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Estado no disponible</span>
          </div>
        )}
      </div>
    </aside>
  );
}
