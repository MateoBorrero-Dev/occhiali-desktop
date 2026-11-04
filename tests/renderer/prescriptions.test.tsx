// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  CorrectPrescriptionInput,
  OpticalFileListRequest,
  OpticalFileSummary,
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

function opticalFile(
  id: number,
  clientFirstName = 'Laura',
  clientLastName = 'Ficticia',
): OpticalFileSummary {
  return {
    kind: 'PRESCRIPTION_ONLY',
    recordId: id,
    jobId: null,
    prescriptionId: id,
    clientId: CLIENT.id,
    clientFirstName,
    clientLastName,
    fileDate: '2026-03-04',
    jobNumber: null,
    product: null,
    createdAt: '2026-03-04T12:00:00.000Z',
    relatedJobCount: 0,
  };
}

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
  const fileItems: OpticalFileSummary[] = pageItems.map((item) => ({
    kind: 'PRESCRIPTION_ONLY',
    recordId: item.id,
    jobId: null,
    prescriptionId: item.id,
    clientId: item.clientId,
    clientFirstName: item.clientFirstName,
    clientLastName: item.clientLastName,
    fileDate: item.prescriptionDate,
    jobNumber: null,
    product: null,
    createdAt: item.createdAt,
    relatedJobCount: 0,
  }));
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
    listFiles: vi.fn((...args: [OpticalFileListRequest?]) => {
      void args;
      return Promise.resolve({
        ok: true as const,
        data: {
          items: fileItems,
          total: pageItems.length,
          limit: 25,
          offset: 0,
        },
      });
    }),
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('muestra recetas reales y permite abrir cliente y detalle', async () => {
    installApi();
    render(<App />);
    expect(await screen.findByText('Ficticia, Laura')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cliente' })).toHaveAttribute('href', '#/clientes/7');
    expect(screen.getByRole('link', { name: /Ver ficha/ })).toHaveAttribute(
      'href',
      '#/fichas/receta/11',
    );
  });

  it('busca fichas históricas por cliente', async () => {
    const api = installApi([]);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar fichas' }), 'Laura');
    await waitFor(() =>
      expect(api.opticalJobs.listFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'Laura' }),
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'No encontramos fichas con esa búsqueda.' }),
    ).toBeInTheDocument();
  });

  it('espera el debounce y consulta una sola vez el texto completo', async () => {
    const api = installApi();
    render(<App />);
    await screen.findByText('Ficticia, Laura');
    api.opticalJobs.listFiles.mockClear();
    vi.useFakeTimers();

    const search = screen.getByRole('searchbox', { name: 'Buscar fichas' });
    fireEvent.change(search, { target: { value: 'L' } });
    fireEvent.change(search, { target: { value: 'La' } });
    fireEvent.change(search, { target: { value: 'Laura' } });

    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(api.opticalJobs.listFiles).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(api.opticalJobs.listFiles).toHaveBeenCalledOnce();
    expect(api.opticalJobs.listFiles).toHaveBeenCalledWith({
      query: 'Laura',
      limit: 25,
      offset: 0,
    });
  });

  it('no deja que una respuesta anterior reemplace una búsqueda nueva', async () => {
    const api = installApi();
    render(<App />);
    await screen.findByText('Ficticia, Laura');
    api.opticalJobs.listFiles.mockClear();
    vi.useFakeTimers();

    let resolvePrevious!: (value: {
      ok: true;
      data: {
        items: OpticalFileSummary[];
        total: number;
        limit: number;
        offset: number;
      };
    }) => void;
    api.opticalJobs.listFiles.mockImplementation((request) => {
      if (request?.query === 'anterior') {
        return new Promise((resolve) => {
          resolvePrevious = resolve;
        });
      }
      const item = opticalFile(31, 'Resultado', 'Nuevo');
      return Promise.resolve({
        ok: true as const,
        data: { items: [item], total: 1, limit: 25, offset: 0 },
      });
    });

    const search = screen.getByRole('searchbox', { name: 'Buscar fichas' });
    fireEvent.change(search, { target: { value: 'anterior' } });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(api.opticalJobs.listFiles).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'anterior' }),
    );

    fireEvent.change(search, { target: { value: 'nuevo' } });
    expect(screen.getByRole('status')).toHaveTextContent('Cargando fichas ópticas');
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Nuevo, Resultado')).toBeInTheDocument();

    await act(async () => {
      resolvePrevious({
        ok: true,
        data: {
          items: [opticalFile(30, 'Resultado', 'Anterior')],
          total: 1,
          limit: 25,
          offset: 0,
        },
      });
      await Promise.resolve();
    });
    expect(screen.getByText('Nuevo, Resultado')).toBeInTheDocument();
    expect(screen.queryByText('Anterior, Resultado')).not.toBeInTheDocument();
  });

  it('reubica una página fuera de rango sin perder la búsqueda ni entrar en un ciclo', async () => {
    window.location.hash = '#/fichas?q=Laura&page=9';
    const api = installApi([]);
    api.opticalJobs.listFiles.mockImplementation((request) => {
      if (request?.offset === 200) {
        return Promise.resolve({
          ok: true as const,
          data: { items: [], total: 26, limit: 25, offset: 200 },
        });
      }
      return Promise.resolve({
        ok: true as const,
        data: { items: [opticalFile(26)], total: 26, limit: 25, offset: 25 },
      });
    });

    render(<App />);
    expect(await screen.findByText('Ficticia, Laura')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/fichas?q=Laura&page=2');
    expect(api.opticalJobs.listFiles).toHaveBeenCalledTimes(2);
    expect(api.opticalJobs.listFiles).toHaveBeenNthCalledWith(1, {
      query: 'Laura',
      limit: 25,
      offset: 200,
    });
    expect(api.opticalJobs.listFiles).toHaveBeenNthCalledWith(2, {
      query: 'Laura',
      limit: 25,
      offset: 25,
    });
  });

  it('normaliza a la página uno cuando una búsqueda no tiene resultados', async () => {
    window.location.hash = '#/fichas?q=Ausente&page=999';
    const api = installApi([]);
    api.opticalJobs.listFiles.mockResolvedValue({
      ok: true as const,
      data: { items: [], total: 0, limit: 25, offset: 0 },
    });

    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'No encontramos fichas con esa búsqueda.' }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#/fichas?q=Ausente');
    expect(api.opticalJobs.listFiles).toHaveBeenCalledTimes(2);
    expect(api.opticalJobs.listFiles).toHaveBeenNthCalledWith(1, {
      query: 'Ausente',
      limit: 25,
      offset: 24_950,
    });
    expect(api.opticalJobs.listFiles).toHaveBeenNthCalledWith(2, {
      query: 'Ausente',
      limit: 25,
      offset: 0,
    });
  });

  it('muestra estados vacío y de error controlado', async () => {
    const api = installApi([]);
    api.opticalJobs.listFiles.mockRejectedValueOnce(new Error('fallo técnico'));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay fichas ópticas.' }),
    ).toBeInTheDocument();
  });

  it('valida formulario vacío y conserva los datos ingresados', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    const sphere = await screen.findByLabelText('ESF lejos OD');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(screen.getByText('Ingresá el número de ficha.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Número de ficha/), 'VAL-001');
    await user.click(screen.getByRole('radio', { name: 'Anteojos de receta' }));
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(
      screen.getByText('Ingresá al menos un dato óptico antes de guardar.'),
    ).toBeInTheDocument();
    expect(api.prescriptions.createIntegrated).not.toHaveBeenCalled();
    await user.type(sphere, '-1,25');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.opticalJob).toMatchObject({ jobNumber: 'VAL-001' });
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
    await user.type(screen.getByLabelText(/Número de ficha/), 'OPT-001');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.opticalJob).toMatchObject({ jobNumber: 'OPT-001' });
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

    expect(await screen.findByRole('heading', { name: 'Nueva ficha óptica' })).toBeInTheDocument();
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
    const productSection = screen
      .getByRole('heading', { name: 'Información del producto' })
      .closest('section');
    const frameSection = screen.getByRole('heading', { name: 'Armazón' }).closest('section');
    expect(productSection).not.toBeNull();
    expect(frameSection).not.toBeNull();
    const color = within(productSection!).getByLabelText('Color (opcional)');
    const coloration = within(productSection!).getByLabelText('Coloración');
    const productGrid = color.closest('div.grid');
    expect(color).toBeInTheDocument();
    expect(coloration).toBeInTheDocument();
    expect(productGrid).not.toBeNull();
    expect(coloration.closest('div.grid')).toBe(productGrid);
    expect(productGrid).toHaveClass('grid-cols-1', 'lg:grid-cols-2');
    expect(productGrid).not.toHaveClass('xl:grid-cols-3');
    expect(
      color.compareDocumentPosition(coloration) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(productSection!).queryByLabelText('Proveedor (opcional)'),
    ).not.toBeInTheDocument();
    expect(within(frameSection!).getByLabelText('Proveedor (opcional)')).toBeInTheDocument();

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
    await user.type(screen.getByLabelText(/Observaciones generales/), 'Nota general');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));

    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.prescription).toMatchObject({
      clientId: 7,
      additionOd: null,
      additionOi: null,
      notes: null,
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
      observations: 'Nota general',
    });
  });

  it('permite guardar un producto libre mediante la opción Otro', async () => {
    window.location.hash = '#/clientes/7/recetas/nueva';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('ESF lejos OD'), '1,00');
    await user.type(screen.getByLabelText(/Número de ficha/), 'OTRO-001');
    await user.click(screen.getByRole('radio', { name: 'Otro' }));
    const customProduct = screen.getByLabelText(/Nombre del producto/);
    expect(customProduct).toHaveFocus();
    await user.type(customProduct, 'Producto óptico personalizado');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));

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
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
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
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
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
    await user.type(screen.getByLabelText(/Número de ficha/), 'CERO-001');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.opticalJob).toMatchObject({ jobNumber: 'CERO-001' });
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
    await user.type(screen.getByLabelText(/Número de ficha/), 'ZETA-001');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));

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
    await user.type(screen.getByLabelText(/Número de ficha/), 'DOBLE-001');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardando…' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    resolveCreate(
      prescriptionSuccess({
        prescription: PRESCRIPTION,
        opticalJob: OPTICAL_JOB,
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
      await screen.findByRole('heading', { name: 'Graduación del 04/03/2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '#/fichas');
    expect(screen.getByText('+1,25')).toBeInTheDocument();
    expect(screen.getByText('-0,50')).toBeInTheDocument();
    expect(screen.queryByText('+1,50')).not.toBeInTheDocument();
    expect(screen.queryByText('Adición por ojo')).not.toBeInTheDocument();
    expect(screen.queryByText('ADD')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Lejos' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Cerca' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Revisión 1/)).toBeInTheDocument();
    expect(screen.getByText(/Error de carga/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Ver ficha/ })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/91',
    );
    expect(screen.getByText(/Graduación asociada a la ficha REC-91/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar ficha completa' })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/91/editar',
    );
  });

  it('corrige con motivo obligatorio y conserva el ID', async () => {
    window.location.hash = '#/recetas/11/corregir';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByLabelText('Observaciones (opcional)')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Guardar corrección' }));
    expect(screen.getByText('Indicá el motivo de la corrección.')).toBeInTheDocument();
    expect(screen.queryByLabelText('ADD OD')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('ESF lejos OD'));
    await user.type(screen.getByLabelText('ESF lejos OD'), '-2,25');
    await user.type(screen.getByLabelText(/Motivo de la corrección/), 'Error de transcripción');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(api.prescriptions.correct).toHaveBeenCalledWith(11, expect.any(Object));
    const [, correction] = api.prescriptions.correct.mock.calls[0] as unknown as [
      number,
      CorrectPrescriptionInput,
    ];
    expect(correction).toMatchObject({
      reason: 'Error de transcripción',
      additionOd: '1.50',
    });
    expect(correction.values).toContainEqual(
      expect.objectContaining({ distance: 'FAR', eye: 'OD', sphere: '-2.25' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#/fichas/receta/11'));
  });

  it('permite elegir la ficha desde el detalle de una graduación compartida', async () => {
    window.location.hash = '#/fichas/receta/11';
    const api = installApi();
    const sharedJob = {
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
    };
    api.opticalJobs.listByPrescription.mockResolvedValue({
      ok: true as const,
      data: {
        items: [sharedJob, { ...sharedJob, id: 92, jobNumber: 'REC-92' }],
        total: 2,
        limit: 100,
        offset: 0,
      },
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Graduación compartida' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar ficha completa' })).not.toBeInTheDocument();
    const editLinks = await screen.findAllByRole('link', { name: 'Editar esta ficha' });
    expect(editLinks.map((link) => link.getAttribute('href'))).toEqual([
      '#/fichas/trabajo/91/editar',
      '#/fichas/trabajo/92/editar',
    ]);
  });

  it('redirige una URL histórica a la edición unificada cuando existe una sola ficha', async () => {
    window.location.hash = '#/fichas/receta/11/corregir?jobId=91';
    const api = installApi();
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
        limit: 100,
        offset: 0,
      },
    });
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe('#/fichas/trabajo/91/editar'));
    expect(api.prescriptions.correct).not.toHaveBeenCalled();
  });

  it('ofrece selección explícita cuando una URL histórica corresponde a varias fichas', async () => {
    window.location.hash = '#/fichas/receta/11/corregir';
    const api = installApi();
    const sharedJob = {
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
    };
    api.opticalJobs.listByPrescription.mockResolvedValue({
      ok: true as const,
      data: {
        items: [sharedJob, { ...sharedJob, id: 92, jobNumber: 'REC-92' }],
        total: 2,
        limit: 100,
        offset: 0,
      },
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Elegí la ficha que querés editar' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Esta graduación está compartida por 2 fichas.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ficha REC-91' })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/91',
    );
    expect(screen.getByRole('link', { name: 'Ficha REC-92' })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/92',
    );
    const editLinks = await screen.findAllByRole('link', { name: 'Editar esta ficha' });
    expect(editLinks).toHaveLength(2);
    expect(editLinks[0]).toHaveAttribute('href', '#/fichas/trabajo/91/editar');
    expect(editLinks[1]).toHaveAttribute('href', '#/fichas/trabajo/92/editar');
    expect(screen.queryByRole('button', { name: 'Guardar corrección' })).not.toBeInTheDocument();
    expect(api.prescriptions.correct).not.toHaveBeenCalled();
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
