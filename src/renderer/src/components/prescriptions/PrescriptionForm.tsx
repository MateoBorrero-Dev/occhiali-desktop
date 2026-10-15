import { Save, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  Client,
  CorrectPrescriptionInput,
  CreatePrescriptionInput,
  CreatePrescriptionValueInput,
  Prescription,
  PrescriptionDistance,
  Eye,
} from '../../../../shared/database-models';
import {
  parseCorrectPrescriptionInput,
  parseCreatePrescriptionInput,
  PRESCRIPTION_FIELD_LIMITS,
  PrescriptionValidationError,
} from '../../../../shared/prescription-validation';
import { unwrapClientResult } from '../../lib/client-api';
import { PrescriptionRequestError } from '../../lib/prescription-api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface PrescriptionFormProps {
  fixedClient?: Client;
  initialPrescription?: Prescription;
  correction?: boolean;
  submitLabel: string;
  onSubmit: (input: CreatePrescriptionInput | CorrectPrescriptionInput) => Promise<Prescription>;
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
  notes: string;
  reason: string;
  rows: OpticalRow[];
}

type FormErrors = Record<string, string | undefined>;

const ROWS: readonly [PrescriptionDistance, Eye][] = [
  ['FAR', 'OD'],
  ['FAR', 'OI'],
  ['NEAR', 'OD'],
  ['NEAR', 'OI'],
];

const inputClassName =
  'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 aria-[invalid=true]:border-red-500';

function makeRows(prescription?: Prescription): OpticalRow[] {
  return ROWS.map(([distance, eye]) => {
    const value = prescription?.values.find(
      (item) => item.distance === distance && item.eye === eye,
    );
    return {
      distance,
      eye,
      sphere: value?.sphere ?? '',
      cylinder: value?.cylinder ?? '',
      axis: value?.axis?.toString() ?? '',
      dip: value?.dip ?? '',
      height: value?.height ?? '',
    };
  });
}

function initialValues(fixedClient?: Client, prescription?: Prescription): FormValues {
  return {
    clientId: String(fixedClient?.id ?? prescription?.clientId ?? ''),
    prescriptionDate: prescription?.prescriptionDate ?? new Date().toISOString().slice(0, 10),
    prescriberName: prescription?.prescriberName ?? '',
    notes: prescription?.notes ?? '',
    reason: '',
    rows: makeRows(prescription),
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

function errorMap(error: PrescriptionValidationError): FormErrors {
  return Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message]));
}

function FieldError({ id, message }: { id: string; message?: string }): React.JSX.Element | null {
  return message ? (
    <p id={id} className="mt-1.5 text-xs font-semibold text-red-700" role="alert">
      {message}
    </p>
  ) : null;
}

export function PrescriptionForm({
  fixedClient,
  initialPrescription,
  correction = false,
  submitLabel,
  onSubmit,
  onCancel,
}: PrescriptionFormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(fixedClient, initialPrescription),
  );
  const [selectedClient, setSelectedClient] = useState<Client | undefined>(fixedClient);
  const [clientQuery, setClientQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [clientLoadError, setClientLoadError] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const clientSearchSequence = useRef(0);

  useEffect(() => {
    if (fixedClient || correction) return;
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
  }, [clientQuery, correction, fixedClient]);

  const update = (field: keyof Omit<FormValues, 'rows'>, value: string): void => {
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submittingRef.current) return;
    try {
      const core = {
        prescriptionDate: values.prescriptionDate,
        prescriberName: values.prescriberName,
        notes: values.notes,
        values: toOpticalValues(values.rows),
      };
      const input = correction
        ? parseCorrectPrescriptionInput({ ...core, reason: values.reason })
        : parseCreatePrescriptionInput({ ...core, clientId: Number(values.clientId) });
      setErrors({});
      submittingRef.current = true;
      setSubmitting(true);
      await onSubmit(input);
    } catch (error: unknown) {
      if (error instanceof PrescriptionValidationError) setErrors(errorMap(error));
      else if (error instanceof PrescriptionRequestError) {
        setErrors(error.detail.fields ?? { form: error.detail.message });
      } else setErrors({ form: 'No se pudo guardar la receta. Volvé a intentarlo.' });
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
        {clientLoadError && (
          <div
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
            role="alert"
          >
            No se pudo buscar clientes.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-800">
            Cliente{' '}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
            {fixedClient || correction ? (
              <input
                className={`${inputClassName} mt-1.5 bg-slate-100`}
                value={
                  fixedClient
                    ? `${fixedClient.lastName}, ${fixedClient.firstName}`
                    : `Cliente #${initialPrescription?.clientId ?? ''}`
                }
                disabled
              />
            ) : selectedClient ? (
              <div className="mt-1.5 flex min-h-10 items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3">
                <span className="text-sm font-semibold text-teal-950">
                  {selectedClient.lastName}, {selectedClient.firstName}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedClient(undefined);
                    setClientQuery('');
                    setClients([]);
                    update('clientId', '');
                  }}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative mt-1.5">
                <Search
                  size={17}
                  className="pointer-events-none absolute top-5 left-3 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  type="search"
                  className={`${inputClassName} pl-10`}
                  value={clientQuery}
                  onChange={(event) => {
                    clientSearchSequence.current += 1;
                    setClientQuery(event.target.value);
                    setClients([]);
                    setClientLoadError(false);
                  }}
                  placeholder="Nombre, apellido, DNI o teléfono"
                  aria-label="Buscar cliente para la receta"
                  aria-invalid={Boolean(errors.clientId)}
                />
                {clientQuery.trim().length >= 2 && clients.length > 0 && (
                  <ul className="absolute z-20 mt-2 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {clients.map((client) => (
                      <li key={client.id}>
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700"
                          onClick={() => {
                            setSelectedClient(client);
                            setClientQuery('');
                            setClients([]);
                            update('clientId', String(client.id));
                          }}
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
              </div>
            )}
            <FieldError id="clientId-error" message={errors.clientId} />
          </label>
          <label className="text-sm font-semibold text-slate-800">
            Fecha de prescripción{' '}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
            <input
              required
              type="date"
              className={`${inputClassName} mt-1.5`}
              value={values.prescriptionDate}
              onChange={(event) => update('prescriptionDate', event.target.value)}
              aria-invalid={Boolean(errors.prescriptionDate)}
            />
            <FieldError id="prescriptionDate-error" message={errors.prescriptionDate} />
          </label>
          <label className="text-sm font-semibold text-slate-800 md:col-span-2">
            Profesional prescriptor <span className="font-normal text-slate-500">(opcional)</span>
            <input
              className={`${inputClassName} mt-1.5`}
              value={values.prescriberName}
              maxLength={PRESCRIPTION_FIELD_LIMITS.prescriberName}
              onChange={(event) => update('prescriberName', event.target.value)}
              aria-invalid={Boolean(errors.prescriberName)}
            />
            <FieldError id="prescriberName-error" message={errors.prescriberName} />
          </label>
        </div>

        <fieldset className="mt-7">
          <legend className="text-base font-bold text-slate-950">Graduaciones</legend>
          <p className="mt-1 text-sm text-slate-600">
            Completá solo los valores informados. Los campos vacíos se conservan como no informados.
          </p>
          {errors.values && (
            <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
              {errors.values}
            </p>
          )}
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-slate-50 text-xs font-bold tracking-wide text-slate-600 uppercase">
                <tr>
                  <th className="px-3 py-3 text-left">Visión</th>
                  <th className="px-3 py-3 text-left">Ojo</th>
                  {['ESF', 'CIL', 'EJE', 'DIP', 'ALT'].map((label) => (
                    <th key={label} className="px-2 py-3 text-left">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {values.rows.map((row, index) => (
                  <tr key={`${row.distance}:${row.eye}`}>
                    <th className="px-3 py-3 text-left font-semibold" scope="row">
                      {row.distance === 'FAR' ? 'Lejos' : 'Cerca'}
                    </th>
                    <td className="px-3 py-3 font-semibold text-slate-600">{row.eye}</td>
                    {(['sphere', 'cylinder', 'axis', 'dip', 'height'] as const).map((field) => {
                      const error = errors[`values.${index}.${field}`];
                      const label = `${field === 'sphere' ? 'ESF' : field === 'cylinder' ? 'CIL' : field === 'axis' ? 'EJE' : field === 'dip' ? 'DIP' : 'ALT'} ${row.distance === 'FAR' ? 'lejos' : 'cerca'} ${row.eye}`;
                      return (
                        <td key={field} className="px-2 py-2 align-top">
                          <label className="sr-only" htmlFor={`value-${index}-${field}`}>
                            {label}
                          </label>
                          <input
                            id={`value-${index}-${field}`}
                            inputMode={field === 'axis' ? 'numeric' : 'decimal'}
                            className={`${inputClassName} min-w-24 px-2`}
                            placeholder={field === 'axis' ? '0–180' : '0,00'}
                            value={row[field]}
                            onChange={(event) => updateRow(index, field, event.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-label={label}
                          />
                          {error && (
                            <span
                              className="mt-1 block max-w-32 text-xs font-semibold text-red-700"
                              role="alert"
                            >
                              {error}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>

        <label className="mt-6 block text-sm font-semibold text-slate-800">
          Observaciones <span className="font-normal text-slate-500">(opcional)</span>
          <textarea
            rows={4}
            className={`${inputClassName} mt-1.5 resize-y py-2.5`}
            value={values.notes}
            maxLength={PRESCRIPTION_FIELD_LIMITS.notes}
            onChange={(event) => update('notes', event.target.value)}
            aria-invalid={Boolean(errors.notes)}
          />
          <FieldError id="notes-error" message={errors.notes} />
        </label>

        {correction && (
          <label className="mt-5 block text-sm font-semibold text-slate-800">
            Motivo de la corrección{' '}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
            <textarea
              rows={3}
              className={`${inputClassName} mt-1.5 resize-y py-2.5`}
              value={values.reason}
              maxLength={PRESCRIPTION_FIELD_LIMITS.reason}
              onChange={(event) => update('reason', event.target.value)}
              aria-invalid={Boolean(errors.reason)}
            />
            <FieldError id="reason-error" message={errors.reason} />
          </label>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            <X size={17} aria-hidden="true" />
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || clientLoadError}>
            <Save size={17} aria-hidden="true" />
            {submitting ? 'Guardando…' : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
