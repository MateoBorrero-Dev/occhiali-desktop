// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import type {
  Client,
  DeliveryReceipt,
  DeliveryReceiptListPage,
  DeliveryReceiptListRequest,
  DeliveryReceiptSummary,
  OpticalJob,
} from '../../src/shared/database-models';
import { formatDeliveryTimestamp } from '../../src/renderer/src/lib/delivery-receipt-api';

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
  lens: null,
  brand: null,
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
  lens: null,
  brand: null,
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

const FIRST_SUMMARY: DeliveryReceiptSummary = {
  id: RECEIPT.id,
  receiptNumber: RECEIPT.receiptNumber,
  opticalJobId: RECEIPT.opticalJobId,
  deliveredAt: RECEIPT.deliveredAt,
  registeredAt: RECEIPT.registeredAt,
  status: RECEIPT.status,
  clientFirstName: RECEIPT.clientFirstName,
  clientLastName: RECEIPT.clientLastName,
  jobNumber: RECEIPT.jobNumber,
};

const SECOND_SUMMARY: DeliveryReceiptSummary = {
  ...FIRST_SUMMARY,
  id: 26,
  receiptNumber: 'RET-000026',
  opticalJobId: 25,
  clientFirstName: 'Beatriz',
  clientLastName: 'Segunda',
  jobNumber: 'F-26',
};

const ANNULLED_SUMMARY: DeliveryReceiptSummary = {
  ...SECOND_SUMMARY,
  id: 27,
  receiptNumber: 'RET-000027',
  status: 'ANNULLED',
  clientFirstName: 'Clara',
  clientLastName: 'Anulada',
  jobNumber: 'F-27',
};

function page(items: DeliveryReceiptSummary[], offset = 0, total = 26): DeliveryReceiptListPage {
  return { items, total, limit: 25, offset };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function installApi() {
  const deliveryReceipts = {
    list: vi.fn((request: DeliveryReceiptListRequest = {}) =>
      Promise.resolve(
        ok(request.offset === 25 ? page([SECOND_SUMMARY], 25) : page([FIRST_SUMMARY])),
      ),
    ),
    get: vi.fn((id: number) =>
      Promise.resolve(
        ok(
          id === SECOND_SUMMARY.id
            ? {
                ...RECEIPT,
                ...SECOND_SUMMARY,
                clientDocumentNumber: null,
                clientPhone: null,
              }
            : RECEIPT,
        ),
      ),
    ),
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
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '1.0.0' })),
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('interfaz de comprobantes de retiro', () => {
  it('lista retiros, aplica filtros y abre el detalle histórico', async () => {
    window.location.hash = '#/retiros';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Retiros' })).toBeInTheDocument();
    expect(await screen.findByText('RET-000001')).toBeInTheDocument();
    expect(screen.getByText('Ficticia, Ana')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Buscar retiros' }), 'Ana');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'CONFIRMED');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'Ana', status: 'CONFIRMED', limit: 25, offset: 0 }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })),
    );
    expect(await screen.findByText('RET-000026')).toBeInTheDocument();
    expect(screen.queryByText('RET-000001')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Ver detalle/ }));
    expect(await screen.findByRole('heading', { name: 'RET-000026' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(26);
    await user.click(screen.getByRole('link', { name: 'Volver a retiros' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Retiros' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar retiros' })).toHaveValue('Ana');
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('CONFIRMED');
    expect(await screen.findByText('RET-000026')).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Ana', status: 'CONFIRMED', offset: 25 }),
    );
  });

  it('habilita la limpieza al escribir sin esperar el debounce', async () => {
    window.location.hash = '#/retiros';
    installApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('RET-000001');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar retiros' }), 'A');
    const clear = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect(clear).toBeEnabled();
    await user.click(clear);
    expect(screen.getByRole('searchbox', { name: 'Buscar retiros' })).toHaveValue('');
    expect(window.location.hash).toBe('#/retiros');
  });

  it('espera el debounce, descarta respuestas anteriores y mantiene URL y paginación', async () => {
    vi.useFakeTimers();
    window.location.hash = '#/retiros?status=CONFIRMED&page=2';
    const api = installApi();
    const previous = deferred<ReturnType<typeof ok<DeliveryReceiptListPage>>>();
    api.list.mockImplementation((request: DeliveryReceiptListRequest = {}) => {
      if (request.query === 'Ana') {
        return Promise.resolve(
          ok(request.offset === 25 ? page([SECOND_SUMMARY], 25) : page([FIRST_SUMMARY], 0)),
        );
      }
      return previous.promise;
    });
    render(<App />);

    await act(async () => Promise.resolve());
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: '', status: 'CONFIRMED', offset: 25 }),
    );

    const search = screen.getByRole('searchbox', { name: 'Buscar retiros' });
    fireEvent.change(search, { target: { value: 'A' } });
    fireEvent.change(search, { target: { value: 'An' } });
    fireEvent.change(search, { target: { value: 'Ana' } });

    expect(search).toHaveValue('Ana');
    expect(window.location.hash).toContain('q=Ana');
    expect(window.location.hash).toContain('status=CONFIRMED');
    expect(window.location.hash).not.toContain('page=');
    expect(api.list).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(api.list).toHaveBeenCalledTimes(1);

    await act(async () => {
      previous.resolve(ok(page([SECOND_SUMMARY], 25)));
      await Promise.resolve();
    });
    expect(screen.queryByText('RET-000026')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando retiros');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Ana', status: 'CONFIRMED', offset: 0 }),
    );
    expect(screen.getByText('RET-000001')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await act(async () => Promise.resolve());
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Ana', status: 'CONFIRMED', offset: 25 }),
    );
    expect(screen.getByText('RET-000026')).toBeInTheDocument();
    expect(window.location.hash).toContain('page=2');

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(search).toHaveValue('');
    expect(window.location.hash).toBe('#/retiros');
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
  });

  it('reemplaza una página superior al máximo y conserva los filtros', async () => {
    window.location.hash = '#/retiros?q=Ana&status=CONFIRMED&from=2026-10-01&page=999';
    const api = installApi();
    api.list.mockImplementation((request: DeliveryReceiptListRequest = {}) =>
      Promise.resolve(
        ok(request.offset === 24_950 ? page([], 24_950) : page([SECOND_SUMMARY], 25)),
      ),
    );
    render(<App />);

    expect(await screen.findByText('RET-000026')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar retiros' })).toHaveValue('Ana');
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('CONFIRMED');
    expect(screen.getByLabelText('Entrega desde')).toHaveValue('2026-10-01');
    expect(window.location.hash).toContain('page=2');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls.map(([request]) => request?.offset)).toEqual([24_950, 25]);
  });

  it('vuelve a la primera página al aplicar un filtro que reduce los resultados', async () => {
    window.location.hash = '#/retiros?page=2';
    const api = installApi();
    api.list.mockImplementation((request: DeliveryReceiptListRequest = {}) =>
      Promise.resolve(
        ok(
          request.status === 'ANNULLED'
            ? page([ANNULLED_SUMMARY], 0, 1)
            : page([SECOND_SUMMARY], 25),
        ),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('RET-000026');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'ANNULLED');
    expect(await screen.findByText('RET-000027')).toBeInTheDocument();
    expect(window.location.hash).toContain('status=ANNULLED');
    expect(window.location.hash).not.toContain('page=');
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'ANNULLED', offset: 0 }),
    );
  });

  it('corrige una página fuera de rango cuando el filtro ya está en la URL', async () => {
    window.location.hash = '#/retiros?status=ANNULLED&page=2';
    const api = installApi();
    api.list.mockImplementation((request: DeliveryReceiptListRequest = {}) =>
      Promise.resolve(ok(request.offset === 25 ? page([], 25, 1) : page([ANNULLED_SUMMARY], 0, 1))),
    );
    render(<App />);

    expect(await screen.findByText('RET-000027')).toBeInTheDocument();
    expect(window.location.hash).toContain('status=ANNULLED');
    expect(window.location.hash).not.toContain('page=');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls.map(([request]) => request?.offset)).toEqual([25, 0]);
  });

  it('mantiene el estado vacío normal aunque la URL incluya una página alta', async () => {
    window.location.hash = '#/retiros?page=999';
    const api = installApi();
    api.list.mockResolvedValue(ok(page([], 24_950, 0)));
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay retiros registrados.' }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/retiros?page=999');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('muestra falta de coincidencias cuando los filtros devuelven total cero', async () => {
    window.location.hash = '#/retiros?q=SinCoincidencias&page=999';
    const api = installApi();
    api.list.mockResolvedValue(ok(page([], 24_950, 0)));
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'No encontramos retiros con esos filtros.' }),
    ).toBeInTheDocument();
    expect(window.location.hash).toContain('q=SinCoincidencias');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('normaliza una página excesiva antes de calcular el offset', async () => {
    window.location.hash = '#/retiros?page=999999999999999999999999999999';
    const api = installApi();
    render(<App />);

    expect(await screen.findByText('RET-000001')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/retiros');
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });

  it('ignora respuestas antiguas que llegan fuera de orden', async () => {
    window.location.hash = '#/retiros';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('RET-000001');

    const slow = deferred<ReturnType<typeof ok<DeliveryReceiptListPage>>>();
    const fast = deferred<ReturnType<typeof ok<DeliveryReceiptListPage>>>();
    api.list.mockImplementation((request: DeliveryReceiptListRequest = {}) => {
      if (request.status === 'CONFIRMED') return slow.promise;
      if (request.status === 'ANNULLED') return fast.promise;
      return Promise.resolve(ok(page([FIRST_SUMMARY])));
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'CONFIRMED');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'CONFIRMED' })),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'ANNULLED');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ANNULLED' })),
    );

    await act(async () => {
      fast.resolve(ok(page([{ ...SECOND_SUMMARY, status: 'ANNULLED' }])));
      await Promise.resolve();
    });
    expect(await screen.findByText('RET-000026')).toBeInTheDocument();
    await act(async () => {
      slow.resolve(ok(page([FIRST_SUMMARY])));
      await Promise.resolve();
    });
    expect(screen.getByText('RET-000026')).toBeInTheDocument();
    expect(screen.queryByText('RET-000001')).not.toBeInTheDocument();
  });

  it('muestra la misma fecha local de Córdoba que usa el filtro SQLite', () => {
    expect(formatDeliveryTimestamp('2026-10-20T02:59:59.000Z')).toMatch(/19\/10\/26.*23:59/);
    expect(formatDeliveryTimestamp('2026-10-20T03:00:00.000Z')).toMatch(/20\/10\/26.*00:00/);
  });

  it('diferencia listado vacío, falta de coincidencias y error recuperable', async () => {
    window.location.hash = '#/retiros';
    const api = installApi();
    api.list.mockResolvedValueOnce(ok({ items: [], total: 0, limit: 25, offset: 0 }));
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay retiros registrados.' }),
    ).toBeInTheDocument();
    unmount();

    api.list.mockRejectedValueOnce(new Error('fallo simulado'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el listado de retiros.',
    );
    api.list.mockResolvedValueOnce(ok({ items: [], total: 0, limit: 25, offset: 0 }));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay retiros registrados.' }),
    ).toBeInTheDocument();
  });

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
