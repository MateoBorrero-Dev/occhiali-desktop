import { ArrowLeft, Download, FileWarning, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { DeliveryReceipt, DeliveryReceiptEventType } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import {
  deliveryStatusLabel,
  formatDeliveryTimestamp,
  recipientTypeLabel,
  unwrapDeliveryReceiptResult,
} from '../lib/delivery-receipt-api';

function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <dt className="text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-slate-900">
        {value || 'No informado'}
      </dd>
    </div>
  );
}

export function DeliveryReceiptDetailPage(): React.JSX.Element {
  const receiptId = Number(useParams().id);
  const location = useLocation();
  const [receipt, setReceipt] = useState<DeliveryReceipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState(
    typeof (location.state as { message?: unknown } | null)?.message === 'string'
      ? (location.state as { message: string }).message
      : '',
  );
  const [eventType, setEventType] = useState<DeliveryReceiptEventType | null>(null);
  const [reason, setReason] = useState('');
  const [eventError, setEventError] = useState('');
  useEffect(() => {
    let active = true;
    window.optica.deliveryReceipts
      .get(receiptId)
      .then(unwrapDeliveryReceiptResult)
      .then((value) => active && setReceipt(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [receiptId, reload]);

  const exportPdf = async (): Promise<void> => {
    setExporting(true);
    setMessage('');
    try {
      const result = unwrapDeliveryReceiptResult(
        await window.optica.deliveryReceipts.exportPdf(receiptId),
      );
      setMessage(
        result.canceled
          ? 'Exportación cancelada. No se creó ningún archivo.'
          : `PDF exportado como ${result.fileName}.`,
      );
    } catch {
      setMessage('No se pudo exportar el PDF. Revisá el destino e intentá nuevamente.');
    } finally {
      setExporting(false);
    }
  };

  const addEvent = async (): Promise<void> => {
    if (!eventType) return;
    setEventError('');
    try {
      const updated = unwrapDeliveryReceiptResult(
        await window.optica.deliveryReceipts.addEvent({ receiptId, type: eventType, reason }),
      );
      setReceipt(updated);
      setEventType(null);
      setReason('');
      setMessage(
        eventType === 'ANNULLED'
          ? 'Comprobante anulado. Los datos originales se conservaron.'
          : 'Aclaración agregada al historial.',
      );
    } catch (error: unknown) {
      setEventError(error instanceof Error ? error.message : 'No se pudo registrar el evento.');
    }
  };

  if (failed)
    return (
      <Card>
        <EmptyState
          icon={RefreshCw}
          title="No pudimos cargar el comprobante"
          description="El registro no existe o el almacenamiento no está disponible."
          action={
            <Button
              onClick={() => {
                setFailed(false);
                setReload((value) => value + 1);
              }}
            >
              Reintentar
            </Button>
          }
        />
      </Card>
    );
  if (!receipt)
    return (
      <p className="py-24 text-center text-sm font-semibold" role="status">
        Cargando comprobante…
      </p>
    );
  const isAnnulled = receipt.status === 'ANNULLED';
  const frameCondition =
    receipt.frameCondition === 'NEW' ? 'Nuevo' : receipt.frameCondition === 'USED' ? 'Usado' : null;
  const frameMaterial =
    receipt.frameMaterial === 'ZILO' ? 'Zilo' : receipt.frameMaterial === 'METAL' ? 'Metal' : null;
  const colorType =
    receipt.colorType === 'FULL'
      ? 'Color pleno'
      : receipt.colorType === 'GRADIENT'
        ? 'Color degradé'
        : null;
  return (
    <div>
      <PageHeader
        eyebrow="Comprobante de retiro"
        title={receipt.receiptNumber}
        description={`Ficha ${receipt.jobNumber ?? `#${receipt.opticalJobId}`} · ${deliveryStatusLabel(receipt.status)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/trabajos/${receipt.opticalJobId}`}
              className={buttonStyles({ variant: 'secondary' })}
            >
              <ArrowLeft size={17} />
              Ver ficha
            </Link>
            <Button onClick={() => void exportPdf()} disabled={exporting}>
              <Download size={17} />
              {exporting ? 'Exportando…' : 'Exportar PDF'}
            </Button>
          </div>
        }
      />
      {message && (
        <div
          className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-900"
          role="status"
        >
          {message}
        </div>
      )}
      {isAnnulled && (
        <div className="mt-5 rounded-lg border-2 border-red-400 bg-red-50 p-4 text-center font-black text-red-800">
          COMPROBANTE ANULADO
        </div>
      )}
      {receipt.status === 'CORRECTED' && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-center font-bold text-amber-900">
          COMPROBANTE CON ACLARACIONES
        </div>
      )}
      <Card className="mx-auto mt-6 max-w-[900px] p-6 print:max-w-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-teal-700 pb-5">
          <div>
            <p className="text-xl font-black tracking-[0.18em] text-teal-700">OCCHIALI</p>
            <h2 className="mt-1 text-lg font-bold">Comprobante de retiro de producto</h2>
          </div>
          <p className="text-right font-bold">
            {receipt.receiptNumber}
            <br />
            <span className="text-sm text-slate-600">
              Ficha {receipt.jobNumber ?? `#${receipt.opticalJobId}`}
            </span>
          </p>
        </div>
        <section className="mt-6">
          <h3 className="border-b border-teal-200 pb-2 text-sm font-black tracking-wide text-teal-800 uppercase">
            Cliente titular
          </h3>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Nombre y apellido"
              value={`${receipt.clientFirstName} ${receipt.clientLastName}`}
            />
            <Field label="DNI" value={receipt.clientDocumentNumber} />
            <Field label="Teléfono" value={receipt.clientPhone} />
          </dl>
        </section>
        <section className="mt-7">
          <h3 className="border-b border-teal-200 pb-2 text-sm font-black tracking-wide text-teal-800 uppercase">
            Producto entregado
          </h3>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Producto" value={receipt.product} />
            {receipt.frameModel && <Field label="Armazón / modelo" value={receipt.frameModel} />}
            {frameCondition && <Field label="Condición del armazón" value={frameCondition} />}
            {frameMaterial && <Field label="Material del armazón" value={frameMaterial} />}
            {receipt.productColor && <Field label="Color" value={receipt.productColor} />}
            {receipt.supplier && <Field label="Proveedor" value={receipt.supplier} />}
            {receipt.treatmentNames.length > 0 && (
              <Field label="Tratamientos y acabados" value={receipt.treatmentNames.join(', ')} />
            )}
            {colorType && <Field label="Coloración de lentes" value={colorType} />}
            {receipt.productObservations && (
              <Field label="Observaciones del producto" value={receipt.productObservations} wide />
            )}
          </dl>
        </section>
        <section className="mt-7">
          <h3 className="border-b border-teal-200 pb-2 text-sm font-black tracking-wide text-teal-800 uppercase">
            Entrega
          </h3>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Fecha y hora efectiva"
              value={formatDeliveryTimestamp(receipt.deliveredAt)}
            />
            <Field
              label="Fecha y hora de registro"
              value={formatDeliveryTimestamp(receipt.registeredAt)}
            />
            <Field label="Persona que retira" value={receipt.recipientFullName} />
            <Field label="DNI de quien retira" value={receipt.recipientDocumentNumber} />
            <Field label="Carácter" value={recipientTypeLabel(receipt.recipientType)} />
            <Field label="Vínculo" value={receipt.recipientRelationship} />
            <Field label="Referencia de autorización" value={receipt.authorizationReference} wide />
            <Field label="Responsable de entrega" value={receipt.deliveredBy} />
            <Field label="Observaciones" value={receipt.deliveryNotes} wide />
          </dl>
        </section>
        <p className="mt-7 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm">
          Se registró la entrega del producto indicado a la persona identificada. Los espacios
          inferiores son para firmas manuscritas en la impresión; este sistema no captura firma
          digital.
        </p>
        <div className="mt-14 grid grid-cols-2 gap-12 text-center text-sm">
          <div className="border-t border-slate-500 pt-2">Firma de quien retira</div>
          <div className="border-t border-slate-500 pt-2">Firma de quien entrega</div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-500">
          No es factura ni comprobante fiscal.
        </p>
      </Card>
      <Card className="mt-6 p-6">
        <h2 className="font-bold">Historial y trazabilidad</h2>
        {receipt.events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Sin aclaraciones ni anulaciones.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {receipt.events.map((event) => (
              <li key={event.id} className="rounded-lg border border-slate-200 p-4 text-sm">
                <strong>
                  {event.type === 'ANNULLED' ? 'Anulación' : 'Aclaración'} ·{' '}
                  {formatDeliveryTimestamp(event.createdAt)}
                </strong>
                <p className="mt-1 whitespace-pre-wrap">{event.reason}</p>
              </li>
            ))}
          </ol>
        )}
        {!isAnnulled && !eventType && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEventType('CORRECTION_NOTE')}>
              Registrar aclaración
            </Button>
            <Button variant="secondary" onClick={() => setEventType('ANNULLED')}>
              <FileWarning size={17} />
              Anular comprobante
            </Button>
          </div>
        )}
        {eventType && (
          <div
            className={`mt-5 rounded-lg border p-4 ${eventType === 'ANNULLED' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}
          >
            <h3 className="font-bold">
              {eventType === 'ANNULLED' ? 'Confirmar anulación' : 'Agregar aclaración histórica'}
            </h3>
            <p className="mt-1 text-sm">
              Los datos originales no se modificarán. El motivo quedará registrado permanentemente.
            </p>
            <label className="mt-3 block text-sm font-semibold">
              Motivo
              <textarea
                className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {eventError && (
              <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
                {eventError}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEventType(null);
                  setReason('');
                }}
              >
                Cancelar
              </Button>
              <Button onClick={() => void addEvent()} disabled={!reason.trim()}>
                {eventType === 'ANNULLED' ? 'Confirmar anulación' : 'Guardar aclaración'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
