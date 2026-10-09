import { BriefcaseBusiness, FileText, Glasses, House, Settings, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
}

type SystemStatus = { state: 'loading' } | { state: 'ready'; version: string } | { state: 'error' };

const navigationItems: readonly NavigationItem[] = [
  { label: 'Inicio', path: '/', icon: House, end: true },
  { label: 'Clientes', path: '/clientes', icon: Users },
  { label: 'Recetas', path: '/recetas', icon: FileText },
  { label: 'Trabajos', path: '/trabajos', icon: BriefcaseBusiness },
  { label: 'Configuración', path: '/configuracion', icon: Settings },
];

function navigationClassName(isActive: boolean): string {
  const base =
    'group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300';
  return isActive
    ? `${base} bg-white/12 text-white shadow-[inset_3px_0_0_#5eead4]`
    : `${base} text-slate-300 hover:bg-white/7 hover:text-white`;
}

export function Sidebar(): React.JSX.Element {
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
    <aside className="flex h-screen w-56 shrink-0 flex-col overflow-hidden bg-slate-950 text-white lg:w-60">
      <div className="flex min-h-20 items-center gap-3 border-b border-white/8 px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
          <Glasses size={23} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-[0.08em]">OCCHIALI</p>
          <p className="truncate text-xs text-slate-400">Sistema de Gestión Óptica</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5" aria-label="Navegación principal">
        <p className="mb-2 px-3 text-[0.68rem] font-bold tracking-[0.14em] text-slate-500 uppercase">
          Menú principal
        </p>
        <ul className="space-y-1">
          {navigationItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.end}
                className={({ isActive }) => navigationClassName(isActive)}
              >
                <item.icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-white/8 px-5 py-4" aria-live="polite">
        {systemStatus.state === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" aria-hidden="true" />
            Comprobando entorno…
          </div>
        )}
        {systemStatus.state === 'ready' && (
          <div className="flex items-start gap-2.5">
            <span className="mt-1 h-2 w-2 rounded-full bg-teal-400" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-slate-300">Sistema local listo</p>
              <p className="mt-0.5 text-xs text-slate-500">Versión {systemStatus.version}</p>
            </div>
          </div>
        )}
        {systemStatus.state === 'error' && (
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            Estado no disponible
          </div>
        )}
      </div>
    </aside>
  );
}
