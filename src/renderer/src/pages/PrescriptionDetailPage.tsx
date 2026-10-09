import { ArrowLeft, FileQuestion, History, Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Client, Prescription, PrescriptionRevision } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { PrescriptionValuesTable } from '../components/prescriptions/PrescriptionValuesTable';
import { PrescriptionOpticalJobs } from '../components/optical-jobs/PrescriptionOpticalJobs';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapClientResult } from '../lib/client-api';
import {
  formatPrescriptionDate,
  formatPrescriptionTimestamp,
  PrescriptionRequestError,
  unwrapPrescriptionResult,
} from '../lib/prescription-api';

type DetailState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | {
      status: 'ready';
      prescription: Prescription;
      client: Client;
      revisions: PrescriptionRevision[];
    };

export function PrescriptionDetailPage(): React.JSX.Element {
  const { id } = useParams();
  const location = useLocation();
  const prescriptionId = Number(id);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const message =
    typeof (location.state as { message?: unknown } | null)?.message === 'string'
      ? (location.state as { message: string }).message
      : null;

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.optica.prescriptions.get(prescriptionId).then(unwrapPrescriptionResult),
      window.optica.prescriptions.revisions(prescriptionId).then(unwrapPrescriptionResult),
    ])
      .then(async ([prescription, revisions]) => ({
        prescription,
        revisions,
        client: unwrapClientResult(await window.optica.clients.get(prescription.clientId)),
      }))
      .then((data) => {
        if (active) setState({ status: 'ready', ...data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(
          error instanceof PrescriptionRequestError && error.detail.code === 'NOT_FOUND'
            ? { status: 'not-found' }
            : { status: 'error' },
        );
      });
    return () => {
      active = false;
    };
  }, [prescriptionId, reloadToken]);

  if (state.status === 'loading')
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando receta…
      </div>
    );
  if (state.status === 'not-found')
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="Receta no encontrada"
          description="El registro solicitado no existe."
          action={
            <Link to="/recetas" className={buttonStyles()}>
              Volver a recetas
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
          title="No pudimos cargar la receta"
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
  const { prescription, client, revisions } = state;
  return (
    <div>
      <PageHeader
        eyebrow="Detalle de receta"
        title={`Receta del ${formatPrescriptionDate(prescription.prescriptionDate)}`}
        description={`${client.firstName} ${client.lastName} · Registro #${prescription.id}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Link to={`/clientes/${client.id}`} className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft size={17} aria-hidden="true" />
              Historial del cliente
            </Link>
            <Link to={`/recetas/${prescription.id}/corregir`} className={buttonStyles()}>
              <Pencil size={16} aria-hidden="true" />
              Corregir carga
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
      <Card className="mt-6 p-6">
        <dl className="grid grid-cols-1 gap-5 border-b border-slate-200 pb-6 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">Cliente</dt>
            <dd className="mt-1.5 text-sm font-semibold">
              <Link className="text-teal-800 hover:underline" to={`/clientes/${client.id}`}>
                {client.lastName}, {client.firstName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">Profesional</dt>
            <dd className="mt-1.5 text-sm font-semibold">
              {prescription.prescriberName ?? 'No informado'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">Fecha de carga</dt>
            <dd className="mt-1.5 text-sm font-semibold">
              {formatPrescriptionTimestamp(prescription.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">Última actualización</dt>
            <dd className="mt-1.5 text-sm font-semibold">
              {formatPrescriptionTimestamp(prescription.updatedAt)}
            </dd>
          </div>
        </dl>
        <div className="mt-6">
          <h2 className="mb-3 text-base font-bold">Graduaciones actuales</h2>
          <PrescriptionValuesTable values={prescription.values} />
        </div>
        <div className="mt-6">
          <h2 className="text-base font-bold">Observaciones</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {prescription.notes ?? 'No informadas'}
          </p>
        </div>
      </Card>
      <PrescriptionOpticalJobs prescriptionId={prescription.id} />
      <Card className="mt-5 p-6">
        <div className="flex items-center gap-3">
          <History className="text-teal-700" size={20} aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold">Historial de correcciones</h2>
            <p className="mt-1 text-sm text-slate-600">
              Cada revisión conserva la instantánea anterior.
            </p>
          </div>
        </div>
        {revisions.length === 0 ? (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">
            Esta receta no tiene correcciones.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {revisions.map((revision) => (
              <details key={revision.id} className="rounded-lg border border-slate-200 p-4">
                <summary className="cursor-pointer font-semibold text-slate-900">
                  Revisión {revision.revisionNumber} ·{' '}
                  {formatPrescriptionTimestamp(revision.correctedAt)} · {revision.reason}
                </summary>
                <div className="mt-4">
                  <p className="mb-3 text-sm text-slate-600">
                    Estado anterior del {formatPrescriptionDate(revision.prescriptionDate)} ·
                    Profesional: {revision.prescriberName ?? 'No informado'}
                  </p>
                  <PrescriptionValuesTable
                    values={revision.values}
                    caption={`Valores anteriores de la revisión ${revision.revisionNumber}`}
                  />
                  {revision.notes && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                      Observaciones anteriores: {revision.notes}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
