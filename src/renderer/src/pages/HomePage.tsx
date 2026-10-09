import {
  ArrowRight,
  BriefcaseBusiness,
  Database,
  FileText,
  History,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import type { LucideIcon } from 'lucide-react';

interface QuickAccessItem {
  title: string;
  description: string;
  action: string;
  path: string;
  icon: LucideIcon;
}

const quickAccessItems: readonly QuickAccessItem[] = [
  {
    title: 'Clientes',
    description: 'El espacio para organizar los datos básicos de cada persona.',
    action: 'Ir a clientes',
    path: '/clientes',
    icon: Users,
  },
  {
    title: 'Recetas',
    description: 'Preparado para consultar graduaciones e historiales ópticos.',
    action: 'Ir a recetas',
    path: '/recetas',
    icon: FileText,
  },
  {
    title: 'Trabajos',
    description: 'El futuro registro de productos, armazones y tratamientos.',
    action: 'Ir a trabajos',
    path: '/trabajos',
    icon: BriefcaseBusiness,
  },
];

const foundationItems = [
  {
    label: 'Información local',
    detail: 'Los datos permanecen en esta computadora.',
    icon: Database,
  },
  {
    label: 'Historial preservado',
    detail: 'La base está preparada para conservar cada ficha.',
    icon: History,
  },
  {
    label: 'Entorno protegido',
    detail: 'La interfaz funciona sin acceso directo al sistema.',
    icon: ShieldCheck,
  },
] as const;

export function HomePage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inicio"
        title="Bienvenida a Occhiali"
        description="Un espacio simple y ordenado para gestionar la información cotidiana de la óptica."
      />

      <Card variant="brand" className="overflow-hidden">
        <div className="grid min-h-40 gap-8 px-6 py-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-teal-300 uppercase">
              Base de trabajo
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight">Todo listo para empezar</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              La navegación y la base local están preparadas. Los módulos funcionales se
              incorporarán de forma gradual en las próximas etapas.
            </p>
          </div>
          <div className="hidden h-20 w-20 items-center justify-center rounded-2xl border border-teal-700/70 bg-teal-900/60 text-teal-300 lg:flex">
            <ShieldCheck size={36} strokeWidth={1.5} aria-hidden="true" />
          </div>
        </div>
      </Card>

      <section aria-labelledby="quick-access-title">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="quick-access-title" className="text-base font-bold text-slate-900">
              Accesos rápidos
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Ingresá directamente a cada sección principal.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {quickAccessItems.map((item) => (
            <Card key={item.path} className="flex min-h-52 flex-col p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <item.icon size={21} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{item.description}</p>
              <Link
                to={item.path}
                className={buttonStyles({
                  variant: 'secondary',
                  size: 'sm',
                  className: 'mt-5 self-start',
                })}
              >
                {item.action}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <Card className="p-5">
        <div className="grid gap-5 lg:grid-cols-3">
          {foundationItems.map((item) => (
            <div
              key={item.label}
              className="flex gap-3 lg:border-r lg:border-slate-200 lg:pr-5 lg:last:border-r-0"
            >
              <item.icon
                className="mt-0.5 shrink-0 text-teal-700"
                size={19}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <div>
                <h3 className="text-sm font-bold text-slate-900">{item.label}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-xs leading-5 text-slate-500">
        Los indicadores de actividad aparecerán cuando los módulos de gestión estén disponibles. No
        se muestran cifras hasta contar con datos reales.
      </p>
    </div>
  );
}
