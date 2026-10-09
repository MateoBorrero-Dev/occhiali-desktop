// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import type { Client, ClientListPage } from '../../src/shared/database-models';
import type { ClientIpcResult } from '../../src/shared/ipc-contracts';

const CLIENT: Client = {
  id: 1,
  firstName: 'Ana',
  lastName: 'Prueba',
  documentNumber: '12345678',
  phone: '11 4444 5555',
  address: 'Calle Ficticia 123',
  birthDate: '1985-04-12',
  notes: 'Cliente ficticia para pruebas.',
  isArchived: false,
  createdAt: '2026-01-10T12:00:00.000Z',
  updatedAt: '2026-01-10T12:00:00.000Z',
};

function success<T>(data: T): ClientIpcResult<T> {
  return { ok: true, data };
}

function page(items: Client[] = []): ClientListPage {
  return { items, total: items.length, limit: 25, offset: 0 };
}

function installApi() {
  const clients = {
    list: vi.fn(() => Promise.resolve(success(page()))),
    get: vi.fn(() => Promise.resolve(success(CLIENT))),
    create: vi.fn(() => Promise.resolve(success(CLIENT))),
    update: vi.fn(() => Promise.resolve(success(CLIENT))),
    archive: vi.fn(() => Promise.resolve(success({ ...CLIENT, isArchived: true }))),
    restore: vi.fn(() => Promise.resolve(success(CLIENT))),
  };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '0.1.0' })),
      clients,
      prescriptions: {
        list: vi.fn(() =>
          Promise.resolve({
            ok: true as const,
            data: { items: [], total: 0, limit: 25, offset: 0 },
          }),
        ),
        listByClient: vi.fn(() =>
          Promise.resolve({
            ok: true as const,
            data: { items: [], total: 0, limit: 10, offset: 0 },
          }),
        ),
        get: vi.fn(),
        create: vi.fn(),
        correct: vi.fn(),
        revisions: vi.fn(),
      },
      opticalJobs: {
        list: vi.fn(() =>
          Promise.resolve({
            ok: true as const,
            data: { items: [], total: 0, limit: 25, offset: 0 },
          }),
        ),
        listByClient: vi.fn(() =>
          Promise.resolve({
            ok: true as const,
            data: { items: [], total: 0, limit: 10, offset: 0 },
          }),
        ),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      treatments: { list: vi.fn(() => Promise.resolve({ ok: true as const, data: [] })) },
    },
  });
  return clients;
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/Nombre/), 'Ana');
  await user.type(screen.getByLabelText(/Apellido/), 'Prueba');
}

describe('módulo de clientes', () => {
  beforeEach(() => {
    window.location.hash = '#/clientes';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('muestra el estado vacío y la acción de registrar el primer cliente', async () => {
    installApi();
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay clientes registrados.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Registrar primer cliente/ })).toBeInTheDocument();
  });

  it('muestra clientes provenientes del puente IPC y abre su ficha', async () => {
    const api = installApi();
    api.list.mockResolvedValue(success(page([CLIENT])));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Prueba, Ana')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Abrir ficha de Ana Prueba' }));
    expect(await screen.findByRole('heading', { name: 'Ana Prueba' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(1);
  });

  it('busca con debounce por el texto ingresado', async () => {
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('searchbox', { name: 'Buscar clientes' }), 'Ana');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'Ana', status: 'active' }),
      ),
    );
  });

  it('muestra sin resultados y permite limpiar la búsqueda', async () => {
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('searchbox', { name: 'Buscar clientes' }), 'Nadie');
    expect(
      await screen.findByRole('heading', { name: 'No encontramos clientes con esa búsqueda.' }),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Limpiar búsqueda' })[0]!);
    expect(screen.getByRole('searchbox', { name: 'Buscar clientes' })).toHaveValue('');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ query: '' })),
    );
  });

  it('consulta el filtro de archivados', async () => {
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Archivados' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'archived' })),
    );
  });

  it('muestra un error de carga controlado y permite reintentar', async () => {
    const api = installApi();
    api.list.mockRejectedValueOnce(new Error('detalle técnico'));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el listado');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay clientes registrados.' }),
    ).toBeInTheDocument();
  });

  it('valida nombre y apellido antes de guardar', async () => {
    window.location.hash = '#/clientes/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(screen.getByText('El nombre es obligatorio.')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Nombre/), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(screen.getByText('El apellido es obligatorio.')).toBeInTheDocument();
  });

  it('crea un cliente válido sin exigir DNI y navega a su ficha', async () => {
    window.location.hash = '#/clientes/nuevo';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(await screen.findByText('Cliente registrado correctamente.')).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ documentNumber: null }));
  });

  it('muestra el error comprensible de DNI duplicado junto al campo', async () => {
    window.location.hash = '#/clientes/nuevo';
    const api = installApi();
    api.create.mockResolvedValue({
      ok: false,
      error: {
        code: 'DUPLICATE_DOCUMENT',
        message: 'Ya existe un cliente registrado con ese DNI.',
      },
    });
    const user = userEvent.setup();
    render(<App />);

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/DNI/), '12.345.678');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(
      await screen.findByText('Ya existe un cliente registrado con ese DNI.'),
    ).toBeInTheDocument();
  });

  it('previene el doble envío mientras el alta está en curso', async () => {
    window.location.hash = '#/clientes/nuevo';
    const api = installApi();
    let resolveCreate!: (value: ClientIpcResult<Client>) => void;
    api.create.mockImplementation(
      () => new Promise<ClientIpcResult<Client>>((resolve) => (resolveCreate = resolve)),
    );
    const user = userEvent.setup();
    render(<App />);

    await fillRequiredFields(user);
    const save = screen.getByRole('button', { name: 'Guardar cliente' });
    await user.click(save);
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardando…' }));
    expect(api.create).toHaveBeenCalledOnce();
    resolveCreate(success(CLIENT));
    expect(await screen.findByText('Cliente registrado correctamente.')).toBeInTheDocument();
  });

  it('muestra un estado de cliente inexistente', async () => {
    window.location.hash = '#/clientes/999';
    const api = installApi();
    api.get.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No existe el cliente solicitado.' },
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Cliente no encontrado' }),
    ).toBeInTheDocument();
  });

  it('edita el cliente conservando su ID', async () => {
    window.location.hash = '#/clientes/1/editar';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    const phone = await screen.findByLabelText(/Teléfono/);
    await user.clear(phone);
    await user.type(phone, '11 9999 0000');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ phone: '11 9999 0000' }));
    expect(await screen.findByText('Cambios guardados correctamente.')).toBeInTheDocument();
  });

  it('solicita confirmación y archiva sin eliminar la ficha', async () => {
    window.location.hash = '#/clientes/1';
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Archivar cliente' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/historial se conservarán/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Archivar cliente' }));
    expect(
      await screen.findByText('Cliente archivado. Su historial permanece disponible.'),
    ).toBeInTheDocument();
    expect(api.archive).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Reactivar cliente' })).toBeInTheDocument();
  });

  it('reactiva un cliente archivado', async () => {
    window.location.hash = '#/clientes/1';
    const api = installApi();
    api.get.mockResolvedValue(success({ ...CLIENT, isArchived: true }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Reactivar cliente' }));
    expect(await screen.findByText('Cliente reactivado correctamente.')).toBeInTheDocument();
    expect(api.restore).toHaveBeenCalledWith(1);
  });

  it('muestra el historial de recetas real sin inventar datos', async () => {
    window.location.hash = '#/clientes/1';
    installApi();
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Historial de recetas' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay recetas registradas.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nueva receta/ })).toHaveAttribute(
      'href',
      '#/clientes/1/recetas/nueva',
    );
  });
});
