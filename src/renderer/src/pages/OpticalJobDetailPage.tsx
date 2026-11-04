import {
  ArrowLeft,
  FileQuestion,
  FileText,
  PackageCheck,
  Pencil,
  RefreshCw,
  UserRound,
  History,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type {
  Client,
  DeliveryReceipt,
  OpticalJob,
  Prescription,
  PrescriptionRevision,
} from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { PrescriptionValuesTable } from '../components/prescriptions/PrescriptionValuesTable';
import { unwrapClientResult } from '../lib/client-api';
import {
  colorTypeLabel,
  formatJobTimestamp,
  frameConditionLabel,
  frameMaterialLabel,
  OpticalJobRequestError,
  unwrapOpticalJobResult,
} from '../lib/optical-job-api';
import { deliveryStatusLabel, unwrapDeliveryReceiptResult } from '../lib/delivery-receipt-api';
import {
  formatPrescriptionDate,
  formatPrescriptionTimestamp,
  unwrapPrescriptionResult,
} from '../lib/prescription-api';

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | {
      status: 'ready';
      job: OpticalJob;
      client: Client;
      receipt: DeliveryReceipt | null;
      prescription: Prescription | null;
      revisions: PrescriptionRevision[];
    };
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
      .then(async (job) => {
        const [client, receipt, prescription, revisions] = await Promise.all([
          window.optica.clients.get(job.clientId).then(unwrapClientResult),
          window.optica.deliveryReceipts.getByJob(job.id).then(unwrapDeliveryReceiptResult),
          job.prescriptionId
            ? window.optica.prescriptions.get(job.prescriptionId).then(unwrapPrescriptionResult)
            : Promise.resolve(null),
          job.prescriptionId
            ? window.optica.prescriptions
                .revisions(job.prescriptionId)
                .then(unwrapPrescriptionResult)
            : Promise.resolve([]),
        ]);
        return { job, client, receipt, prescription, revisions };
      })
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
            <Link to="/fichas" className={buttonStyles()}>
              Volver a fichas
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
  const { job, client, receipt, prescription, revisions } = state;
  return (
    <div>
      <PageHeader
        eyebrow="Ficha óptica"
        title={job.jobNumber ? `Ficha ${job.jobNumber}` : `Ficha #${job.id}`}
        description={`${client.firstName} ${client.lastName}${job.product ? ` · ${job.product}` : ''}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/fichas" className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft size={17} />
              Volver
            </Link>
            <Link to={`/fichas/trabajo/${job.id}/editar`} className={buttonStyles()}>
              <Pencil size={16} />
              Editar ficha completa
            </Link>
            {receipt ? (
              <Link to={`/retiros/${receipt.id}`} className={buttonStyles()}>
                <FileText size={16} />
                Ver comprobante
              </Link>
            ) : (
              <Link to={`/fichas/trabajo/${job.id}/retiro/nuevo`} className={buttonStyles()}>
                <PackageCheck size={16} />
                Registrar retiro
              </Link>
            )}
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
          <section aria-labelledby="product-detail-heading">
            <h2
              id="product-detail-heading"
              className="border-b border-slate-200 pb-4 text-base font-bold"
            >
              Información del producto
            </h2>
            <dl className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              {job.product && <Detail label="Producto" value={job.product} />}
              {job.jobNumber && <Detail label="Número de ficha" value={job.jobNumber} />}
              {job.lens && <Detail label="Cristal" value={job.lens} />}
              {job.brand && <Detail label="Marca" value={job.brand} />}
              {job.productColor && <Detail label="Color" value={job.productColor} />}
              {job.colorType && <Detail label="Coloración" value={colorTypeLabel(job.colorType)} />}
              <Detail label="Fecha de creación" value={formatJobTimestamp(job.createdAt)} />
              <Detail label="Última modificación" value={formatJobTimestamp(job.updatedAt)} />
            </dl>
          </section>
          <section
            className="mt-7 border-t border-slate-200 pt-6"
            aria-labelledby="frame-detail-heading"
          >
            <h2 id="frame-detail-heading" className="text-base font-bold">
              Armazón
            </h2>
            <dl className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              {job.frameCondition && (
                <Detail label="Condición" value={frameConditionLabel(job.frameCondition)} />
              )}
              {job.frameMaterial && (
                <Detail label="Material" value={frameMaterialLabel(job.frameMaterial)} />
              )}
              {job.frameModel && <Detail label="Modelo" value={job.frameModel} />}
              {job.supplier && <Detail label="Proveedor" value={job.supplier} />}
            </dl>
          </section>
          {job.observations && (
            <div className="mt-7 border-t border-slate-200 pt-6">
              <Detail label="Observaciones generales" value={job.observations} />
            </div>
          )}
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
          {!prescription && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Ficha histórica sin graduación asociada.
            </p>
          )}
        </Card>
      </div>
      {prescription && (
        <Card className="mt-5 p-6">
          <div className="border-b border-slate-200 pb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Graduación</h2>
              <p className="mt-1 text-base text-slate-600">
                Fecha {formatPrescriptionDate(prescription.prescriptionDate)}
                {prescription.prescriberName
                  ? ` · Profesional: ${prescription.prescriberName}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <PrescriptionValuesTable
              values={prescription.values}
              additionOd={prescription.additionOd}
              additionOi={prescription.additionOi}
            />
          </div>
          {prescription.notes && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-bold text-amber-950">Observación histórica de la receta</h3>
              <p className="mt-2 whitespace-pre-wrap text-base text-amber-900">
                {prescription.notes}
              </p>
            </div>
          )}
        </Card>
      )}
      {job.treatments.length > 0 && (
        <Card className="mt-5 p-6">
          <h2 className="text-base font-bold">Tratamientos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Características comerciales del producto, no procedimientos médicos.
          </p>
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
        </Card>
      )}
      {prescription && (
        <Card className="mt-5 p-6">
          <div className="flex items-center gap-3">
            <History className="text-teal-700" size={22} aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold">Historial de correcciones</h2>
              <p className="mt-1 text-base text-slate-600">
                Cada corrección conserva la graduación anterior.
              </p>
            </div>
          </div>
          {revisions.length === 0 ? (
            <p className="mt-5 rounded-xl bg-slate-50 px-4 py-5 text-base text-slate-600">
              Esta ficha no tiene correcciones de graduación.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {revisions.map((revision) => (
                <details key={revision.id} className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-base font-semibold text-slate-900">
                    Revisión {revision.revisionNumber} ·{' '}
                    {formatPrescriptionTimestamp(revision.correctedAt)} · {revision.reason}
                  </summary>
                  <div className="mt-4">
                    <PrescriptionValuesTable
                      values={revision.values}
                      additionOd={revision.additionOd}
                      additionOi={revision.additionOi}
                      caption={`Valores anteriores de la revisión ${revision.revisionNumber}`}
                    />
                    {revision.notes && (
                      <p className="mt-4 whitespace-pre-wrap text-base text-slate-600">
                        Observación histórica anterior: {revision.notes}
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>
      )}
      <Card className="mt-5 p-6">
        <h2 className="text-base font-bold">Entrega del producto</h2>
        {receipt ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-200 bg-teal-50 p-4">
            <div>
              <p className="font-bold text-teal-950">{receipt.receiptNumber}</p>
              <p className="mt-1 text-sm text-teal-900">
                Estado: {deliveryStatusLabel(receipt.status)}
              </p>
            </div>
            <Link to={`/retiros/${receipt.id}`} className={buttonStyles({ variant: 'secondary' })}>
              <FileText size={16} /> Ver comprobante
            </Link>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              Todavía no se registró la entrega de esta ficha.
            </p>
            <Link to={`/fichas/trabajo/${job.id}/retiro/nuevo`} className={buttonStyles()}>
              <PackageCheck size={16} /> Registrar retiro
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
