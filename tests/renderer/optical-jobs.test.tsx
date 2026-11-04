// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import type {
  Client,
  CreatePrescriptionBundleInput,
  OpticalJob,
  OpticalJobListPage,
  PrescriptionListPage,
  PrescriptionsByClientRequest,
  Treatment,
  Prescription,
  UpdateOpticalFileInput,
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
  lens: 'Orgánico 1.60',
  brand: 'Marca ficticia',
  frameCondition: 'NEW',
  frameMaterial: 'METAL',
  frameModel: 'Modelo ficticio',
  productColor: 'Carey',
  supplier: 'Proveedor ficticio',
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
const PRESCRIPTION: Prescription = {
  id: 3,
  clientId: 5,
  prescriptionDate: '2026-03-01',
  prescriberName: 'Profesional Ficticio',
  additionOd: null,
  additionOi: null,
  notes: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  values: [
    {
      id: 1,
      prescriptionId: 3,
      distance: 'FAR',
      eye: 'OD',
      sphere: '-1.00',
      cylinder: null,
      axis: null,
      dip: null,
      height: null,
    },
  ],
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
    get: vi.fn(() => Promise.resolve(ok(PRESCRIPTION))),
    create: vi.fn(),
    createIntegrated: vi.fn((input: CreatePrescriptionBundleInput) =>
      Promise.resolve(
        ok({ prescription: PRESCRIPTION, opticalJob: { ...JOB, ...input.opticalJob } }),
      ),
    ),
    correct: vi.fn(),
    revisions: vi.fn(() => Promise.resolve(ok([]))),
  };
  const opticalJobs = {
    list: vi.fn(() => Promise.resolve(ok(page))),
    listFiles: vi.fn(() =>
      Promise.resolve(
        ok({
          items: items.map((item) => ({
            kind: 'JOB' as const,
            recordId: item.id,
            jobId: item.id,
            prescriptionId: item.prescriptionId,
            clientId: item.clientId,
            clientFirstName: item.clientFirstName,
            clientLastName: item.clientLastName,
            fileDate: item.createdAt.slice(0, 10),
            jobNumber: item.jobNumber,
            product: item.product,
            createdAt: item.createdAt,
            relatedJobCount: item.prescriptionId ? 1 : 0,
          })),
          total: items.length,
          limit: 25,
          offset: 0,
        }),
      ),
    ),
    listByClient: vi.fn(() => Promise.resolve(ok({ ...page, limit: 10 }))),
    listByPrescription: vi.fn(() => Promise.resolve(ok({ ...page, limit: 10 }))),
    get: vi.fn(() => Promise.resolve(ok(JOB))),
    create: vi.fn(() => Promise.resolve(ok(JOB))),
    update: vi.fn(() => Promise.resolve(ok(JOB))),
    updateFile: vi.fn(() =>
      Promise.resolve(
        ok({
          opticalJob: JOB,
          prescription: PRESCRIPTION,
          prescriptionRevisionCreated: false,
        }),
      ),
    ),
  };
  const treatments = { list: vi.fn(() => Promise.resolve(ok(TREATMENTS))) };
  const deliveryReceipts = {
    get: vi.fn(),
    getByJob: vi.fn(() => Promise.resolve(ok(null))),
    create: vi.fn(),
    addEvent: vi.fn(),
    exportPdf: vi.fn(),
  };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '0.1.0' })),
      clients,
      prescriptions,
      opticalJobs,
      treatments,
      deliveryReceipts,
      dashboard: { getSummary: vi.fn() },
      search: { global: vi.fn() },
    },
  });
  return { clients, prescriptions, opticalJobs, treatments, deliveryReceipts };
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
    expect(screen.getByRole('link', { name: /Ver ficha/ })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/9',
    );
  });

  it('busca por número, cliente o producto con debounce', async () => {
    const api = installApi([]);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar fichas' }), '000152');
    await waitFor(() =>
      expect(api.opticalJobs.listFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: '000152' }),
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'No encontramos fichas con esa búsqueda.' }),
    ).toBeInTheDocument();
  });

  it('muestra error recuperable y estado vacío', async () => {
    const api = installApi([]);
    api.opticalJobs.listFiles.mockRejectedValueOnce(new Error('fallo interno'));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay fichas ópticas.' }),
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
    expect(screen.getByText('Ficticia, Laura')).toBeInTheDocument();
    expect(screen.queryByLabelText('Receta')).not.toBeInTheDocument();
  });

  it('usa el alta integrada también desde la ruta histórica de trabajos', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Nueva ficha óptica' })).toBeInTheDocument();
    expect(screen.getByLabelText('ESF lejos OD')).toBeInTheDocument();
    expect(screen.queryByLabelText('Receta')).not.toBeInTheDocument();
    expect(api.prescriptions.listByClient).not.toHaveBeenCalled();
  });

  it('guarda producto libre, color, proveedor, tratamientos libres y coloración', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('ESF lejos OD'), '-1,00');
    await user.type(screen.getByLabelText(/Número de ficha/), '000152');
    await user.click(screen.getByRole('radio', { name: 'Anteojos de receta' }));
    await user.selectOptions(screen.getByLabelText('Condición'), 'NEW');
    await user.selectOptions(screen.getByLabelText('Material'), 'METAL');
    await user.type(screen.getByLabelText(/Modelo/), 'Modelo ficticio');
    await user.type(screen.getByLabelText(/Color \(opcional\)/), 'Carey');
    await user.type(screen.getByLabelText(/Proveedor/), 'Proveedor ficticio');
    await user.type(
      screen.getByLabelText('Tratamientos (opcional)'),
      'Antirrayas Stark, AR ASA Pro',
    );
    await user.selectOptions(screen.getByLabelText('Coloración'), 'GRADIENT');
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]?.[0];
    expect(submitted?.prescription.clientId).toBe(5);
    expect(submitted?.opticalJob).toMatchObject({
      jobNumber: '000152',
      frameCondition: 'NEW',
      frameMaterial: 'METAL',
      productColor: 'Carey',
      supplier: 'Proveedor ficticio',
      colorType: 'GRADIENT',
      treatmentNames: ['Antirrayas Stark', 'AR ASA Pro'],
    });
  });

  it('permite lentes de contacto sin cerrar los productos a una lista', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText(/Número de ficha/), 'LC-001');
    await user.click(screen.getByRole('radio', { name: 'Lentes de contacto' }));
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    const submitted = api.prescriptions.createIntegrated.mock.calls[0]![0];
    expect(submitted.opticalJob).toMatchObject({
      jobNumber: 'LC-001',
      product: 'Lentes de contacto',
      treatmentNames: [],
    });
    expect(submitted.prescription.values).toEqual([]);
  });

  it('previene doble envío durante el guardado', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    let resolveCreate!: (
      value: ReturnType<typeof ok<{ prescription: Prescription; opticalJob: OpticalJob }>>,
    ) => void;
    api.prescriptions.createIntegrated.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('Tratamientos (opcional)');
    await user.type(screen.getByLabelText(/Número de ficha/), 'DOBLE-001');
    await user.click(screen.getByRole('radio', { name: 'Lentes de contacto' }));
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardando…' }));
    expect(api.prescriptions.createIntegrated).toHaveBeenCalledOnce();
    resolveCreate(ok({ prescription: PRESCRIPTION, opticalJob: JOB }));
  });

  it('muestra detalle comercial, receta y tratamientos sin lenguaje médico', async () => {
    window.location.hash = '#/trabajos/9';
    installApi();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Ficha 000152' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '#/fichas');
    expect(screen.getByText('Orgánico 1.60')).toBeInTheDocument();
    expect(screen.getByText('Marca ficticia')).toBeInTheDocument();
    expect(screen.getByText('Carey')).toBeInTheDocument();
    expect(screen.getByText('Proveedor ficticio')).toBeInTheDocument();
    expect(screen.getByText('Color degradé')).toBeInTheDocument();
    const productSection = screen
      .getByRole('heading', { name: 'Información del producto' })
      .closest('section');
    const frameSection = screen.getByRole('heading', { name: 'Armazón' }).closest('section');
    expect(productSection).not.toBeNull();
    expect(frameSection).not.toBeNull();
    expect(within(productSection!).getByText('Carey')).toBeInTheDocument();
    expect(within(productSection!).getByText('Color degradé')).toBeInTheDocument();
    expect(within(productSection!).queryByText('Proveedor ficticio')).not.toBeInTheDocument();
    expect(within(frameSection!).getByText('Proveedor ficticio')).toBeInTheDocument();
    expect(screen.getByText('Antirrayas Stark')).toBeInTheDocument();
    const graduationHeading = screen.getByRole('heading', { name: 'Graduación' });
    const treatmentsHeading = screen.getByRole('heading', { name: 'Tratamientos' });
    const historyHeading = screen.getByRole('heading', { name: 'Historial de correcciones' });
    expect(graduationHeading).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Adición por ojo' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lejos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cerca' })).toBeInTheDocument();
    expect(
      graduationHeading.compareDocumentPosition(treatmentsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      treatmentsHeading.compareDocumentPosition(historyHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Editar ficha completa' })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/9/editar',
    );
    expect(screen.getByText(/no procedimientos médicos/)).toBeInTheDocument();
  });

  it('edita valores actuales conservando cliente e ID', async () => {
    window.location.hash = '#/trabajos/9/editar';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    const model = await screen.findByLabelText(/Modelo/);
    const orderedHeadings = [
      screen.getByRole('heading', { name: 'Cliente y datos generales' }),
      screen.getByRole('heading', { name: 'Graduaciones' }),
      screen.getByRole('heading', { name: 'Información del producto' }),
      screen.getByRole('heading', { name: 'Armazón' }),
      screen.getByRole('heading', { name: 'Observaciones' }),
    ];
    for (let index = 1; index < orderedHeadings.length; index += 1) {
      expect(
        orderedHeadings[index - 1]!.compareDocumentPosition(orderedHeadings[index]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: 'Guardar cambios' })).toHaveLength(1);
    expect(screen.queryByText('ADD')).not.toBeInTheDocument();
    expect(screen.queryByText('Adición por ojo')).not.toBeInTheDocument();
    const productSection = screen
      .getByRole('heading', { name: 'Información del producto' })
      .closest('section');
    const frameSection = screen.getByRole('heading', { name: 'Armazón' }).closest('section');
    expect(productSection).not.toBeNull();
    expect(frameSection).not.toBeNull();
    expect(within(productSection!).getByLabelText('Color (opcional)')).toBeInTheDocument();
    const coloration = within(productSection!).getByLabelText<HTMLSelectElement>(/^Coloración/);
    expect(coloration).toBeInTheDocument();
    expect(coloration.options[0]?.value).toBe('');
    expect(coloration.options[0]?.textContent).toBe('');
    expect(
      within(productSection!).queryByLabelText('Proveedor (opcional)'),
    ).not.toBeInTheDocument();
    expect(within(frameSection!).getByLabelText('Proveedor (opcional)')).toBeInTheDocument();
    await user.clear(model);
    await user.type(model, 'Modelo actualizado');
    expect(screen.queryByLabelText('Receta')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(api.opticalJobs.updateFile).toHaveBeenCalledWith(9, expect.any(Object));
    const [, commercialInput] = api.opticalJobs.updateFile.mock.calls[0] as unknown as [
      number,
      UpdateOpticalFileInput,
    ];
    expect(commercialInput).toMatchObject({
      opticalJob: {
        lens: 'Orgánico 1.60',
        brand: 'Marca ficticia',
        frameModel: 'Modelo actualizado',
        treatmentNames: ['Antirrayas Stark'],
      },
      prescription: null,
    });
    await waitFor(() => expect(window.location.hash).toBe('#/fichas/trabajo/9'));
    expect(screen.queryByText(/Guardar datos comerciales/)).not.toBeInTheDocument();
  });

  it('conserva la nota histórica como solo lectura y envía una única observación editable', async () => {
    window.location.hash = '#/fichas/trabajo/9/editar';
    const api = installApi();
    api.prescriptions.get.mockResolvedValue(
      ok({ ...PRESCRIPTION, notes: 'Nota histórica que debe conservarse.' }),
    );
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Nota histórica que debe conservarse.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota histórica de receta')).not.toHaveAttribute(
      'contenteditable',
    );
    expect(screen.queryByLabelText('Observaciones (opcional)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Observaciones generales (opcional)')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('ESF lejos OD'));
    await user.type(screen.getByLabelText('ESF lejos OD'), '-2,00');
    await user.type(
      screen.getByLabelText(/Motivo de la corrección óptica/),
      'Corrección controlada',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(api.opticalJobs.updateFile).toHaveBeenCalledWith(9, expect.any(Object));
    const [, correctionInput] = api.opticalJobs.updateFile.mock.calls[0] as unknown as [
      number,
      UpdateOpticalFileInput,
    ];
    expect(correctionInput.prescription).toMatchObject({
      notes: 'Nota histórica que debe conservarse.',
      reason: 'Corrección controlada',
      additionOd: null,
      additionOi: null,
    });
  });

  it('explica que debe corregirse la graduación antes de cambiar a anteojos', async () => {
    window.location.hash = '#/fichas/trabajo/9/editar';
    const api = installApi();
    api.opticalJobs.get.mockResolvedValue(ok({ ...JOB, product: 'Lentes de contacto' }));
    api.opticalJobs.updateFile.mockResolvedValue({
      ok: false as const,
      error: {
        code: 'VALIDATION' as const,
        message: 'Revisá los datos ingresados.',
        fields: {
          product:
            'Primero corregí la graduación de la ficha antes de cambiar el producto a anteojos de receta.',
        },
      },
    } as never);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('radio', { name: 'Anteojos de receta' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText(
        'Primero corregí la graduación de la ficha antes de cambiar el producto a anteojos de receta.',
      ),
    ).toBeInTheDocument();
  });

  it('advierte qué fichas comparten la graduación desde la edición unificada', async () => {
    window.location.hash = '#/fichas/trabajo/9/editar';
    const api = installApi();
    api.opticalJobs.listByPrescription.mockResolvedValue(
      ok({
        items: [
          SUMMARY,
          {
            ...SUMMARY,
            id: 10,
            jobNumber: '000153',
            product: 'Lentes de sol',
          },
        ],
        total: 125,
        limit: 100,
        offset: 0,
      }),
    );
    render(<App />);

    expect(
      await screen.findByText('Esta graduación está compartida por 125 fichas.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Esta advertencia muestra 2 de las 125 fichas afectadas.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: /Confirmo que una corrección de graduación afectará a todas las fichas vinculadas/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ficha 000152 (actual)' })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/9',
    );
    expect(screen.getByRole('link', { name: 'Ficha 000153' })).toHaveAttribute(
      'href',
      '#/fichas/trabajo/10',
    );
    expect(
      screen.getByRole('link', { name: 'Consultar todas las fichas relacionadas' }),
    ).toHaveAttribute('href', '#/fichas/receta/3');
  });

  it('bloquea nuevas fichas de clientes archivados', async () => {
    window.location.hash = '#/clientes/5/trabajos/nuevo';
    const api = installApi();
    api.clients.get.mockResolvedValue(ok({ ...CLIENT, isArchived: true }));
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'El cliente está archivado' }),
    ).toBeInTheDocument();
    expect(api.prescriptions.createIntegrated).not.toHaveBeenCalled();
  });
});
