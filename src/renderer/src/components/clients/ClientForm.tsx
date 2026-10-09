import { Save, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  CLIENT_FIELD_LIMITS,
  ClientValidationError,
  parseCreateClientInput,
} from '../../../../shared/client-validation';
import type { Client, CreateClientInput } from '../../../../shared/database-models';
import { ClientRequestError } from '../../lib/client-api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type FormField =
  | 'firstName'
  | 'lastName'
  | 'documentNumber'
  | 'phone'
  | 'address'
  | 'birthDate'
  | 'notes'
  | 'form';

type FormErrors = Partial<Record<FormField, string>>;

interface ClientFormProps {
  initialClient?: Client;
  submitLabel: string;
  onSubmit: (input: CreateClientInput) => Promise<Client>;
  onCancel: () => void;
}

interface FormValues {
  firstName: string;
  lastName: string;
  documentNumber: string;
  phone: string;
  address: string;
  birthDate: string;
  notes: string;
}

function initialValues(client?: Client): FormValues {
  return {
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    documentNumber: client?.documentNumber ?? '',
    phone: client?.phone ?? '',
    address: client?.address ?? '',
    birthDate: client?.birthDate ?? '',
    notes: client?.notes ?? '',
  };
}

function errorsFromValidation(error: ClientValidationError): FormErrors {
  return Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message]));
}

const inputClassName =
  'mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-100';

function FieldError({ id, message }: { id: string; message?: string }): React.JSX.Element | null {
  return message ? (
    <p id={id} className="mt-1.5 text-xs font-semibold text-red-700" role="alert">
      {message}
    </p>
  ) : null;
}

export function ClientForm({
  initialClient,
  submitLabel,
  onSubmit,
  onCancel,
}: ClientFormProps): React.JSX.Element {
  const [values, setValues] = useState<FormValues>(() => initialValues(initialClient));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const updateValue = (field: keyof FormValues, value: string): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submittingRef.current) return;

    let input: CreateClientInput;
    try {
      input = parseCreateClientInput(values);
      setErrors({});
    } catch (error: unknown) {
      if (error instanceof ClientValidationError) {
        setErrors(errorsFromValidation(error));
        return;
      }
      setErrors({ form: 'No se pudieron validar los datos ingresados.' });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (error: unknown) {
      if (error instanceof ClientRequestError) {
        if (error.detail.code === 'DUPLICATE_DOCUMENT') {
          setErrors({ documentNumber: error.detail.message });
        } else if (error.detail.fields) {
          setErrors(error.detail.fields);
        } else {
          setErrors({ form: error.detail.message });
        }
      } else {
        setErrors({ form: 'No se pudo guardar el cliente. Volvé a intentarlo.' });
      }
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

        <div className="grid grid-cols-1 gap-x-5 gap-y-5 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-800">
            Nombre{' '}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(obligatorio)</span>
            <input
              autoFocus
              required
              value={values.firstName}
              onChange={(event) => updateValue('firstName', event.target.value)}
              maxLength={CLIENT_FIELD_LIMITS.firstName}
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
              className={inputClassName}
            />
            <FieldError id="firstName-error" message={errors.firstName} />
          </label>

          <label className="text-sm font-semibold text-slate-800">
            Apellido{' '}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(obligatorio)</span>
            <input
              required
              value={values.lastName}
              onChange={(event) => updateValue('lastName', event.target.value)}
              maxLength={CLIENT_FIELD_LIMITS.lastName}
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? 'lastName-error' : undefined}
              className={inputClassName}
            />
            <FieldError id="lastName-error" message={errors.lastName} />
          </label>

          <label className="text-sm font-semibold text-slate-800">
            DNI <span className="font-normal text-slate-500">(opcional)</span>
            <input
              inputMode="numeric"
              value={values.documentNumber}
              onChange={(event) => updateValue('documentNumber', event.target.value)}
              maxLength={30}
              aria-invalid={Boolean(errors.documentNumber)}
              aria-describedby={errors.documentNumber ? 'documentNumber-error' : undefined}
              className={inputClassName}
            />
            <FieldError id="documentNumber-error" message={errors.documentNumber} />
          </label>

          <label className="text-sm font-semibold text-slate-800">
            Teléfono <span className="font-normal text-slate-500">(opcional)</span>
            <input
              type="tel"
              value={values.phone}
              onChange={(event) => updateValue('phone', event.target.value)}
              maxLength={CLIENT_FIELD_LIMITS.phone}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              className={inputClassName}
            />
            <FieldError id="phone-error" message={errors.phone} />
          </label>

          <label className="text-sm font-semibold text-slate-800 md:col-span-2">
            Dirección <span className="font-normal text-slate-500">(opcional)</span>
            <input
              value={values.address}
              onChange={(event) => updateValue('address', event.target.value)}
              maxLength={CLIENT_FIELD_LIMITS.address}
              aria-invalid={Boolean(errors.address)}
              aria-describedby={errors.address ? 'address-error' : undefined}
              className={inputClassName}
            />
            <FieldError id="address-error" message={errors.address} />
          </label>

          <label className="text-sm font-semibold text-slate-800">
            Fecha de nacimiento <span className="font-normal text-slate-500">(opcional)</span>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={values.birthDate}
              onChange={(event) => updateValue('birthDate', event.target.value)}
              aria-invalid={Boolean(errors.birthDate)}
              aria-describedby={errors.birthDate ? 'birthDate-error' : undefined}
              className={inputClassName}
            />
            <FieldError id="birthDate-error" message={errors.birthDate} />
          </label>

          <label className="text-sm font-semibold text-slate-800 md:col-span-2">
            Observaciones <span className="font-normal text-slate-500">(opcional)</span>
            <textarea
              rows={4}
              value={values.notes}
              onChange={(event) => updateValue('notes', event.target.value)}
              maxLength={CLIENT_FIELD_LIMITS.notes}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'notes-error' : undefined}
              className={`${inputClassName} resize-y py-2.5`}
            />
            <FieldError id="notes-error" message={errors.notes} />
          </label>
        </div>

        <p className="mt-5 text-xs text-slate-500">* Campos obligatorios</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            <X size={17} aria-hidden="true" />
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            <Save size={17} aria-hidden="true" />
            {submitting ? 'Guardando…' : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
