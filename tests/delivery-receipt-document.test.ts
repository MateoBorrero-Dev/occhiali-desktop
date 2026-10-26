import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderDeliveryReceiptHtml,
} from '../src/main/documents/delivery-receipt-document';
import type { DeliveryReceipt } from '../src/shared/database-models';

const RECEIPT: DeliveryReceipt = {
  id: 1,
  receiptNumber: 'RET-000001',
  opticalJobId: 2,
  deliveredAt: '2026-10-17T16:00:00.000Z',
  registeredAt: '2026-10-17T16:01:00.000Z',
  status: 'CONFIRMED',
  clientFirstName: 'José <script>alert(1)</script>',
  clientLastName: 'Pérez & Ñ',
  clientDocumentNumber: null,
  clientPhone: null,
  jobNumber: 'F-1',
  product: 'Anteojos',
  lens: null,
  brand: null,
  frameCondition: null,
  frameMaterial: null,
  frameModel: null,
  productColor: null,
  supplier: null,
  colorType: null,
  productObservations: 'áéíóú',
  treatmentNames: ['AR “especial”'],
  recipientType: 'OWNER',
  recipientFullName: 'José Pérez',
  recipientDocumentNumber: null,
  recipientRelationship: null,
  authorizationReference: null,
  authorizationConfirmed: false,
  deliveredBy: 'Responsable',
  deliveryNotes: null,
  deliveryConfirmed: true,
  events: [],
};

describe('documento de retiro', () => {
  it('escapa HTML no confiable y conserva caracteres especiales', () => {
    const html = renderDeliveryReceiptHtml(RECEIPT);
    expect(html).toContain('José &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Pérez &amp; Ñ');
    expect(html).toContain('AR “especial”');
  });

  it('genera estructura A4 sin controles de interfaz y con firmas manuscritas', () => {
    const html = renderDeliveryReceiptHtml(RECEIPT);
    expect(html).toContain('@page { size: A4');
    expect(html).toContain('Firma de quien retira');
    expect(html).toContain('No es factura');
    expect(html).not.toContain('<button');
  });

  it('escapa los cinco caracteres HTML sensibles', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});
