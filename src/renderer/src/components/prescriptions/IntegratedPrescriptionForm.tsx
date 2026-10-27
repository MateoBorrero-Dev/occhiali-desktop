import { BriefcaseBusiness, FileCheck2, Save, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  Client,
  CreatePrescriptionBundleInput,
  CreatePrescriptionBundleResult,
  CreatePrescriptionValueInput,
  Eye,
  PrescriptionDistance,
} from '../../../../shared/database-models';
import {
  OPTICAL_JOB_FIELD_LIMITS,
  OpticalJobValidationError,
} from '../../../../shared/optical-job-validation';
import { parseCreatePrescriptionBundleInput } from '../../../../shared/prescription-job-validation';
import {
  PRESCRIPTION_FIELD_LIMITS,
  PrescriptionValidationError,
} from '../../../../shared/prescription-validation';
import { unwrapClientResult } from '../../lib/client-api';
import { PrescriptionRequestError } from '../../lib/prescription-api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface IntegratedPrescriptionFormProps {
  fixedClient?: Client;
  onSubmit: (input: CreatePrescriptionBundleInput) => Promise<CreatePrescriptionBundleResult>;
  onCancel: () => void;
}

interface OpticalRow {
  distance: PrescriptionDistance;
  eye: Eye;
  sphere: string;
  cylinder: string;
  axis: string;
  dip: string;
  height: string;
}

interface FormValues {
  clientId: string;
  prescriptionDate: string;
  prescriberName: string;
  prescriptionNotes: string;
  rows: OpticalRow[];
  jobNumber: string;
  product: string;
  lens: string;
  brand: string;
  frameModel: string;
  productColor: string;
  supplier: string;
  colorType: string;
  frameCondition: string;
  frameMaterial: string;
  treatmentNames: string;
  jobObservations: string;
}

type FormErrors = Record<string, string | undefined>;
type SaveMode = 'PRESCRIPTION_ONLY' | 'PRESCRIPTION_AND_JOB';
type ProductChoice = '' | 'Anteojos de receta' | 'Lentes de sol' | 'Lentes de contacto' | 'OTHER';

const ROWS: readonly [PrescriptionDistance, Eye][] = [
  ['FAR', 'OD'],
  ['FAR', 'OI'],
  ['NEAR', 'OD'],
  ['NEAR', 'OI'],
];

const GRADUATION_COLUMNS = [
  ['sphere', 'ESF'],
  ['cylinder', 'CIL'],
  ['axis', 'EJE'],
  ['dip', 'DIP'],
  ['height', 'ALT'],
] as const;

const PRODUCT_OPTIONS: readonly { value: Exclude<ProductChoice, ''>; label: string }[] = [
  { value: 'Anteojos de receta', label: 'Anteojos de receta' },
  { value: 'Lentes de sol', label: 'Lentes de sol' },
  { value: 'Lentes de contacto', label: 'Lentes de contacto' },
  { value: 'OTHER', label: 'Otro' },
];

const inputClassName =
  'mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition focus-visible:border-teal-700 focus-visible:ring-3 focus-visible:ring-teal-100 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-100';

const labelClassName = 'block text-base font-semibold leading-6 text-slate-800';

function initialValues(client?: Client): FormValues {
  return {
    clientId: String(client?.id ?? ''),
    prescriptionDate: new Date().toISOString().slice(0, 10),
    prescriberName: '',
    prescriptionNotes: '',
    rows: ROWS.map(([distance, eye]) => ({
      distance,
      eye,
      sphere: '',
      cylinder: '',
      axis: '',
      dip: '',
      height: '',
    })),
    jobNumber: '',
    product: '',
    lens: '',
    brand: '',
    frameModel: '',
    productColor: '',
    supplier: '',
    colorType: '',
    frameCondition: '',
    frameMaterial: '',
    treatmentNames: '',
    jobObservations: '',
  };
}

function toOpticalValues(rows: readonly OpticalRow[]): CreatePrescriptionValueInput[] {
  return rows.map((row) => ({
    distance: row.distance,
    eye: row.eye,
    sphere: row.sphere,
    cylinder: row.cylinder,
    axis: row.axis === '' ? null : Number(row.axis),
    dip: row.dip,
    height: row.height,
  }));
}

function parseTreatmentText(value: string): string[] {
  const uniqueTreatments = new Map<string, string>();
  for (const part of value.split(/[\n,;]+/)) {
    const treatment = part.trim().replace(/\s+/g, ' ');
    if (!treatment) continue;
    const key = treatment.toLocaleLowerCase('es');
    if (!uniqueTreatments.has(key)) uniqueTreatments.set(key, treatment);
  }
  return [...uniqueTreatments.values()];
}

function validationErrors(
  error: PrescriptionValidationError | OpticalJobValidationError,
): FormErrors {
  return Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message]));
}

function FieldError({ id, message }: { id: string; message?: string }): React.JSX.Element | null {
  return message ? (
    <p id={id} className="mt-2 text-sm font-semibold text-red-700" role="alert">
      {message}
    </p>
  ) : null;
}

function SectionHeading({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <header className="flex items-start gap-3 border-b border-teal-100 pb-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-base font-black text-white">
        {number}
      </span>
      <div>
        <h2 className="text-lg font-black tracking-wide text-slate-950 uppercase">{title}</h2>
        <p className="mt-1 text-base leading-6 text-slate-600">{description}</p>
      </div>
    </header>
  );
}

export function IntegratedPrescriptionForm({
  fixedClient,
  onSubmit,
  onCancel,
}: IntegratedPrescriptionFormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() => initialValues(fixedClient));
  const [selectedClient, setSelectedClient] = useState<Client | undefined>(fixedClient);
  const [clientQuery, setClientQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [clientLoadError, setClientLoadError] = useState(false);
  const [productChoice, setProductChoice] = useState<ProductChoice>('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submittingMode, setSubmittingMode] = useState<SaveMode | null>(null);
  const submittingRef = useRef(false);
  const clientSearchSequence = useRef(0);

  useEffect(() => {
    if (fixedClient) return;
    const query = clientQuery.trim();
    if (query.length < 2) {
      clientSearchSequence.current += 1;
      return;
    }
    const timer = window.setTimeout(() => {
      const request = ++clientSearchSequence.current;
      setClientLoadError(false);
      void window.optica.clients
        .list({ query, status: 'active', limit: 10, offset: 0 })
        .then(unwrapClientResult)
        .then((page) => {
          if (clientSearchSequence.current === request) setClients(page.items);
        })
        .catch(() => {
          if (clientSearchSequence.current === request) setClientLoadError(true);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [clientQuery, fixedClient]);

  const update = (field: Exclude<keyof FormValues, 'rows'>, value: string): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const updateRow = (
    index: number,
    field: keyof Omit<OpticalRow, 'distance' | 'eye'>,
    value: string,
  ): void => {
    setValues((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    }));
    setErrors((current) => ({
      ...current,
      [`values.${index}.${field}`]: undefined,
      values: undefined,
      form: undefined,
    }));
  };

  const createInput = (mode: SaveMode): CreatePrescriptionBundleInput =>
    parseCreatePrescriptionBundleInput({
      prescription: {
        clientId: Number(values.clientId),
        prescriptionDate: values.prescriptionDate,
        prescriberName: values.prescriberName,
        additionOd: null,
        additionOi: null,
        notes: values.prescriptionNotes,
        values: toOpticalValues(values.rows),
      },
      opticalJob:
        mode === 'PRESCRIPTION_ONLY'
          ? null
          : {
              jobNumber: values.jobNumber,
              product: values.product,
              lens: values.lens,
              brand: values.brand,
              frameModel: values.frameModel,
              productColor: values.productColor,
              supplier: values.supplier,
              colorType: values.colorType || null,
              frameCondition: values.frameCondition || null,
              frameMaterial: values.frameMaterial || null,
              treatmentIds: [],
              treatmentNames: parseTreatmentText(values.treatmentNames),
              observations: values.jobObservations,
            },
    });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submittingRef.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode: SaveMode =
      submitter?.value === 'PRESCRIPTION_AND_JOB' ? 'PRESCRIPTION_AND_JOB' : 'PRESCRIPTION_ONLY';
    try {
      const input = createInput(mode);
      setErrors({});
      submittingRef.current = true;
      setSubmittingMode(mode);
      await onSubmit(input);
    } catch (error: unknown) {
      if (
        error instanceof PrescriptionValidationError ||
        error instanceof OpticalJobValidationError
      ) {
        setErrors(validationErrors(error));
      } else if (error instanceof PrescriptionRequestError) {
        if (error.detail.code === 'DUPLICATE_JOB_NUMBER') {
          setErrors({ jobNumber: error.detail.message });
        } else if (error.detail.code === 'ARCHIVED_CLIENT') {
          setErrors({ clientId: error.detail.message });
        } else {
          setErrors(error.detail.fields ?? { form: error.detail.message });
        }
      } else {
        setErrors({ form: 'No se pudo guardar la información. Volvé a intentarlo.' });
      }
    } finally {
      submittingRef.current = false;
      setSubmittingMode(null);
    }
  };

  return (
    <Card className="mt-6 min-w-0 overflow-hidden p-4 sm:p-6 lg:p-8">
      <form
        className="min-w-0 space-y-9 text-base"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        data-testid="integrated-prescription-form"
      >
        {errors.form && (
          <div
            className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-base font-semibold text-red-900"
            role="alert"
          >
            {errors.form}
          </div>
        )}
        {clientLoadError && (
          <div
            className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-base font-semibold text-red-900"
            role="alert"
          >
            No se pudo buscar clientes.
          </div>
        )}

        <section aria-labelledby="integrated-general" className="min-w-0">
          <div id="integrated-general">
            <SectionHeading
              number={1}
              title="Datos generales de la receta"
              description="Seleccioná el cliente e ingresá la información general de la receta."
            />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className={labelClassName}>
              <span>
                Cliente <span className="text-red-700">*</span>
              </span>
              {selectedClient ? (
                <div className="mt-2 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50 px-4">
                  <span className="font-bold text-teal-950">
                    {selectedClient.lastName}, {selectedClient.firstName}
                  </span>
                  {!fixedClient && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 text-base"
                      onClick={() => {
                        setSelectedClient(undefined);
                        setClientQuery('');
                        setClients([]);
                        update('clientId', '');
                      }}
                    >
                      Cambiar
                    </Button>
                  )}
                </div>
              ) : (
                <div className="relative mt-2">
                  <Search
                    className="pointer-events-none absolute top-6 left-4 -translate-y-1/2 text-slate-500"
                    size={20}
                    aria-hidden="true"
                  />
                  <input
                    autoFocus
                    type="search"
                    className={`${inputClassName} mt-0 pl-12`}
                    value={clientQuery}
                    onChange={(event) => {
                      clientSearchSequence.current += 1;
                      setClientQuery(event.target.value);
                      setClients([]);
                      setClientLoadError(false);
                    }}
                    aria-label="Buscar cliente para la receta"
                    aria-invalid={Boolean(errors.clientId)}
                    aria-describedby={errors.clientId ? 'clientId-error' : undefined}
                    placeholder="Nombre, apellido, DNI o teléfono"
                  />
                  {clientQuery.trim().length >= 2 && clients.length > 0 && (
                    <ul className="absolute z-20 mt-2 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-xl">
                      {clients.map((client) => (
                        <li key={client.id}>
                          <button
                            type="button"
                            className="min-h-12 w-full px-4 py-3 text-left text-base hover:bg-teal-50 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-teal-700"
                            onClick={() => {
                              setSelectedClient(client);
                              setClientQuery('');
                              setClients([]);
                              update('clientId', String(client.id));
                            }}
                          >
                            <span className="font-bold">
                              {client.lastName}, {client.firstName}
                            </span>
                            <span className="ml-2 text-slate-600">
                              {client.documentNumber ? `DNI ${client.documentNumber}` : 'Sin DNI'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <FieldError id="clientId-error" message={errors.clientId} />
            </div>
            <label className={labelClassName}>
              Fecha <span className="text-red-700">*</span>
              <input
                type="date"
                className={inputClassName}
                value={values.prescriptionDate}
                onChange={(event) => update('prescriptionDate', event.target.value)}
                aria-invalid={Boolean(errors.prescriptionDate)}
              />
              <FieldError id="prescriptionDate-error" message={errors.prescriptionDate} />
            </label>
            <label className={`${labelClassName} lg:col-span-2`}>
              Profesional <span className="font-normal text-slate-600">(opcional)</span>
              <input
                className={inputClassName}
                value={values.prescriberName}
                maxLength={PRESCRIPTION_FIELD_LIMITS.prescriberName}
                onChange={(event) => update('prescriberName', event.target.value)}
                aria-invalid={Boolean(errors.prescriberName)}
              />
              <FieldError id="prescriberName-error" message={errors.prescriberName} />
            </label>
          </div>
        </section>

        <fieldset className="min-w-0" aria-describedby="graduations-help">
          <legend className="sr-only">Graduaciones</legend>
          <SectionHeading
            number={2}
            title="Graduaciones"
            description="Completá sólo los casilleros informados. Un campo vacío queda sin valor; cero se conserva como dato real."
          />
          <p id="graduations-help" className="sr-only">
            Las tablas permiten desplazamiento horizontal interno en pantallas angostas.
          </p>
          <FieldError id="values-error" message={errors.values} />
          <div className="mt-5 space-y-5">
            {(['FAR', 'NEAR'] as const).map((distance) => (
              <section
                key={distance}
                className="min-w-0 overflow-hidden rounded-2xl border-2 border-teal-200 bg-white"
                aria-labelledby={`integrated-${distance.toLowerCase()}`}
              >
                <header className="border-b border-teal-200 bg-teal-50 px-5 py-4">
                  <h3
                    id={`integrated-${distance.toLowerCase()}`}
                    className="text-lg font-black tracking-[0.12em] text-teal-950 uppercase"
                  >
                    {distance === 'FAR' ? 'Lejos' : 'Cerca'}
                  </h3>
                </header>
                <div
                  className="max-w-full overflow-x-auto overscroll-x-contain"
                  tabIndex={0}
                  aria-label={`Tabla de graduación de ${distance === 'FAR' ? 'lejos' : 'cerca'}`}
                >
                  <table className="w-[860px] table-fixed border-collapse text-base xl:w-[940px]">
                    <caption className="sr-only">
                      Graduación de {distance === 'FAR' ? 'lejos' : 'cerca'} para OD y OI
                    </caption>
                    <colgroup>
                      <col className="w-24" />
                      {GRADUATION_COLUMNS.map(([, label]) => (
                        <col key={label} className="w-[152px] xl:w-[168px]" />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 text-sm font-black tracking-wide text-slate-700 uppercase">
                        <th className="sticky left-0 z-10 border-r border-teal-200 bg-teal-50 px-4 py-4 text-left">
                          Ojo
                        </th>
                        {GRADUATION_COLUMNS.map(([, label]) => (
                          <th key={label} className="px-3 py-4 text-left">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-teal-100">
                      {values.rows.map((row, index) =>
                        row.distance !== distance ? null : (
                          <tr key={`${distance}:${row.eye}`} className="group hover:bg-teal-50/40">
                            <th
                              className="sticky left-0 z-10 border-r border-teal-200 bg-white px-4 py-4 text-left group-hover:bg-teal-50"
                              scope="row"
                            >
                              <span className="inline-flex min-h-10 min-w-12 items-center justify-center rounded-lg border border-teal-300 bg-teal-50 px-2 font-black text-teal-900">
                                {row.eye}
                              </span>
                            </th>
                            {GRADUATION_COLUMNS.map(([field, shortLabel]) => {
                              const error = errors[`values.${index}.${field}`];
                              const accessibleLabel = `${shortLabel} ${distance === 'FAR' ? 'lejos' : 'cerca'} ${row.eye}`;
                              return (
                                <td key={field} className="px-3 py-3 align-top">
                                  <label
                                    className="sr-only"
                                    htmlFor={`integrated-value-${index}-${field}`}
                                  >
                                    {accessibleLabel}
                                  </label>
                                  <input
                                    id={`integrated-value-${index}-${field}`}
                                    inputMode={field === 'axis' ? 'numeric' : 'decimal'}
                                    className={`${inputClassName} mt-0 min-w-28 px-3 text-lg tabular-nums`}
                                    value={row[field]}
                                    onChange={(event) =>
                                      updateRow(index, field, event.target.value)
                                    }
                                    aria-label={accessibleLabel}
                                    aria-invalid={Boolean(error)}
                                  />
                                  {error && (
                                    <span
                                      className="mt-1 block text-sm font-semibold text-red-700"
                                      role="alert"
                                    >
                                      {error}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </fieldset>

        <section aria-labelledby="integrated-product" className="min-w-0">
          <div id="integrated-product">
            <SectionHeading
              number={3}
              title="Producto, cristal y tratamiento"
              description="Esta información se utilizará sólo si elegís guardar también el trabajo."
            />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <label className={labelClassName}>
              Número de ficha <span className="font-normal text-slate-600">(opcional)</span>
              <input
                className={inputClassName}
                value={values.jobNumber}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.jobNumber}
                onChange={(event) => update('jobNumber', event.target.value)}
                aria-invalid={Boolean(errors.jobNumber)}
              />
              <FieldError id="jobNumber-error" message={errors.jobNumber} />
            </label>
            <fieldset className="min-w-0 lg:col-span-2 xl:col-span-3">
              <legend className={labelClassName}>Producto (opcional)</legend>
              <p className="mt-1 text-sm font-normal text-slate-600">
                Podés dejarlo sin seleccionar si todavía no está definido.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PRODUCT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-base font-semibold transition focus-within:ring-3 focus-within:ring-teal-200 ${
                      productChoice === option.value
                        ? 'border-teal-700 bg-teal-50 text-teal-950 shadow-sm'
                        : 'border-slate-300 bg-white text-slate-800 hover:border-teal-400 hover:bg-teal-50/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="integrated-product-choice"
                      value={option.value}
                      checked={productChoice === option.value}
                      className="h-5 w-5 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      onChange={() => {
                        setProductChoice(option.value);
                        update('product', option.value === 'OTHER' ? '' : option.value);
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {productChoice === 'OTHER' && (
                <label className={`${labelClassName} mt-4`}>
                  Nombre del producto <span className="font-normal text-slate-600">(opcional)</span>
                  <input
                    autoFocus
                    className={inputClassName}
                    value={values.product}
                    maxLength={OPTICAL_JOB_FIELD_LIMITS.product}
                    onChange={(event) => update('product', event.target.value)}
                    aria-invalid={Boolean(errors.product)}
                  />
                </label>
              )}
              <FieldError id="product-error" message={errors.product} />
            </fieldset>
            <label className={labelClassName}>
              Cristal <span className="font-normal text-slate-600">(opcional)</span>
              <input
                className={inputClassName}
                value={values.lens}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.lens}
                onChange={(event) => update('lens', event.target.value)}
                aria-invalid={Boolean(errors.lens)}
              />
              <FieldError id="lens-error" message={errors.lens} />
            </label>
            <label className={labelClassName}>
              Marca <span className="font-normal text-slate-600">(opcional)</span>
              <input
                className={inputClassName}
                value={values.brand}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.brand}
                onChange={(event) => update('brand', event.target.value)}
                aria-invalid={Boolean(errors.brand)}
              />
              <FieldError id="brand-error" message={errors.brand} />
            </label>
            <label className={labelClassName}>
              Modelo <span className="font-normal text-slate-600">(opcional)</span>
              <input
                className={inputClassName}
                value={values.frameModel}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.frameModel}
                onChange={(event) => update('frameModel', event.target.value)}
                aria-invalid={Boolean(errors.frameModel)}
              />
              <FieldError id="frameModel-error" message={errors.frameModel} />
            </label>
            <label className={labelClassName}>
              Color <span className="font-normal text-slate-600">(opcional)</span>
              <input
                className={inputClassName}
                value={values.productColor}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.productColor}
                onChange={(event) => update('productColor', event.target.value)}
                aria-invalid={Boolean(errors.productColor)}
              />
              <FieldError id="productColor-error" message={errors.productColor} />
            </label>
            <label className={labelClassName}>
              Proveedor <span className="font-normal text-slate-600">(opcional)</span>
              <input
                className={inputClassName}
                value={values.supplier}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.supplier}
                onChange={(event) => update('supplier', event.target.value)}
                aria-invalid={Boolean(errors.supplier)}
              />
              <FieldError id="supplier-error" message={errors.supplier} />
            </label>
            <label className={labelClassName}>
              Coloración de los lentes
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
          </div>
          <div className="mt-7">
            <div>
              <label className={labelClassName} htmlFor="integrated-treatments">
                Tratamientos (opcional)
              </label>
              <textarea
                id="integrated-treatments"
                rows={5}
                className={`${inputClassName} resize-y py-3`}
                value={values.treatmentNames}
                onChange={(event) => update('treatmentNames', event.target.value)}
                aria-invalid={Boolean(errors.treatmentNames)}
                aria-describedby="integrated-treatments-help"
              />
              <span
                id="integrated-treatments-help"
                className="mt-2 block text-sm font-normal text-slate-600"
              >
                Escribí uno o varios tratamientos, separados por comas o saltos de línea.
              </span>
              <FieldError id="treatmentNames-error" message={errors.treatmentNames} />
            </div>
          </div>
        </section>

        <section aria-labelledby="integrated-frame">
          <div id="integrated-frame">
            <SectionHeading
              number={4}
              title="Armazón"
              description="Indicá si el armazón es nuevo o propio y su material."
            />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
            <label className={labelClassName}>
              Condición
              <select
                className={inputClassName}
                value={values.frameCondition}
                onChange={(event) => update('frameCondition', event.target.value)}
              >
                <option value="">Sin especificar</option>
                <option value="NEW">Nuevo</option>
                <option value="USED">Propio</option>
              </select>
            </label>
            <label className={labelClassName}>
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
          </div>
        </section>

        <section aria-labelledby="integrated-observations">
          <div id="integrated-observations">
            <SectionHeading
              number={5}
              title="Observaciones"
              description="Las observaciones de receta y trabajo se guardan por separado."
            />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <label className={labelClassName}>
              Observaciones de receta <span className="font-normal text-slate-600">(opcional)</span>
              <textarea
                rows={5}
                className={`${inputClassName} resize-y py-3`}
                value={values.prescriptionNotes}
                maxLength={PRESCRIPTION_FIELD_LIMITS.notes}
                onChange={(event) => update('prescriptionNotes', event.target.value)}
                aria-invalid={Boolean(errors.notes)}
              />
              <FieldError id="notes-error" message={errors.notes} />
            </label>
            <label className={labelClassName}>
              Observaciones del trabajo{' '}
              <span className="font-normal text-slate-600">(opcional)</span>
              <textarea
                rows={5}
                className={`${inputClassName} resize-y py-3`}
                value={values.jobObservations}
                maxLength={OPTICAL_JOB_FIELD_LIMITS.observations}
                onChange={(event) => update('jobObservations', event.target.value)}
                aria-invalid={Boolean(errors.observations)}
              />
              <FieldError id="observations-error" message={errors.observations} />
            </label>
          </div>
        </section>

        <section
          className="rounded-2xl border border-slate-300 bg-slate-50 p-4 sm:p-5"
          aria-labelledby="integrated-actions"
        >
          <h2 id="integrated-actions" className="text-lg font-black text-slate-950">
            Elegí qué querés guardar
          </h2>
          <p className="mt-1 text-base leading-6 text-slate-600">
            Guardar sólo receta ignora los campos del trabajo. La segunda opción crea ambos
            registros en una única operación.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 px-5 text-base"
              onClick={onCancel}
              disabled={submittingMode !== null}
            >
              <X size={19} aria-hidden="true" /> Cancelar
            </Button>
            <Button
              type="submit"
              name="saveMode"
              value="PRESCRIPTION_ONLY"
              variant="secondary"
              className="min-h-12 px-5 text-base"
              disabled={submittingMode !== null || clientLoadError}
            >
              <FileCheck2 size={19} aria-hidden="true" />
              {submittingMode === 'PRESCRIPTION_ONLY' ? 'Guardando…' : 'Guardar solo receta'}
            </Button>
            <Button
              type="submit"
              name="saveMode"
              value="PRESCRIPTION_AND_JOB"
              className="min-h-12 px-5 text-base"
              disabled={submittingMode !== null || clientLoadError}
            >
              {submittingMode === 'PRESCRIPTION_AND_JOB' ? (
                <Save size={19} aria-hidden="true" />
              ) : (
                <BriefcaseBusiness size={19} aria-hidden="true" />
              )}
              {submittingMode === 'PRESCRIPTION_AND_JOB'
                ? 'Guardando…'
                : 'Guardar receta y trabajo'}
            </Button>
          </div>
        </section>
      </form>
    </Card>
  );
}
