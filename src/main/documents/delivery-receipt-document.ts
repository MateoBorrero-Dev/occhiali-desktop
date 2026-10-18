import type { DeliveryReceipt } from '../../shared/database-models';

export function escapeHtml(value: string | number | null | undefined): string {
  const text = value == null ? '' : typeof value === 'number' ? String(value) : value;
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const dateTime = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
});

function shown(value: string | null): string {
  return value ? escapeHtml(value) : 'No informado';
}

function row(label: string, value: string): string {
  return `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
}

export function renderDeliveryReceiptHtml(receipt: DeliveryReceipt): string {
  const isThirdParty = receipt.recipientType === 'AUTHORIZED_THIRD_PARTY';
  const statusBanner =
    receipt.status === 'ANNULLED'
      ? '<div class="status annulled">COMPROBANTE ANULADO</div>'
      : receipt.status === 'CORRECTED'
        ? '<div class="status corrected">COMPROBANTE CON ACLARACIONES</div>'
        : '';
  const events = receipt.events
    .map(
      (event) =>
        `<li><strong>${event.type === 'ANNULLED' ? 'Anulación' : 'Aclaración'} · ${escapeHtml(dateTime.format(new Date(event.createdAt)))}</strong><br>${escapeHtml(event.reason)}</li>`,
    )
    .join('');
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
  const productDetails = [
    row('Producto', shown(receipt.product)),
    receipt.frameModel ? row('Armazón / modelo', shown(receipt.frameModel)) : '',
    frameCondition ? row('Condición del armazón', frameCondition) : '',
    frameMaterial ? row('Material del armazón', frameMaterial) : '',
    receipt.productColor ? row('Color', shown(receipt.productColor)) : '',
    receipt.supplier ? row('Proveedor', shown(receipt.supplier)) : '',
    receipt.treatmentNames.length
      ? row('Tratamientos y acabados', escapeHtml(receipt.treatmentNames.join(', ')))
      : '',
    colorType ? row('Coloración de lentes', colorType) : '',
    receipt.productObservations
      ? `<div class="wide">${row('Observaciones del producto', shown(receipt.productObservations))}</div>`
      : '',
  ].join('');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(receipt.receiptNumber)}</title>
<style>
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; } body { margin: 0; color: #0f172a; font: 12px Arial, sans-serif; line-height: 1.45; }
header { border-bottom: 3px solid #0f766e; padding-bottom: 12px; display:flex; justify-content:space-between; gap:24px; }
.brand { color:#0f766e; font-size:22px; font-weight:800; letter-spacing:2px; } h1 { margin:4px 0 0; font-size:18px; }
.number { text-align:right; font-size:14px; font-weight:700; } section { margin-top:16px; break-inside:avoid; }
h2 { margin:0 0 9px; color:#115e59; font-size:13px; text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid #99f6e4; padding-bottom:5px; }
dl { margin:0; display:grid; grid-template-columns:1fr 1fr; gap:8px 18px; }.field { min-width:0; } dt { color:#64748b; font-size:10px; font-weight:700; text-transform:uppercase; } dd { margin:2px 0 0; white-space:pre-wrap; overflow-wrap:anywhere; font-weight:600; }
.wide { grid-column:1/-1; }.status { margin:14px 0; padding:10px; text-align:center; font-weight:800; border:2px solid; }.annulled { color:#991b1b; border-color:#dc2626; background:#fef2f2; }.corrected { color:#92400e; border-color:#d97706; background:#fffbeb; }
ul { margin:5px 0 0; padding-left:18px; } li { margin-top:6px; }.declaration { margin-top:18px; padding:10px 12px; background:#f0fdfa; border:1px solid #99f6e4; }
.signatures { margin-top:34px; display:grid; grid-template-columns:1fr 1fr; gap:45px; break-inside:avoid; }.signature { padding-top:7px; border-top:1px solid #334155; text-align:center; }
footer { margin-top:25px; color:#64748b; font-size:9px; text-align:center; }
</style></head><body>
<header><div><div class="brand">OCCHIALI</div><h1>Comprobante de retiro de producto</h1></div><div class="number">${escapeHtml(receipt.receiptNumber)}<br>Ficha ${shown(receipt.jobNumber)}</div></header>
${statusBanner}
<section><h2>Cliente titular</h2><dl>${row('Nombre y apellido', `${escapeHtml(receipt.clientFirstName)} ${escapeHtml(receipt.clientLastName)}`)}${row('DNI', shown(receipt.clientDocumentNumber))}${row('Teléfono', shown(receipt.clientPhone))}</dl></section>
<section><h2>Producto entregado</h2><dl>${productDetails}</dl></section>
<section><h2>Entrega</h2><dl>${row('Fecha y hora efectiva', escapeHtml(dateTime.format(new Date(receipt.deliveredAt))))}${row('Fecha y hora de registro', escapeHtml(dateTime.format(new Date(receipt.registeredAt))))}${row('Persona que retira', escapeHtml(receipt.recipientFullName))}${row('DNI de quien retira', shown(receipt.recipientDocumentNumber))}${row('Carácter', isThirdParty ? 'Tercero autorizado' : 'Cliente titular')}${row('Vínculo', isThirdParty ? shown(receipt.recipientRelationship) : 'Titular')}${isThirdParty ? `<div class="wide">${row('Referencia de autorización', shown(receipt.authorizationReference))}</div>` : ''}${row('Responsable de entrega', escapeHtml(receipt.deliveredBy))}<div class="wide">${row('Observaciones de entrega', shown(receipt.deliveryNotes))}</div></dl></section>
${events ? `<section><h2>Trazabilidad</h2><ul>${events}</ul></section>` : ''}
<p class="declaration">Se deja constancia de que la usuaria registró la entrega del producto indicado a la persona identificada en este comprobante. Los espacios siguientes corresponden a firmas manuscritas sobre la impresión.</p>
<div class="signatures"><div class="signature">Firma de quien retira</div><div class="signature">Firma de quien entrega</div></div>
<footer>Este documento acredita un registro de entrega. No es factura, comprobante fiscal ni firma digital.</footer>
</body></html>`;
}
