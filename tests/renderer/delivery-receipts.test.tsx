// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import type { Client, DeliveryReceipt, OpticalJob } from '../../src/shared/database-models';

const ok = <T,>(data: T) => ({ ok: true as const, data });
const CLIENT: Client = {
  id: 1,
  firstName: 'Ana',
  lastName: 'Ficticia',
  documentNumber: '30111222',
  phone: '1100000000',
  address: null,
  birthDate: null,
  notes: null,
  isArchived: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};
const JOB: OpticalJob = {
  id: 2,
  clientId: 1,
  prescriptionId: null,
  jobNumber: 'F-22',
  product: 'Anteojos',
  frameCondition: 'NEW',
  frameMaterial: 'METAL',
  frameModel: 'Modelo QA',
  productColor: 'Negro',
  supplier: 'Proveedor QA',
  colorType: null,
  observations: 'Producto ficticio',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  treatments: [],
};
const RECEIPT: DeliveryReceipt = {
  id: 3,
  receiptNumber: 'RET-000001',
  opticalJobId: 2,
  deliveredAt: '2026-10-17T18:00:00.000Z',
  registeredAt: '2026-10-17T18:01:00.000Z',
  status: 'CONFIRMED',
  clientFirstName: 'Ana',
  clientLastName: 'Ficticia',
  clientDocumentNumber: '30111222',
  clientPhone: '1100000000',
  jobNumber: 'F-22',
  product: 'Anteojos',
  frameCondition: 'NEW',
  frameMaterial: 'METAL',
  frameModel: 'Modelo QA',
  productColor: 'Negro',
  supplier: 'Proveedor QA',
  colorType: null,
  productObservations: 'Producto ficticio',
  treatmentNames: [],
  recipientType: 'AUTHORIZED_THIRD_PARTY',
  recipientFullName: 'Tercera Autorizada',
  recipientDocumentNumber: '33222111',
  recipientRelationship: 'Hija',
  authorizationReference: 'Mensaje presentado',
  authorizationConfirmed: true,
  deliveredBy: 'Responsable QA',
  deliveryNotes: null,
  deliveryConfirmed: true,
  events: [],
};

function installApi() {
  const deliveryReceipts = {
    get: vi.fn(() => Promise.resolve(ok(RECEIPT))),
    getByJob: vi.fn(() => Promise.resolve(ok(null))),
    create: vi.fn(() => Promise.resolve(ok(RECEIPT))),
    addEvent: vi.fn(() =>
      Promise.resolve(
        ok({
          ...RECEIPT,
          status: 'CORRECTED' as const,
          events: [
            {
              id: 1,
              receiptId: 3,
              type: 'CORRECTION_NOTE' as const,
              reason: 'Aclaración QA',
              createdAt: '2026-10-17T19:00:00.000Z',
            },
          ],
        }),
      ),
    ),
    exportPdf: vi.fn(() =>
      Promise.resolve(ok({ canceled: false, fileName: 'Occhiali-Retiro-RET-000001.pdf' })),
    ),
  };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '0.9.0' })),
      clients: {
        get: vi.fn(() => Promise.resolve(ok(CLIENT))),
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
        restore: vi.fn(),
      },
      prescriptions: {
        list: vi.fn(),
        listByClient: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        correct: vi.fn(),
        revisions: vi.fn(),
      },
      opticalJobs: {
        get: vi.fn(() => Promise.resolve(ok(JOB))),
        list: vi.fn(),
        listByClient: vi.fn(),
        listByPrescription: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      treatments: { list: vi.fn() },
      deliveryReceipts,
      dashboard: { getSummary: vi.fn() },
      search: { global: vi.fn() },
    },
  });
  return deliveryReceipts;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('interfaz de comprobantes de retiro', () => {
  it('registra un tercero mediante revisión y confirmación explícita', async () => {
    window.location.hash = '#/trabajos/2/retiro/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Registrar retiro' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Retira un tercero autorizado' }));
    await user.clear(screen.getByLabelText('Nombre completo de quien retira'));
    await user.type(screen.getByLabelText('Nombre completo de quien retira'), 'Tercera Autorizada');
    await user.clear(screen.getByLabelText(/^DNI/));
    await user.type(screen.getByLabelText(/^DNI/), '33222111');
    await user.type(screen.getByLabelText('Vínculo con el titular'), 'Hija');
    await user.type(
      screen.getByLabelText('Referencia o descripción de la autorización'),
      'Mensaje presentado',
    );
    await user.click(screen.getByRole('checkbox', { name: /comprobé la identidad/ }));
    await user.type(screen.getByLabelText('Nombre de quien realiza la entrega'), 'Responsable QA');
    await user.click(screen.getByRole('button', { name: 'Revisar entrega' }));
    expect(screen.getByRole('heading', { name: 'Confirmación final' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /producto fue entregado/ }));
    await user.click(screen.getByRole('button', { name: 'Registrar entrega' }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientType: 'AUTHORIZED_THIRD_PARTY',
          authorizationConfirmed: true,
          deliveryConfirmed: true,
        }),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'RET-000001' })).toBeInTheDocument();
  });

  it('muestra el comprobante, exporta el mismo registro y agrega trazabilidad', async () => {
    window.location.hash = '#/retiros/3';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'RET-000001' })).toBeInTheDocument();
    expect(screen.getByText('Tercera Autorizada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    expect(await screen.findByText(/PDF exportado como/)).toBeInTheDocument();
    expect(api.exportPdf).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Registrar aclaración' }));
    await user.type(screen.getByLabelText('Motivo'), 'Aclaración QA');
    await user.click(screen.getByRole('button', { name: 'Guardar aclaración' }));
    expect(await screen.findByText('Aclaración QA')).toBeInTheDocument();
    expect(api.addEvent).toHaveBeenCalledWith({
      receiptId: 3,
      type: 'CORRECTION_NOTE',
      reason: 'Aclaración QA',
    });
  });
});
