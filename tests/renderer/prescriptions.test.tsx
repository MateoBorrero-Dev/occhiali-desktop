// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import type {
  Client,
  Prescription,
  PrescriptionListPage,
  PrescriptionRevision,
  OpticalJobListPage,
  OpticalJobsByPrescriptionRequest,
} from '../../src/shared/database-models';
import type { ClientIpcResult, PrescriptionIpcResult } from '../../src/shared/ipc-contracts';

const CLIENT: Client = {
  id: 7,
  firstName: 'Laura',
  lastName: 'Ficticia',
  documentNumber: null,
  phone: null,
  address: null,
  birthDate: null,
  notes: null,
  isArchived: false,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const PRESCRIPTION: Prescription = {
  id: 11,
  clientId: CLIENT.id,
  prescriptionDate: '2026-03-04',
  prescriberName: 'Profesional Ficticio',
  notes: 'Control anual ficticio.',
  createdAt: '2026-03-04T12:00:00.000Z',
  updatedAt: '2026-03-04T12:00:00.000Z',
  values: [
    {
      id: 1,
      prescriptionId: 11,
      distance: 'FAR',
      eye: 'OD',
      sphere: '1.25',
      cylinder: '-0.50',
      axis: 90,
      dip: null,
      height: null,
    },
  ],
};

const SUMMARY = {
  id: 11,
  clientId: 7,
  clientFirstName: 'Laura',
  clientLastName: 'Ficticia',
  prescriptionDate: '2026-03-04',
  prescriberName: 'Profesional Ficticio',
  createdAt: '2026-03-04T12:00:00.000Z',
  updatedAt: '2026-03-04T12:00:00.000Z',
  valueCount: 1,
};

const EMPTY_OPTICAL_JOB_PAGE: OpticalJobListPage = {
  items: [],
  total: 0,
  limit: 10,
  offset: 0,
};

function clientSuccess<T>(data: T): ClientIpcResult<T> {
  return { ok: true, data };
}
function prescriptionSuccess<T>(data: T): PrescriptionIpcResult<T> {
  return { ok: true, data };
}

function installApi(pageItems = [SUMMARY]) {
  const page: PrescriptionListPage = {
    items: pageItems,
    total: pageItems.length,
    limit: 25,
    offset: 0,
  };
  const clients = {
    list: vi.fn(() =>
      Promise.resolve(clientSuccess({ items: [CLIENT], total: 1, limit: 100, offset: 0 })),
    ),
    get: vi.fn(() => Promise.resolve(clientSuccess(CLIENT))),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
  const prescriptions = {
    list: vi.fn(() => Promise.resolve(prescriptionSuccess(page))),
    listByClient: vi.fn(() => Promise.resolve(prescriptionSuccess({ ...page, limit: 10 }))),
    get: vi.fn(() => Promise.resolve(prescriptionSuccess(PRESCRIPTION))),
    create: vi.fn(() => Promise.resolve(prescriptionSuccess(PRESCRIPTION))),
    correct: vi.fn(() => Promise.resolve(prescriptionSuccess(PRESCRIPTION))),
    revisions: vi.fn(() => Promise.resolve(prescriptionSuccess([] as PrescriptionRevision[]))),
  };
  const opticalJobs = {
    list: vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { items: [], total: 0, limit: 25, offset: 0 } }),
    ),
    listByClient: vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { items: [], total: 0, limit: 10, offset: 0 } }),
    ),
    listByPrescription: vi.fn((...args: [OpticalJobsByPrescriptionRequest]) => {
      void args;
      return Promise.resolve({ ok: true as const, data: EMPTY_OPTICAL_JOB_PAGE });
    }),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '0.1.0' })),
      clients,
      prescriptions,
      opticalJobs,
      treatments: { list: vi.fn(() => Promise.resolve({ ok: true as const, data: [] })) },
      dashboard: { getSummary: vi.fn() },
      search: { global: vi.fn() },
    },
  });
  return { clients, prescriptions, opticalJobs };
}

describe('módulo de recetas', () => {
  beforeEach(() => {
    window.location.hash = '#/recetas';
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('muestra recetas reales y permite abrir cliente y detalle', async () => {
    installApi();
    render(<App />);
    expect(await screen.findByText('Ficticia, Laura')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cliente' })).toHaveAttribute('href', '#/clientes/7');
    expect(screen.getByRole('link', { name: /Ver detalle/ })).toHaveAttribute(
      'href',
      '#/recetas/11',
    );
  });

  it('busca por cliente y filtra por fechas', async () => {
    const api = installApi([]);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por cliente' }), 'Laura');
    await user.type(screen.getByLabelText('Desde'), '2026-01-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-12-31');
    await waitFor(() =>
      expect(api.prescriptions.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'Laura', dateFrom: '2026-01-01', dateTo: '2026-12-31' }),
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'No encontramos recetas con esos filtros.' }),
    ).toBeInTheDocument();
  });

  it('muestra estados vacío y de error controlado', async () => {
    const api = installApi([]);
    api.prescriptions.list.mockRejectedValueOnce(new Error('fallo técnico'));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay recetas registradas.' }),
    ).toBeInTheDocument();
  });

  it('valida formulario vacío y conserva los datos ingresados', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    const sphere = await screen.findByLabelText('ESF lejos OD');
    await user.click(screen.getByRole('button', { name: 'Guardar receta' }));
    expect(
      screen.getByText('Ingresá al menos un dato óptico antes de guardar.'),
    ).toBeInTheDocument();
    expect(api.prescriptions.create).not.toHaveBeenCalled();
    await user.type(sphere, '-1,25');
    await user.click(screen.getByRole('button', { name: 'Guardar receta' }));
    expect(api.prescriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 7,
        values: [expect.objectContaining({ sphere: '-1.25' })],
      }),
    );
  });

  it('selecciona cliente en el alta general y admite valores opcionales', async () => {
    window.location.hash = '#/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(await screen.findByLabelText(/Cliente/), '7');
    await user.type(screen.getByLabelText('CIL cerca OI'), '0,00');
    await user.click(screen.getByRole('button', { name: 'Guardar receta' }));
    expect(api.prescriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 7,
        prescriberName: null,
        notes: null,
        values: [expect.objectContaining({ distance: 'NEAR', eye: 'OI', cylinder: '0.00' })],
      }),
    );
  });

  it('previene el doble envío mientras guarda', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    let resolveCreate!: (value: PrescriptionIpcResult<Prescription>) => void;
    api.prescriptions.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('ESF lejos OD'), '1,25');
    await user.click(screen.getByRole('button', { name: 'Guardar receta' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardando…' }));
    expect(api.prescriptions.create).toHaveBeenCalledOnce();
    resolveCreate(prescriptionSuccess(PRESCRIPTION));
  });

  it('muestra detalle con cero, signos, campos ausentes y correcciones', async () => {
    window.location.hash = '#/recetas/11';
    const api = installApi();
    api.prescriptions.revisions.mockResolvedValue(
      prescriptionSuccess([
        {
          id: 3,
          prescriptionId: 11,
          revisionNumber: 1,
          reason: 'Error de carga',
          prescriptionDate: '2026-03-03',
          prescriberName: null,
          notes: null,
          correctedAt: '2026-03-04T13:00:00.000Z',
          values: [
            {
              id: 4,
              revisionId: 3,
              distance: 'FAR',
              eye: 'OD',
              sphere: '0.00',
              cylinder: null,
              axis: 180,
              dip: null,
              height: null,
            },
          ],
        },
      ]),
    );
    api.opticalJobs.listByPrescription.mockResolvedValue({
      ok: true as const,
      data: {
        items: [
          {
            id: 91,
            clientId: 7,
            clientFirstName: 'Laura',
            clientLastName: 'Ficticia',
            prescriptionId: 11,
            jobNumber: 'REC-91',
            product: 'Anteojos recetados',
            frameModel: null,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      },
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Receta del 04/03/2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('+1,25')).toBeInTheDocument();
    expect(screen.getByText('-0,50')).toBeInTheDocument();
    expect(screen.getByText(/Revisión 1/)).toBeInTheDocument();
    expect(screen.getByText(/Error de carga/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Ver ficha/ })).toHaveAttribute(
      'href',
      '#/trabajos/91',
    );
  });

  it('corrige con motivo obligatorio y conserva el ID', async () => {
    window.location.hash = '#/recetas/11/corregir';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
    expect(screen.getByText('Indicá el motivo de la corrección.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Motivo de la corrección/), 'Error de transcripción');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(api.prescriptions.correct).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ reason: 'Error de transcripción' }),
    );
  });

  it('bloquea el alta desde un cliente archivado y conserva su historial', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    api.clients.get.mockResolvedValue(clientSuccess({ ...CLIENT, isArchived: true }));
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'El cliente está archivado' }),
    ).toBeInTheDocument();
    expect(api.prescriptions.create).not.toHaveBeenCalled();
  });
});
