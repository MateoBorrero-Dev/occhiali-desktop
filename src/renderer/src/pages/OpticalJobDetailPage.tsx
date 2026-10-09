import { ArrowLeft, FileQuestion, FileText, Pencil, RefreshCw, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Client, OpticalJob } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapClientResult } from '../lib/client-api';
import {
  colorTypeLabel,
  formatJobTimestamp,
  frameConditionLabel,
  frameMaterialLabel,
  OpticalJobRequestError,
  unwrapOpticalJobResult,
} from '../lib/optical-job-api';

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; job: OpticalJob; client: Client };
function Detail({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function OpticalJobDetailPage(): React.JSX.Element {
  const { id } = useParams();
  const location = useLocation();
  const jobId = Number(id);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  const message =
    typeof (location.state as { message?: unknown } | null)?.message === 'string'
      ? (location.state as { message: string }).message
      : null;
  useEffect(() => {
    let active = true;
    void window.optica.opticalJobs
      .get(jobId)
      .then(unwrapOpticalJobResult)
      .then(async (job) => ({
        job,
        client: unwrapClientResult(await window.optica.clients.get(job.clientId)),
      }))
      .then((data) => {
        if (active) setState({ status: 'ready', ...data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(
          error instanceof OpticalJobRequestError && error.detail.code === 'NOT_FOUND'
            ? { status: 'not-found' }
            : { status: 'error' },
        );
      });
    return () => {
      active = false;
    };
  }, [jobId, reloadToken]);
  if (state.status === 'loading')
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando ficha…
      </div>
    );
  if (state.status === 'not-found')
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="Ficha no encontrada"
          description="El registro solicitado no existe."
          action={
            <Link to="/trabajos" className={buttonStyles()}>
              Volver a trabajos
            </Link>
          }
        />
      </Card>
    );
  if (state.status === 'error')
    return (
      <Card>
        <EmptyState
          icon={RefreshCw}
          title="No pudimos cargar la ficha"
          description="Ocurrió un problema al consultar el almacenamiento local."
          action={
            <Button
              onClick={() => {
                setState({ status: 'loading' });
                setReloadToken((value) => value + 1);
              }}
            >
              Reintentar
            </Button>
          }
        />
      </Card>
    );
  const { job, client } = state;
  return (
    <div>
      <PageHeader
        eyebrow="Detalle de ficha"
        title={job.jobNumber ? `Ficha ${job.jobNumber}` : `Ficha #${job.id}`}
        description={`${client.firstName} ${client.lastName} · ${job.product ?? 'Producto sin especificar'}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/trabajos" className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft size={17} />
              Volver
            </Link>
            <Link to={`/trabajos/${job.id}/editar`} className={buttonStyles()}>
              <Pencil size={16} />
              Editar
            </Link>
          </div>
        }
      />
      {message && (
        <div
          className="mt-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900"
          role="status"
        >
          {message}
        </div>
      )}
      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-6">
          <h2 className="border-b border-slate-200 pb-4 text-base font-bold">
            Información del producto
          </h2>
          <dl className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <Detail label="Producto" value={job.product ?? 'Sin especificar'} />
            <Detail label="Número de ficha" value={job.jobNumber ?? 'Sin especificar'} />
            <Detail label="Condición del armazón" value={frameConditionLabel(job.frameCondition)} />
            <Detail label="Material del armazón" value={frameMaterialLabel(job.frameMaterial)} />
            <Detail label="Modelo" value={job.frameModel ?? 'Sin especificar'} />
            <Detail label="Coloración" value={colorTypeLabel(job.colorType)} />
            <Detail label="Fecha de creación" value={formatJobTimestamp(job.createdAt)} />
            <Detail label="Última modificación" value={formatJobTimestamp(job.updatedAt)} />
            <div className="md:col-span-2">
              <Detail label="Observaciones" value={job.observations ?? 'Sin especificar'} />
            </div>
          </dl>
        </Card>
        <Card className="h-fit p-5">
          <h2 className="text-sm font-bold">Relaciones</h2>
          <Link
            to={`/clientes/${client.id}`}
            className={`${buttonStyles({ variant: 'secondary' })} mt-4 w-full`}
          >
            <UserRound size={16} />
            Abrir cliente
          </Link>
          {job.prescriptionId ? (
            <Link
              to={`/recetas/${job.prescriptionId}`}
              className={`${buttonStyles({ variant: 'secondary' })} mt-2 w-full`}
            >
              <FileText size={16} />
              Ver receta asociada
            </Link>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Sin receta asociada.
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            La ficha referencia el registro actual de la receta; no congela una copia de sus
            graduaciones.
          </p>
        </Card>
      </div>
      <Card className="mt-5 p-6">
        <h2 className="text-base font-bold">Tratamientos y acabados de lentes</h2>
        <p className="mt-1 text-sm text-slate-600">
          Características comerciales del producto, no procedimientos médicos.
        </p>
        {job.treatments.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-4 text-sm text-slate-600">
            Ninguno informado.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {job.treatments.map((item) => (
              <li
                key={item.id}
                className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-900"
              >
                {item.name}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
