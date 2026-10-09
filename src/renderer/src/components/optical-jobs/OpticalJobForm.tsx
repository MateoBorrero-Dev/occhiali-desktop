import { Save, Search, UserRoundPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Client,
  CreateOpticalJobInput,
  OpticalJob,
  PrescriptionSummary,
  Treatment,
  UpdateOpticalJobInput,
} from '../../../../shared/database-models';
import {
  OPTICAL_JOB_FIELD_LIMITS,
  OpticalJobValidationError,
  parseCreateOpticalJobInput,
  parseUpdateOpticalJobInput,
} from '../../../../shared/optical-job-validation';
import { unwrapClientResult } from '../../lib/client-api';
import { OpticalJobRequestError, unwrapOpticalJobResult } from '../../lib/optical-job-api';
import { formatPrescriptionDate, unwrapPrescriptionResult } from '../../lib/prescription-api';
import { Button } from '../ui/Button';
import { buttonStyles } from '../ui/buttonStyles';
import { Card } from '../ui/Card';

interface OpticalJobFormProps {
  fixedClient?: Client;
  initialJob?: OpticalJob;
  submitLabel: string;
  onSubmit: (input: CreateOpticalJobInput | UpdateOpticalJobInput) => Promise<OpticalJob>;
  onCancel: () => void;
}

interface FormValues {
  clientId: string;
  prescriptionId: string;
  jobNumber: string;
  product: string;
  frameCondition: string;
  frameMaterial: string;
  frameModel: string;
  colorType: string;
  observations: string;
  treatmentIds: string[];
}

type FormErrors = Record<string, string | undefined>;

const inputClassName =
  'mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 aria-[invalid=true]:border-red-500';

function initialValues(client?: Client, job?: OpticalJob): FormValues {
  return {
    clientId: String(client?.id ?? job?.clientId ?? ''),
    prescriptionId: job?.prescriptionId?.toString() ?? '',
    jobNumber: job?.jobNumber ?? '',
    product: job?.product ?? '',
    frameCondition: job?.frameCondition ?? '',
    frameMaterial: job?.frameMaterial ?? '',
    frameModel: job?.frameModel ?? '',
    colorType: job?.colorType ?? '',
    observations: job?.observations ?? '',
    treatmentIds: job?.treatments.map((item) => item.id) ?? [],
  };
}

function errorsFromValidation(error: OpticalJobValidationError): FormErrors {
  return Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message]));
}

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  return message ? (
    <p className="mt-1.5 text-xs font-semibold text-red-700" role="alert">
      {message}
    </p>
  ) : null;
}

export function OpticalJobForm({
  fixedClient,
  initialJob,
  submitLabel,
  onSubmit,
  onCancel,
}: OpticalJobFormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() => initialValues(fixedClient, initialJob));
  const [selectedClient, setSelectedClient] = useState<Client | undefined>(fixedClient);
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionSummary[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const editing = Boolean(initialJob);

  useEffect(() => {
    let active = true;
    void window.optica.treatments
      .list()
      .then(unwrapOpticalJobResult)
      .then((items) => {
        if (active) {
          setTreatments(items);
          setLoadingOptions(false);
        }
      })
      .catch(() => {
        if (active) {
          setErrors({ form: 'No se pudo cargar el catálogo de tratamientos y acabados.' });
          setLoadingOptions(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (fixedClient || editing || clientQuery.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      void window.optica.clients
        .list({ query: clientQuery, status: 'active', limit: 10, offset: 0 })
        .then(unwrapClientResult)
        .then((page) => setClientResults(page.items))
        .catch(() =>
          setErrors((current) => ({ ...current, clientId: 'No se pudo buscar clientes.' })),
        );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [clientQuery, editing, fixedClient]);

  useEffect(() => {
    const clientId = Number(values.clientId);
    if (!Number.isSafeInteger(clientId) || clientId < 1) return;
    let active = true;
    void window.optica.prescriptions
      .listByClient({ clientId, limit: 100, offset: 0 })
      .then(unwrapPrescriptionResult)
      .then((page) => {
        if (active) setPrescriptions(page.items);
      })
      .catch(() => {
        if (active)
          setErrors((current) => ({
            ...current,
            prescriptionId: 'No se pudieron cargar las recetas del cliente.',
          }));
      });
    return () => {
      active = false;
    };
  }, [values.clientId]);

  const update = (field: keyof FormValues, value: string | string[]): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const selectClient = (client: Client): void => {
    setSelectedClient(client);
    setClientQuery('');
    setClientResults([]);
    setValues((current) => ({ ...current, clientId: String(client.id), prescriptionId: '' }));
    setPrescriptions([]);
    setErrors((current) => ({ ...current, clientId: undefined, prescriptionId: undefined }));
  };

  const toggleTreatment = (id: string): void => {
    update(
      'treatmentIds',
      values.treatmentIds.includes(id)
        ? values.treatmentIds.filter((item) => item !== id)
        : [...values.treatmentIds, id],
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submittingRef.current) return;
    try {
      const core = {
        prescriptionId: values.prescriptionId ? Number(values.prescriptionId) : null,
        jobNumber: values.jobNumber,
        product: values.product,
        frameCondition: values.frameCondition || null,
        frameMaterial: values.frameMaterial || null,
        frameModel: values.frameModel,
        colorType: values.colorType || null,
        observations: values.observations,
        treatmentIds: values.treatmentIds,
      };
      const input = editing
        ? parseUpdateOpticalJobInput(core)
        : parseCreateOpticalJobInput({ ...core, clientId: Number(values.clientId) });
      setErrors({});
      submittingRef.current = true;
      setSubmitting(true);
      await onSubmit(input);
    } catch (error: unknown) {
      if (error instanceof OpticalJobValidationError) setErrors(errorsFromValidation(error));
      else if (error instanceof OpticalJobRequestError)
        setErrors(error.detail.fields ?? { form: error.detail.message });
      else setErrors({ form: 'No se pudo guardar la ficha. Volvé a intentarlo.' });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Card className="mt-6 p-6">
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        {errors.form && (
          <div
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
            role="alert"
          >
            {errors.form}
          </div>
        )}
        <section aria-labelledby="job-client">
          <h2 id="job-client" className="text-base font-bold text-slate-950">
            Cliente
          </h2>
          {selectedClient || fixedClient ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
              <p className="text-sm font-semibold text-teal-950">
                {(selectedClient ?? fixedClient)?.lastName},{' '}
                {(selectedClient ?? fixedClient)?.firstName}
              </p>
              {!fixedClient && !editing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedClient(undefined);
                    setValues((current) => ({ ...current, clientId: '', prescriptionId: '' }));
                  }}
                >
                  Cambiar cliente
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <label className="text-sm font-semibold text-slate-800">
                Buscar cliente por nombre, apellido, DNI o teléfono
                <div className="relative">
                  <Search
                    size={17}
                    className="pointer-events-none absolute top-1/2 left-3 mt-0.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    autoFocus
                    type="search"
                    className={`${inputClassName} pl-10`}
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder="Ingresá al menos dos caracteres"
                  />
                </div>
              </label>
              {clientQuery.trim().length >= 2 && clientResults.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {clientResults.map((client) => (
                    <li key={client.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700"
                        onClick={() => selectClient(client)}
                      >
                        <span className="font-semibold">
                          {client.lastName}, {client.firstName}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {client.documentNumber ? `DNI ${client.documentNumber}` : 'Sin DNI'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <span>¿No existe?</span>
                <Link
                  to="/clientes/nuevo"
                  className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                >
                  <UserRoundPlus size={15} aria-hidden="true" />
                  Registrar cliente
                </Link>
              </div>
            </div>
          )}
          <FieldError message={errors.clientId} />
        </section>
        <div className="my-6 border-t border-slate-200" />
        <section aria-labelledby="job-product">
          <h2 id="job-product" className="text-base font-bold text-slate-950">
            Producto y número de ficha
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">
              Producto <span className="font-normal text-slate-500">(opcional)</span>
              <input
                list="common-products"
                className={inputClassName}
                value={values.product}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.product}
                onChange={(event) => update('product', event.target.value)}
                placeholder="Ej. Anteojos recetados"
                aria-invalid={Boolean(errors.product)}
              />
              <datalist id="common-products">
                <option value="Anteojos recetados" />
                <option value="Lentes de sol" />
              </datalist>
              <FieldError message={errors.product} />
            </label>
            <label className="text-sm font-semibold text-slate-800">
              Número de ficha <span className="font-normal text-slate-500">(opcional)</span>
              <input
                className={inputClassName}
                value={values.jobNumber}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.jobNumber}
                onChange={(event) => update('jobNumber', event.target.value)}
                placeholder="Ej. 000152"
                aria-invalid={Boolean(errors.jobNumber)}
              />
              <FieldError message={errors.jobNumber} />
            </label>
          </div>
        </section>
        <div className="my-6 border-t border-slate-200" />
        <section aria-labelledby="job-prescription">
          <h2 id="job-prescription" className="text-base font-bold text-slate-950">
            Receta asociada
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Opcional. Solo se muestran recetas del cliente seleccionado.
          </p>
          <label className="mt-3 block text-sm font-semibold text-slate-800">
            Receta
            <select
              className={inputClassName}
              value={values.prescriptionId}
              disabled={!values.clientId}
              onChange={(event) => update('prescriptionId', event.target.value)}
              aria-invalid={Boolean(errors.prescriptionId)}
            >
              <option value="">Sin receta asociada</option>
              {prescriptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatPrescriptionDate(item.prescriptionDate)} ·{' '}
                  {item.prescriberName ?? 'Profesional no informado'}
                </option>
              ))}
            </select>
            <FieldError message={errors.prescriptionId} />
          </label>
        </section>
        <div className="my-6 border-t border-slate-200" />
        <section aria-labelledby="job-frame">
          <h2 id="job-frame" className="text-base font-bold text-slate-950">
            Armazón
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
            <label className="text-sm font-semibold text-slate-800">
              Condición
              <select
                className={inputClassName}
                value={values.frameCondition}
                onChange={(event) => update('frameCondition', event.target.value)}
              >
                <option value="">Sin especificar</option>
                <option value="NEW">Nuevo</option>
                <option value="USED">Usado</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-800">
              Material
              <select
                className={inputClassName}
                value={values.frameMaterial}
                onChange={(event) => update('frameMaterial', event.target.value)}
              >
                <option value="">Sin especificar</option>
                <option value="ZILO">Zilo</option>
                <option value="METAL">Metal</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-800">
              Modelo <span className="font-normal text-slate-500">(opcional)</span>
              <input
                className={inputClassName}
                value={values.frameModel}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.frameModel}
                onChange={(event) => update('frameModel', event.target.value)}
              />
            </label>
          </div>
        </section>
        <div className="my-6 border-t border-slate-200" />
        <section aria-labelledby="job-treatments">
          <h2 id="job-treatments" className="text-base font-bold text-slate-950">
            Tratamientos y acabados de lentes
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Características comerciales del producto óptico; no son procedimientos médicos.
          </p>
          {loadingOptions ? (
            <p className="mt-4 text-sm font-semibold text-slate-600" role="status">
              Cargando catálogo…
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {treatments.map((treatment) => (
                <label
                  key={treatment.id}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-700"
                    checked={values.treatmentIds.includes(treatment.id)}
                    onChange={() => toggleTreatment(treatment.id)}
                  />
                  {treatment.name}
                </label>
              ))}
            </div>
          )}
          <FieldError message={errors.treatmentIds} />
          <label className="mt-5 block max-w-sm text-sm font-semibold text-slate-800">
            Coloración
            <select
              className={inputClassName}
              value={values.colorType}
              onChange={(event) => update('colorType', event.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="FULL">Color pleno</option>
              <option value="GRADIENT">Color degradé</option>
            </select>
          </label>
        </section>
        <div className="my-6 border-t border-slate-200" />
        <label className="block text-sm font-semibold text-slate-800">
          Observaciones <span className="font-normal text-slate-500">(opcional)</span>
          <textarea
            rows={4}
            className={`${inputClassName} resize-y py-2.5`}
            value={values.observations}
            maxLength={OPTICAL_JOB_FIELD_LIMITS.observations}
            onChange={(event) => update('observations', event.target.value)}
          />
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            <X size={17} aria-hidden="true" />
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || loadingOptions}>
            <Save size={17} aria-hidden="true" />
            {submitting ? 'Guardando…' : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
