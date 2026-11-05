import {
  ArrowLeft,
  Download,
  FileWarning,
  MessageCircle,
  Paperclip,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { DeliveryReceipt, DeliveryReceiptEventType } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import {
  DeliveryReceiptRequestError,
  deliveryStatusLabel,
  formatDeliveryTimestamp,
  recipientTypeLabel,
  unwrapDeliveryReceiptResult,
} from '../lib/delivery-receipt-api';
import { WHATSAPP_MESSAGE_LIMIT } from '../../../shared/whatsapp-validation';

function initialWhatsAppMessage(receipt: DeliveryReceipt): string {
  const state =
    receipt.status === 'ANNULLED'
      ? ' Este comprobante se encuentra anulado.'
      : receipt.status === 'CORRECTED'
        ? ' Este comprobante contiene aclaraciones.'
        : '';
  return `Hola, te compartimos el comprobante de retiro ${receipt.receiptNumber} de Occhiali.${state} ¡Muchas gracias!`;
}

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
  const requestedReturnTo = new URLSearchParams(location.search).get('returnTo');
  const returnTo =
    requestedReturnTo && /^\/retiros(?:\?.*)?$/.test(requestedReturnTo)
      ? requestedReturnTo
      : '/retiros';
  const [receipt, setReceipt] = useState<DeliveryReceipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePhone, setSharePhone] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareConfirmed, setShareConfirmed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareErrors, setShareErrors] = useState<Record<string, string>>({});
  const [shareResult, setShareResult] = useState('');
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

  const openSharePanel = (current: DeliveryReceipt): void => {
    setSharePhone(current.clientPhone ?? '');
    setShareMessage(initialWhatsAppMessage(current));
    setShareConfirmed(false);
    setShareErrors({});
    setShareResult('');
    setShareOpen(true);
  };

  const shareWhatsApp = async (): Promise<void> => {
    setSharing(true);
    setShareErrors({});
    setShareResult('');
    try {
      const result = unwrapDeliveryReceiptResult(
        await window.optica.deliveryReceipts.shareWhatsApp(receiptId, {
          phone: sharePhone,
          message: shareMessage,
        }),
      );
      setShareResult(
        `Se preparó ${result.fileName} y se abrió WhatsApp. Adjuntá manualmente el PDF que quedó seleccionado en el Explorador y revisá el mensaje antes de enviarlo.`,
      );
    } catch (error: unknown) {
      if (error instanceof DeliveryReceiptRequestError) {
        setShareErrors(error.detail.fields ?? { form: error.detail.message });
      } else {
        setShareErrors({ form: 'No se pudo preparar el envío. Volvé a intentarlo.' });
      }
    } finally {
      setSharing(false);
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
            <Link to={returnTo} className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft size={17} aria-hidden="true" />
              Volver a retiros
            </Link>
            <Link
              to={`/fichas/trabajo/${receipt.opticalJobId}`}
              className={buttonStyles({ variant: 'secondary' })}
            >
              Ver ficha
            </Link>
            <Button onClick={() => void exportPdf()} disabled={exporting}>
              <Download size={17} />
              {exporting ? 'Exportando…' : 'Exportar PDF'}
            </Button>
            <Button variant="secondary" onClick={() => openSharePanel(receipt)}>
              <MessageCircle size={17} aria-hidden="true" />
              Compartir por WhatsApp
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
      {shareOpen && (
        <Card
          className="mt-5 border-teal-300 p-5 sm:p-6"
          role="dialog"
          aria-modal="false"
          aria-labelledby="whatsapp-share-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !sharing) setShareOpen(false);
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="whatsapp-share-title" className="text-xl font-black text-slate-950">
                Compartir comprobante por WhatsApp
              </h2>
              <p className="mt-1 text-base text-slate-600">
                Revisá los datos. Occhiali abrirá WhatsApp, pero el PDF se adjunta y se envía
                manualmente.
              </p>
            </div>
            <Button variant="ghost" onClick={() => setShareOpen(false)} disabled={sharing}>
              Cerrar
            </Button>
          </div>
          <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-bold text-slate-600">Cliente</dt>
              <dd className="mt-1 text-base font-semibold text-slate-950">
                {receipt.clientFirstName} {receipt.clientLastName}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-bold text-slate-600">Comprobante</dt>
              <dd className="mt-1 text-base font-semibold text-slate-950">
                {receipt.receiptNumber} · {deliveryStatusLabel(receipt.status)}
              </dd>
            </div>
          </dl>
          <div className="mt-5 grid gap-5">
            <div className="text-base font-semibold text-slate-800">
              <label htmlFor="whatsapp-share-phone">Teléfono del destinatario</label>
              <input
                id="whatsapp-share-phone"
                autoFocus
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus-visible:border-teal-700 focus-visible:ring-3 focus-visible:ring-teal-100"
                value={sharePhone}
                disabled={sharing}
                onChange={(event) => {
                  setSharePhone(event.target.value);
                  setShareConfirmed(false);
                  setShareErrors((current) => ({ ...current, phone: '', form: '' }));
                }}
                placeholder="Ejemplo: +54 9 351 1234567"
                aria-invalid={Boolean(shareErrors.phone)}
              />
              {shareErrors.phone && (
                <span className="mt-2 block text-sm font-semibold text-red-700" role="alert">
                  {shareErrors.phone}
                </span>
              )}
              <span className="mt-2 block text-sm font-normal text-slate-600">
                Este número se usa sólo para este envío y no modifica la ficha del cliente.
              </span>
            </div>
            <div className="text-base font-semibold text-slate-800">
              <label htmlFor="whatsapp-share-message">Mensaje</label>
              <textarea
                id="whatsapp-share-message"
                rows={5}
                maxLength={WHATSAPP_MESSAGE_LIMIT}
                className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus-visible:border-teal-700 focus-visible:ring-3 focus-visible:ring-teal-100"
                value={shareMessage}
                disabled={sharing}
                onChange={(event) => {
                  setShareMessage(event.target.value);
                  setShareConfirmed(false);
                  setShareErrors((current) => ({ ...current, message: '', form: '' }));
                }}
                aria-invalid={Boolean(shareErrors.message)}
              />
              {shareErrors.message && (
                <span className="mt-2 block text-sm font-semibold text-red-700" role="alert">
                  {shareErrors.message}
                </span>
              )}
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base text-amber-950">
            <p className="font-bold">El envío no es automático</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Occhiali prepara el PDF y lo muestra en el Explorador.</li>
              <li>WhatsApp se abre con el destinatario y el mensaje.</li>
              <li>Adjuntá el PDF, revisá todo y presioná Enviar en WhatsApp.</li>
            </ol>
          </div>
          <label className="mt-5 flex min-h-12 items-start gap-3 text-base font-semibold text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-teal-700"
              checked={shareConfirmed}
              disabled={sharing}
              onChange={(event) => setShareConfirmed(event.target.checked)}
            />
            Confirmo que revisé el destinatario y comprendo que debo adjuntar y enviar el PDF
            manualmente.
          </label>
          {shareErrors.form && (
            <p className="mt-3 text-base font-semibold text-red-700" role="alert">
              {shareErrors.form}
            </p>
          )}
          {shareResult && (
            <p
              className="mt-4 rounded-xl border border-teal-300 bg-teal-50 p-4 text-base font-semibold text-teal-950"
              role="status"
            >
              {shareResult}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setShareOpen(false)} disabled={sharing}>
              Cancelar
            </Button>
            <Button onClick={() => void shareWhatsApp()} disabled={sharing || !shareConfirmed}>
              <Paperclip size={17} aria-hidden="true" />
              {sharing ? 'Preparando…' : 'Preparar PDF y abrir WhatsApp'}
            </Button>
          </div>
        </Card>
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
          Este comprobante constituye un registro digital de la entrega del producto indicado a la
          persona identificada.
        </p>
        <p className="mt-6 text-center text-xs text-slate-500">
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
