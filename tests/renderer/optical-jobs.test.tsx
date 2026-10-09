// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import type {
  Client,
  OpticalJob,
  OpticalJobListPage,
  PrescriptionListPage,
  PrescriptionsByClientRequest,
  Treatment,
} from '../../src/shared/database-models';

const CLIENT: Client = {
  id: 5,
  firstName: 'Laura',
  lastName: 'Ficticia',
  documentNumber: '30111222',
  phone: '11 4000 5000',
  address: null,
  birthDate: null,
  notes: null,
  isArchived: false,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};
const TREATMENTS: Treatment[] = [
  {
    id: 'anti-scratch-stark',
    name: 'Antirrayas Stark',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  { id: 'ar-asa-pro', name: 'AR ASA Pro', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
];
const JOB: OpticalJob = {
  id: 9,
  clientId: 5,
  prescriptionId: 3,
  jobNumber: '000152',
  product: 'Anteojos recetados',
  frameCondition: 'NEW',
  frameMaterial: 'METAL',
  frameModel: 'Modelo ficticio',
  colorType: 'GRADIENT',
  observations: 'Observación ficticia.',
  createdAt: '2026-04-02T12:00:00.000Z',
  updatedAt: '2026-04-02T12:00:00.000Z',
  treatments: [TREATMENTS[0]!],
};
const SUMMARY = {
  id: 9,
  clientId: 5,
  clientFirstName: 'Laura',
  clientLastName: 'Ficticia',
  prescriptionId: 3,
  jobNumber: '000152',
  product: 'Anteojos recetados',
  frameModel: 'Modelo ficticio',
  createdAt: JOB.createdAt,
  updatedAt: JOB.updatedAt,
};
const PRESCRIPTION_PAGE: PrescriptionListPage = {
  items: [
    {
      id: 3,
      clientId: 5,
      clientFirstName: 'Laura',
      clientLastName: 'Ficticia',
      prescriptionDate: '2026-03-01',
      prescriberName: 'Profesional Ficticio',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      valueCount: 1,
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};
const ok = <T,>(data: T) => ({ ok: true as const, data });

function installApi(items = [SUMMARY]) {
  const page: OpticalJobListPage = { items, total: items.length, limit: 25, offset: 0 };
  const clients = {
    list: vi.fn(() => Promise.resolve(ok({ items: [CLIENT], total: 1, limit: 10, offset: 0 }))),
    get: vi.fn(() => Promise.resolve(ok(CLIENT))),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  };
  const prescriptions = {
    list: vi.fn(() => Promise.resolve(ok(PRESCRIPTION_PAGE))),
    listByClient: vi.fn((...args: [PrescriptionsByClientRequest]) => {
      void args;
      return Promise.resolve(ok(PRESCRIPTION_PAGE));
    }),
    get: vi.fn(),
    create: vi.fn(),
    correct: vi.fn(),
    revisions: vi.fn(),
  };
  const opticalJobs = {
    list: vi.fn(() => Promise.resolve(ok(page))),
    listByClient: vi.fn(() => Promise.resolve(ok({ ...page, limit: 10 }))),
    listByPrescription: vi.fn(() => Promise.resolve(ok({ ...page, limit: 10 }))),
    get: vi.fn(() => Promise.resolve(ok(JOB))),
    create: vi.fn(() => Promise.resolve(ok(JOB))),
    update: vi.fn(() => Promise.resolve(ok(JOB))),
  };
  const treatments = { list: vi.fn(() => Promise.resolve(ok(TREATMENTS))) };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '0.1.0' })),
      clients,
      prescriptions,
      opticalJobs,
      treatments,
      dashboard: { getSummary: vi.fn() },
      search: { global: vi.fn() },
    },
  });
  return { clients, prescriptions, opticalJobs, treatments };
}

describe('módulo de fichas de trabajo', () => {
  beforeEach(() => {
    window.location.hash = '#/trabajos';
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('muestra fichas reales con accesos a cliente y detalle', async () => {
    installApi();
    render(<App />);
    expect(await screen.findByText('000152')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cliente' })).toHaveAttribute('href', '#/clientes/5');
    expect(screen.getByRole('link', { name: /Ver detalle/ })).toHaveAttribute(
      'href',
      '#/trabajos/9',
    );
  });

  it('busca por número, cliente o producto con debounce', async () => {
    const api = installApi([]);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar fichas' }), '000152');
    await waitFor(() =>
      expect(api.opticalJobs.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: '000152' }),
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'No encontramos fichas con esa búsqueda.' }),
    ).toBeInTheDocument();
  });

  it('muestra error recuperable y estado vacío', async () => {
    const api = installApi([]);
    api.opticalJobs.list.mockRejectedValueOnce(new Error('fallo interno'));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay fichas de trabajo.' }),
    ).toBeInTheDocument();
  });

  it('busca y selecciona cliente sin cargar miles indiscriminadamente', async () => {
    window.location.hash = '#/trabajos/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('searchbox', { name: /Buscar cliente/ }), 'Laura');
    await user.click(await screen.findByRole('button', { name: /Ficticia, Laura/ }));
    expect(api.clients.list).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Laura', limit: 10, status: 'active' }),
    );
    expect(await screen.findByRole('option', { name: /01\/03\/2026/ })).toBeInTheDocument();
  });

  it('permite cargar y seleccionar recetas posteriores al límite inicial', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    const allRecipes = Array.from({ length: 105 }, (_, index) => ({
      ...PRESCRIPTION_PAGE.items[0]!,
      id: index + 1,
      prescriptionDate: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
    }));
    api.prescriptions.listByClient.mockImplementation((request) =>
      Promise.resolve(
        ok({
          items: allRecipes.slice(
            request.offset ?? 0,
            (request.offset ?? 0) + (request.limit ?? 25),
          ),
          total: allRecipes.length,
          limit: request.limit ?? 25,
          offset: request.offset ?? 0,
        }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Cargar recetas anteriores' }));
    await user.click(await screen.findByRole('button', { name: 'Cargar recetas anteriores' }));
    await user.selectOptions(screen.getByLabelText('Receta'), '105');
    expect(screen.getByLabelText('Receta')).toHaveValue('105');
    expect(api.prescriptions.listByClient).toHaveBeenLastCalledWith({
      clientId: 5,
      limit: 50,
      offset: 100,
    });
  });

  it('guarda producto libre, número, receta, armazón, tratamientos y coloración', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.type(
      await screen.findByPlaceholderText('Ej. Anteojos recetados'),
      'Anteojos recetados',
    );
    await user.type(screen.getByLabelText(/Número de ficha/), '000152');
    await user.selectOptions(await screen.findByLabelText('Receta'), '3');
    await user.selectOptions(screen.getByLabelText('Condición'), 'NEW');
    await user.selectOptions(screen.getByLabelText('Material'), 'METAL');
    await user.type(screen.getByLabelText(/Modelo/), 'Modelo ficticio');
    await user.click(screen.getByRole('checkbox', { name: 'Antirrayas Stark' }));
    await user.click(screen.getByRole('checkbox', { name: 'AR ASA Pro' }));
    await user.selectOptions(screen.getByLabelText('Coloración'), 'GRADIENT');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(api.opticalJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 5,
        prescriptionId: 3,
        jobNumber: '000152',
        frameCondition: 'NEW',
        frameMaterial: 'METAL',
        colorType: 'GRADIENT',
        treatmentIds: ['anti-scratch-stark', 'ar-asa-pro'],
      }),
    );
  });

  it('permite lentes de sol sin receta ni tratamientos', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByPlaceholderText('Ej. Anteojos recetados'), 'Lentes de sol');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(api.opticalJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({ product: 'Lentes de sol', prescriptionId: null, treatmentIds: [] }),
    );
  });

  it('previene doble envío durante el guardado', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    let resolveCreate!: (value: ReturnType<typeof ok<OpticalJob>>) => void;
    api.opticalJobs.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Tratamientos y acabados de lentes');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardando…' }));
    expect(api.opticalJobs.create).toHaveBeenCalledOnce();
    resolveCreate(ok(JOB));
  });

  it('muestra detalle comercial, receta y tratamientos sin lenguaje médico', async () => {
    window.location.hash = '#/trabajos/9';
    installApi();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Ficha 000152' })).toBeInTheDocument();
    expect(screen.getByText('Color degradé')).toBeInTheDocument();
    expect(screen.getByText('Antirrayas Stark')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver receta asociada' })).toHaveAttribute(
      'href',
      '#/recetas/3',
    );
    expect(screen.getByText(/no procedimientos médicos/)).toBeInTheDocument();
  });

  it('edita valores actuales conservando cliente e ID', async () => {
    window.location.hash = '#/trabajos/9/editar';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    const model = await screen.findByLabelText(/Modelo/);
    await user.clear(model);
    await user.type(model, 'Modelo actualizado');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(api.opticalJobs.update).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ frameModel: 'Modelo actualizado' }),
    );
  });

  it('bloquea nuevas fichas de clientes archivados', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    api.clients.get.mockResolvedValue(ok({ ...CLIENT, isArchived: true }));
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'El cliente está archivado' }),
    ).toBeInTheDocument();
    expect(api.opticalJobs.create).not.toHaveBeenCalled();
  });
});
