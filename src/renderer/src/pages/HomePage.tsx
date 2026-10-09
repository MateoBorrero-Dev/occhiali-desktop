import {
  BriefcaseBusiness,
  FilePlus2,
  FileText,
  RefreshCw,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardSummary } from '../../../shared/database-models';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapQueryResult } from '../lib/query-api';
import type { LucideIcon } from 'lucide-react';

type DashboardState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; summary: DashboardSummary };

interface Metric {
  label: string;
  value: number;
  icon: LucideIcon;
  path: string;
}

const quickActions = [
  { label: 'Nuevo cliente', path: '/clientes/nuevo', icon: UserPlus },
  { label: 'Buscar cliente', path: '/clientes', icon: Search },
  { label: 'Nueva receta', path: '/recetas/nueva', icon: FilePlus2 },
  { label: 'Nueva ficha óptica', path: '/trabajos/nuevo', icon: BriefcaseBusiness },
] as const;

export function HomePage(): React.JSX.Element {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<DashboardState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void window.optica.dashboard
      .getSummary()
      .then(unwrapQueryResult)
      .then((summary) => {
        if (active) setState({ status: 'ready', summary });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const metrics: Metric[] =
    state.status === 'ready'
      ? [
          {
            label: 'Clientes activos',
            value: state.summary.activeClients,
            icon: Users,
            path: '/clientes',
          },
          {
            label: 'Recetas registradas',
            value: state.summary.totalPrescriptions,
            icon: FileText,
            path: '/recetas',
          },
          {
            label: 'Fichas ópticas',
            value: state.summary.totalOpticalJobs,
            icon: BriefcaseBusiness,
            path: '/trabajos',
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inicio"
        title="Resumen de Occhiali"
        description="Accedé rápidamente a la información cotidiana de la óptica."
      />

      <section aria-labelledby="activity-title">
        <h2 id="activity-title" className="text-base font-bold text-slate-900">
          Actividad registrada
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Indicadores calculados directamente desde la base local.
        </p>
        {state.status === 'loading' && (
          <Card
            className="mt-3 py-16 text-center text-sm font-semibold text-slate-600"
            role="status"
          >
            Cargando indicadores…
          </Card>
        )}
        {state.status === 'error' && (
          <Card className="mt-3 py-12 text-center" role="alert">
            <p className="text-sm font-semibold text-red-800">
              No se pudieron consultar los indicadores locales.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => {
                setState({ status: 'loading' });
                setReloadToken((value) => value + 1);
              }}
            >
              <RefreshCw size={16} aria-hidden="true" /> Reintentar
            </Button>
          </Card>
        )}
        {state.status === 'ready' && (
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {metrics.map((metric) => (
              <Link
                key={metric.label}
                to={metric.path}
                className="group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <Card className="flex min-h-36 items-center gap-4 p-5 transition group-hover:border-teal-300 group-hover:shadow-sm">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <metric.icon size={22} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span>
                    <strong className="block text-3xl font-bold tracking-tight text-slate-950">
                      {metric.value}
                    </strong>
                    <span className="mt-1 block text-sm font-semibold text-slate-600">
                      {metric.label}
                    </span>
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="text-base font-bold text-slate-900">
          Accesos rápidos
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Iniciá las tareas más frecuentes sin recorrer otros menús.
        </p>
        <Card className="mt-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action, index) => (
              <Link
                key={action.path + action.label}
                to={action.path}
                className={buttonStyles({
                  variant: index === 0 ? 'primary' : 'secondary',
                  className: 'justify-start',
                })}
              >
                <action.icon size={17} aria-hidden="true" /> {action.label}
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Las recetas y fichas históricas permanecen contabilizadas aunque su cliente esté archivado.
        No se muestran datos de ventas, caja ni ingresos.
      </p>
    </div>
  );
}
