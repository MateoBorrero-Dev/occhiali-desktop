import { ArrowLeft, CheckCircle2, PackageCheck, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Client, DeliveryRecipientType, OpticalJob } from '../../../shared/database-models';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapClientResult } from '../lib/client-api';
import {
  DeliveryReceiptRequestError,
  unwrapDeliveryReceiptResult,
} from '../lib/delivery-receipt-api';
import { unwrapOpticalJobResult } from '../lib/optical-job-api';

interface FormState {
  deliveredAt: string;
  recipientType: DeliveryRecipientType;
  recipientFullName: string;
  recipientDocumentNumber: string;
  recipientRelationship: string;
  authorizationReference: string;
  authorizationConfirmed: boolean;
  deliveredBy: string;
  deliveryNotes: string;
  deliveryConfirmed: boolean;
}

function localDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

const inputClass =
  'mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 aria-[invalid=true]:border-red-500';

export function DeliveryReceiptCreatePage(): React.JSX.Element {
  const jobId = Number(useParams().id);
  const navigate = useNavigate();
  const [data, setData] = useState<{ job: OpticalJob; client: Client } | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    deliveredAt: localDateTime(),
    recipientType: 'OWNER',
    recipientFullName: '',
    recipientDocumentNumber: '',
    recipientRelationship: '',
    authorizationReference: '',
    authorizationConfirmed: false,
    deliveredBy: '',
    deliveryNotes: '',
    deliveryConfirmed: false,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      window.optica.opticalJobs.get(jobId).then(unwrapOpticalJobResult),
      window.optica.deliveryReceipts.getByJob(jobId).then(unwrapDeliveryReceiptResult),
    ])
      .then(async ([job, existing]) => {
        if (existing) {
          void navigate(`/retiros/${existing.id}`, { replace: true });
          return;
        }
        const client = unwrapClientResult(await window.optica.clients.get(job.clientId));
        if (!active) return;
        setData({ job, client });
        setForm((current) => ({
          ...current,
          recipientFullName: `${client.firstName} ${client.lastName}`,
          recipientDocumentNumber: client.documentNumber ?? '',
        }));
      })
      .catch(() => active && setLoadingError(true));
    return () => {
      active = false;
    };
  }, [jobId, navigate]);

  const summary = useMemo(
    () =>
      data
        ? {
            client: `${data.client.firstName} ${data.client.lastName}`,
            product: data.job.product ?? 'Producto sin especificar',
          }
        : null,
    [data],
  );

  const update = <K extends keyof FormState>(field: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setErrors({});
    try {
      const receipt = unwrapDeliveryReceiptResult(
        await window.optica.deliveryReceipts.create({
          opticalJobId: jobId,
          deliveredAt: new Date(form.deliveredAt).toISOString(),
          recipientType: form.recipientType,
          recipientFullName: form.recipientFullName,
          recipientDocumentNumber: form.recipientDocumentNumber,
          recipientRelationship: form.recipientRelationship,
          authorizationReference: form.authorizationReference,
          authorizationConfirmed: form.authorizationConfirmed,
          deliveredBy: form.deliveredBy,
          deliveryNotes: form.deliveryNotes,
          deliveryConfirmed: form.deliveryConfirmed,
        }),
      );
      void navigate(`/retiros/${receipt.id}`, {
        replace: true,
        state: { message: `Retiro ${receipt.receiptNumber} registrado correctamente.` },
      });
    } catch (error: unknown) {
      if (error instanceof DeliveryReceiptRequestError) {
        setErrors(error.detail.fields ?? { form: error.message });
        setReviewing(false);
      } else setErrors({ form: 'No se pudo registrar el retiro.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingError)
    return (
      <Card className="p-6">
        <p role="alert">No se pudo cargar la ficha.</p>
      </Card>
    );
  if (!data || !summary)
    return (
      <p className="py-24 text-center text-sm font-semibold" role="status">
        Cargando datos del retiro…
      </p>
    );

  return (
    <div>
      <PageHeader
        eyebrow="Entrega de producto"
        title="Registrar retiro"
        description={`Ficha ${data.job.jobNumber ?? `#${data.job.id}`} · ${summary.client}`}
        action={
          <Link to={`/trabajos/${jobId}`} className={buttonStyles({ variant: 'secondary' })}>
            <ArrowLeft size={17} />
            Volver
          </Link>
        }
      />
      {errors.form && (
        <div
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
          role="alert"
        >
          {errors.form}
        </div>
      )}
      {!reviewing ? (
        <Card className="mt-6 p-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <label className="text-sm font-semibold">
              Fecha y hora efectiva de entrega
              <input
                className={inputClass}
                type="datetime-local"
                value={form.deliveredAt}
                onChange={(event) => update('deliveredAt', event.target.value)}
                aria-invalid={Boolean(errors.deliveredAt)}
              />
              {errors.deliveredAt && (
                <span className="mt-1 block text-xs text-red-700">{errors.deliveredAt}</span>
              )}
            </label>
            <fieldset>
              <legend className="text-sm font-semibold">Persona que retira</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {(
                  [
                    ['OWNER', 'Retira el titular'],
                    ['AUTHORIZED_THIRD_PARTY', 'Retira un tercero autorizado'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      checked={form.recipientType === value}
                      onChange={() => update('recipientType', value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="text-sm font-semibold">
              Nombre completo de quien retira
              <input
                className={inputClass}
                value={form.recipientFullName}
                onChange={(event) => update('recipientFullName', event.target.value)}
                aria-invalid={Boolean(errors.recipientFullName)}
              />
              {errors.recipientFullName && (
                <span className="mt-1 block text-xs text-red-700">{errors.recipientFullName}</span>
              )}
            </label>
            <label className="text-sm font-semibold">
              DNI {form.recipientType === 'OWNER' ? '(opcional si no está informado)' : ''}
              <input
                className={inputClass}
                value={form.recipientDocumentNumber}
                onChange={(event) => update('recipientDocumentNumber', event.target.value)}
                aria-invalid={Boolean(errors.recipientDocumentNumber)}
              />
              {errors.recipientDocumentNumber && (
                <span className="mt-1 block text-xs text-red-700">
                  {errors.recipientDocumentNumber}
                </span>
              )}
            </label>
            {form.recipientType === 'AUTHORIZED_THIRD_PARTY' && (
              <>
                <label className="text-sm font-semibold">
                  Vínculo con el titular
                  <input
                    className={inputClass}
                    value={form.recipientRelationship}
                    onChange={(event) => update('recipientRelationship', event.target.value)}
                    aria-invalid={Boolean(errors.recipientRelationship)}
                  />
                  {errors.recipientRelationship && (
                    <span className="mt-1 block text-xs text-red-700">
                      {errors.recipientRelationship}
                    </span>
                  )}
                </label>
                <label className="text-sm font-semibold">
                  Referencia o descripción de la autorización
                  <textarea
                    className={`${inputClass} min-h-24 py-3`}
                    value={form.authorizationReference}
                    onChange={(event) => update('authorizationReference', event.target.value)}
                    aria-invalid={Boolean(errors.authorizationReference)}
                  />
                  {errors.authorizationReference && (
                    <span className="mt-1 block text-xs text-red-700">
                      {errors.authorizationReference}
                    </span>
                  )}
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm lg:col-span-2">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={form.authorizationConfirmed}
                    onChange={(event) => update('authorizationConfirmed', event.target.checked)}
                  />
                  <span>
                    <strong>
                      Confirmo que comprobé la identidad y la autorización del tercero.
                    </strong>
                    <br />
                    Occhiali registra esta declaración; no verifica documentos automáticamente.
                  </span>
                </label>
              </>
            )}
            <label className="text-sm font-semibold">
              Nombre de quien realiza la entrega
              <input
                className={inputClass}
                value={form.deliveredBy}
                onChange={(event) => update('deliveredBy', event.target.value)}
                aria-invalid={Boolean(errors.deliveredBy)}
              />
              {errors.deliveredBy && (
                <span className="mt-1 block text-xs text-red-700">{errors.deliveredBy}</span>
              )}
            </label>
            <label className="text-sm font-semibold lg:col-span-2">
              Observaciones sobre la entrega (opcional)
              <textarea
                className={`${inputClass} min-h-24 py-3`}
                value={form.deliveryNotes}
                onChange={(event) => update('deliveryNotes', event.target.value)}
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setReviewing(true)}>
              <ShieldCheck size={17} />
              Revisar entrega
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mt-6 p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-teal-700" />
            <div>
              <h2 className="font-bold">Confirmación final</h2>
              <p className="text-sm text-slate-600">
                Revisá el resumen antes de crear el comprobante permanente.
              </p>
            </div>
          </div>
          <dl className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <dt className="text-xs font-bold text-slate-500 uppercase">Cliente titular</dt>
              <dd className="mt-1 font-semibold">{summary.client}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500 uppercase">Producto</dt>
              <dd className="mt-1 font-semibold">{summary.product}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500 uppercase">Persona que retira</dt>
              <dd className="mt-1 font-semibold">{form.recipientFullName}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500 uppercase">Fecha y hora</dt>
              <dd className="mt-1 font-semibold">
                {new Date(form.deliveredAt).toLocaleString('es-AR')}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500 uppercase">Responsable de entrega</dt>
              <dd className="mt-1 font-semibold">{form.deliveredBy || 'No informado'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-500 uppercase">Observaciones</dt>
              <dd className="mt-1 font-semibold">{form.deliveryNotes || 'Sin observaciones'}</dd>
            </div>
          </dl>
          <label className="mt-6 flex items-start gap-3 rounded-lg border-2 border-teal-300 bg-teal-50 p-4 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.deliveryConfirmed}
              onChange={(event) => update('deliveryConfirmed', event.target.checked)}
            />
            <span>
              <strong>Confirmo expresamente que el producto fue entregado.</strong>
              <br />
              Guardar creará un comprobante histórico que no puede editarse silenciosamente.
            </span>
          </label>
          {errors.deliveryConfirmed && (
            <p className="mt-2 text-sm font-semibold text-red-700">{errors.deliveryConfirmed}</p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setReviewing(false)} disabled={saving}>
              Volver a editar
            </Button>
            <Button onClick={() => void save()} disabled={saving || !form.deliveryConfirmed}>
              <PackageCheck size={17} />
              {saving ? 'Registrando…' : 'Registrar entrega'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
