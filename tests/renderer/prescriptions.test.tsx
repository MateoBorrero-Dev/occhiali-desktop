// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import type {
  Client,
  CreatePrescriptionBundleInput,
  CreatePrescriptionBundleResult,
  OpticalJob,
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
  additionOd: '1.50',
  additionOi: '0.00',
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

const OPTICAL_JOB: OpticalJob = {
  id: 21,
  clientId: CLIENT.id,
  prescriptionId: PRESCRIPTION.id,
  jobNumber: 'INT-021',
  product: 'Anteojos recetados',
  lens: 'Orgánico 1.60',
  brand: 'Marca ficticia',
  frameCondition: 'USED',
  frameMaterial: 'METAL',
  frameModel: 'Modelo integrado',
  productColor: 'Azul',
  supplier: 'Proveedor ficticio',
  colorType: 'GRADIENT',
  observations: 'Trabajo ficticio.',
  createdAt: '2026-03-04T12:00:00.000Z',
  updatedAt: '2026-03-04T12:00:00.000Z',
  treatments: [],
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
    createIntegrated: vi.fn((input: CreatePrescriptionBundleInput) =>
      Promise.resolve(
        prescriptionSuccess<CreatePrescriptionBundleResult>({
          prescription: PRESCRIPTION,
          opticalJob: input.opticalJob ? OPTICAL_JOB : null,
        }),
      ),
    ),
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
    get: vi.fn(() => Promise.resolve({ ok: true as const, data: OPTICAL_JOB })),
    create: vi.fn(),
    update: vi.fn(),
  };
  const treatments = {
    list: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        data: [
          {
            id: 'edge-polish',
            name: 'Pulido de bordes',
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ),
  };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '0.1.0' })),
      clients,
      prescriptions,
      opticalJobs,
      treatments,
      deliveryReceipts: {
        get: vi.fn(),
        getByJob: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
        create: vi.fn(),
        addEvent: vi.fn(),
        exportPdf: vi.fn(),
      },
      dashboard: { getSummary: vi.fn() },
      search: { global: vi.fn() },
    },
  });
  return { clients, prescriptions, opticalJobs, treatments };
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
    await user.click(screen.getByRole('button', { name: 'Guardar solo receta' }));
    expect(
      screen.getByText('Ingresá al menos un dato óptico antes de guardar.'),
    ).toBeInTheDocument();
    expect(api.prescriptions.createIntegrated).not.toHaveBeenCalled();
    await user.type(sphere, '-1,25');
    await user.click(screen.getByRole('button', { name: 'Guardar solo receta' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.opticalJob).toBeNull();
    expect(submitted.prescription.clientId).toBe(7);
    const submittedValues = submitted.prescription.values ?? [];
    expect(submittedValues).toHaveLength(1);
    expect(submittedValues[0]?.sphere).toBe('-1.25');
  });

  it('selecciona cliente en el alta general y admite valores opcionales', async () => {
    window.location.hash = '#/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Buscar cliente para la receta'), 'Laura');
    await user.click(await screen.findByRole('button', { name: /Ficticia, Laura/ }));
    await user.type(screen.getByLabelText('CIL cerca OI'), '0,00');
    await user.click(screen.getByRole('button', { name: 'Guardar solo receta' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.opticalJob).toBeNull();
    expect(submitted.prescription.clientId).toBe(7);
    expect(submitted.prescription.prescriberName).toBeNull();
    expect(submitted.prescription.notes).toBeNull();
    const submittedValues = submitted.prescription.values ?? [];
    expect(submittedValues).toHaveLength(1);
    expect(submittedValues[0]).toMatchObject({
      distance: 'NEAR',
      eye: 'OI',
      cylinder: '0.00',
    });
  });

  it('renderiza el formulario integrado completo con veinte casilleros ópticos vacíos', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Nueva receta y trabajo' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Profesional \(opcional\)/)).toBeInTheDocument();
    expect(screen.queryByText('Profesional prescriptor')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lejos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cerca' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Cristal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Marca/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Propio' })).toHaveValue('USED');
    for (const product of ['Anteojos de receta', 'Lentes de sol', 'Lentes de contacto', 'Otro']) {
      expect(screen.getByRole('radio', { name: product })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/Nombre del producto/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tratamientos (opcional)')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tratamientos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Pulido de bordes')).not.toBeInTheDocument();
    expect(api.treatments.list).not.toHaveBeenCalled();

    const fields = ['ESF', 'CIL', 'EJE', 'DIP', 'ALT'].flatMap((field) =>
      ['lejos', 'cerca'].flatMap((distance) =>
        ['OD', 'OI'].map((eye) => screen.getByLabelText(`${field} ${distance} ${eye}`)),
      ),
    );
    expect(fields).toHaveLength(20);
    for (const field of fields) {
      expect(field).toHaveValue('');
      expect(field).not.toHaveAttribute('placeholder');
      expect(field).toHaveClass('min-h-12');
    }
  });

  it('guarda receta y trabajo con cristal, marca y tratamientos libres normalizados', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('ESF lejos OD'), '-1,25');
    await user.type(screen.getByLabelText(/Número de ficha/), 'INT-021');
    await user.click(screen.getByRole('radio', { name: 'Anteojos de receta' }));
    await user.type(screen.getByLabelText(/Cristal/), 'Orgánico 1.60');
    await user.type(screen.getByLabelText(/Marca/), 'Marca ficticia');
    await user.type(screen.getByLabelText(/Modelo/), 'Modelo integrado');
    await user.type(screen.getByLabelText(/Color \(opcional\)/), 'Azul');
    await user.selectOptions(screen.getByLabelText('Condición'), 'USED');
    fireEvent.change(screen.getByLabelText('Tratamientos (opcional)'), {
      target: {
        value: ' Pulido de bordes, Filtro ficticio\npulido DE BORDES\n\nAntirreflejo  premium ',
      },
    });
    await user.type(screen.getByLabelText(/Observaciones de receta/), 'Nota receta');
    await user.type(screen.getByLabelText(/Observaciones del trabajo/), 'Nota trabajo');
    await user.click(screen.getByRole('button', { name: 'Guardar receta y trabajo' }));

    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.prescription).toMatchObject({
      clientId: 7,
      additionOd: null,
      additionOi: null,
      notes: 'Nota receta',
    });
    const submittedValues = submitted.prescription.values ?? [];
    expect(submittedValues).toHaveLength(1);
    expect(submittedValues[0]).toMatchObject({
      distance: 'FAR',
      eye: 'OD',
      sphere: '-1.25',
    });
    expect(submitted.opticalJob).toMatchObject({
      jobNumber: 'INT-021',
      product: 'Anteojos de receta',
      lens: 'Orgánico 1.60',
      brand: 'Marca ficticia',
      frameModel: 'Modelo integrado',
      productColor: 'Azul',
      frameCondition: 'USED',
      treatmentIds: [],
      treatmentNames: ['Pulido de bordes', 'Filtro ficticio', 'Antirreflejo premium'],
      observations: 'Nota trabajo',
    });
  });

  it('permite guardar un producto libre mediante la opción Otro', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('ESF lejos OD'), '1,00');
    await user.click(screen.getByRole('radio', { name: 'Otro' }));
    const customProduct = screen.getByLabelText(/Nombre del producto/);
    expect(customProduct).toHaveFocus();
    await user.type(customProduct, 'Producto óptico personalizado');
    await user.click(screen.getByRole('button', { name: 'Guardar receta y trabajo' }));

    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    expect(api.prescriptions.createIntegrated.mock.calls[0]![0].opticalJob?.product).toBe(
      'Producto óptico personalizado',
    );
  });

  it('muestra número duplicado y errores de persistencia sin perder lo ingresado', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    api.prescriptions.createIntegrated.mockResolvedValueOnce({
      ok: false as const,
      error: {
        code: 'DUPLICATE_JOB_NUMBER' as const,
        message: 'Ya existe una ficha registrada con ese número.',
      },
    });
    const user = userEvent.setup();
    render(<App />);
    const sphere = await screen.findByLabelText('ESF lejos OD');
    const jobNumber = screen.getByLabelText(/Número de ficha/);
    await user.type(sphere, '-2,00');
    await user.type(jobNumber, 'DUP-1');
    await user.click(screen.getByRole('button', { name: 'Guardar receta y trabajo' }));
    expect(
      await screen.findByText('Ya existe una ficha registrada con ese número.'),
    ).toBeInTheDocument();
    expect(sphere).toHaveValue('-2,00');
    expect(jobNumber).toHaveValue('DUP-1');

    api.prescriptions.createIntegrated.mockResolvedValueOnce({
      ok: false as const,
      error: { code: 'PERSISTENCE' as const, message: 'No se pudo completar la operación.' },
    });
    await user.clear(jobNumber);
    await user.type(jobNumber, 'NUEVA-1');
    await user.click(screen.getByRole('button', { name: 'Guardar receta y trabajo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo completar la operación.',
    );
    expect(sphere).toHaveValue('-2,00');
  });

  it('mantiene orden de teclado y scroll interno en las resoluciones objetivo', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    installApi();
    const user = userEvent.setup();
    render(<App />);
    const sphere = await screen.findByLabelText('ESF lejos OD');
    sphere.focus();
    await user.tab();
    expect(screen.getByLabelText('CIL lejos OD')).toHaveFocus();

    const firstProduct = screen.getByRole('radio', { name: 'Anteojos de receta' });
    firstProduct.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Lentes de sol' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Lentes de sol' })).toHaveFocus();

    const form = screen.getByTestId('integrated-prescription-form');
    expect(form).toHaveClass('min-w-0', 'text-base');
    for (const label of ['Tabla de graduación de lejos', 'Tabla de graduación de cerca']) {
      expect(screen.getByLabelText(label)).toHaveClass('overflow-x-auto');
    }
    for (const [width, height] of [
      [820, 600],
      [1180, 760],
      [1366, 768],
      [1920, 1080],
    ]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      window.dispatchEvent(new Event('resize'));
      expect(form).toBeInTheDocument();
    }
  });

  it('oculta ADD en el alta nueva y conserva cero como graduación informada', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByLabelText('ADD OD')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ADD OI')).not.toBeInTheDocument();
    await user.type(await screen.findByLabelText('ESF cerca OI'), '0,00');
    await user.click(screen.getByRole('button', { name: 'Guardar solo receta' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.opticalJob).toBeNull();
    expect(submitted.prescription.additionOd).toBeNull();
    expect(submitted.prescription.additionOi).toBeNull();
    const submittedValues = submitted.prescription.values ?? [];
    expect(submittedValues).toHaveLength(1);
    expect(submittedValues[0]).toMatchObject({
      distance: 'NEAR',
      eye: 'OI',
      sphere: '0.00',
    });
  });

  it('encuentra clientes fuera de los primeros 100 mediante búsqueda acotada', async () => {
    window.location.hash = '#/recetas/nueva';
    const api = installApi();
    const distantClient = { ...CLIENT, id: 1000, firstName: 'Zoila', lastName: 'Zeta' };
    api.clients.list.mockResolvedValue(
      clientSuccess({ items: [distantClient], total: 1, limit: 10, offset: 0 }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Buscar cliente para la receta'), 'Zeta');
    await waitFor(() =>
      expect(api.clients.list).toHaveBeenLastCalledWith({
        query: 'Zeta',
        status: 'active',
        limit: 10,
        offset: 0,
      }),
    );
    await user.click(await screen.findByRole('button', { name: /Zeta, Zoila/ }));
    await user.type(screen.getByLabelText('ESF lejos OD'), '1,00');
    await user.click(screen.getByRole('button', { name: 'Guardar solo receta' }));

    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    expect(api.prescriptions.createIntegrated.mock.calls[0]![0].prescription.clientId).toBe(1000);
  });

  it('previene el doble envío mientras guarda', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    let resolveCreate!: (value: PrescriptionIpcResult<CreatePrescriptionBundleResult>) => void;
    api.prescriptions.createIntegrated.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('ESF lejos OD'), '1,25');
    await user.click(screen.getByRole('button', { name: 'Guardar solo receta' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardando…' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    resolveCreate(
      prescriptionSuccess({
        prescription: PRESCRIPTION,
        opticalJob: null,
      }),
    );
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
          additionOd: null,
          additionOi: '2.00',
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
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute(
      'href',
      '#/recetas-trabajos?tab=recetas',
    );
    expect(screen.getByText('+1,25')).toBeInTheDocument();
    expect(screen.getByText('-0,50')).toBeInTheDocument();
    expect(screen.getByText('+1,50')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Lejos' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Cerca' }).length).toBeGreaterThan(0);
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
    await user.clear(screen.getByLabelText('ADD OD'));
    await user.type(screen.getByLabelText('ADD OD'), '2,25');
    await user.type(screen.getByLabelText(/Motivo de la corrección/), 'Error de transcripción');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(api.prescriptions.correct).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ reason: 'Error de transcripción', additionOd: '2.25' }),
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
    expect(api.prescriptions.createIntegrated).not.toHaveBeenCalled();
  });
});
