// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';

const ok = <T,>(data: T) => ({ ok: true as const, data });

function installApi() {
  const dashboard = {
    getSummary: vi.fn(() =>
      Promise.resolve(ok({ activeClients: 4, totalPrescriptions: 7, totalOpticalJobs: 9 })),
    ),
  };
  const search = {
    global: vi.fn(() =>
      Promise.resolve(
        ok({
          clients: [
            {
              id: 1,
              firstName: 'María',
              lastName: 'Núñez',
              documentNumber: '30123456',
              phone: null,
              isArchived: false,
            },
          ],
          prescriptions: [
            {
              id: 2,
              clientId: 1,
              clientFirstName: 'María',
              clientLastName: 'Núñez',
              prescriptionDate: '2026-10-01',
            },
          ],
          opticalJobs: [
            {
              id: 3,
              clientId: 1,
              clientFirstName: 'María',
              clientLastName: 'Núñez',
              jobNumber: 'OC-3',
              product: 'Anteojos',
            },
          ],
          limit: 5,
        }),
      ),
    ),
  };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(() => Promise.resolve({ name: 'OCCHIALI', version: '0.1.0' })),
      dashboard,
      search,
      clients: {
        list: vi.fn(() => Promise.resolve(ok({ items: [], total: 0, limit: 25, offset: 0 }))),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
        restore: vi.fn(),
      },
      prescriptions: {
        list: vi.fn(() => Promise.resolve(ok({ items: [], total: 0, limit: 25, offset: 0 }))),
        listByClient: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        correct: vi.fn(),
        revisions: vi.fn(),
      },
      opticalJobs: {
        list: vi.fn(() => Promise.resolve(ok({ items: [], total: 0, limit: 25, offset: 0 }))),
        listByClient: vi.fn(),
        listByPrescription: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      treatments: { list: vi.fn(() => Promise.resolve(ok([]))) },
    },
  });
  return { dashboard, search };
}

describe('dashboard y búsqueda integrada', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('muestra indicadores reales y accesos rápidos funcionales', async () => {
    installApi();
    render(<App />);
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nuevo cliente/ })).toHaveAttribute(
      'href',
      '#/clientes/nuevo',
    );
    expect(screen.getByRole('link', { name: /Buscar cliente/ })).toHaveAttribute(
      'href',
      '#/clientes',
    );
    expect(screen.getByRole('link', { name: /Nueva receta/ })).toHaveAttribute(
      'href',
      '#/recetas/nueva',
    );
    expect(screen.getByRole('link', { name: /Nueva ficha óptica/ })).toHaveAttribute(
      'href',
      '#/trabajos/nuevo',
    );
  });

  it('muestra ceros reales cuando la base está vacía', async () => {
    const api = installApi();
    api.dashboard.getSummary.mockResolvedValueOnce(
      ok({ activeClients: 0, totalPrescriptions: 0, totalOpticalJobs: 0 }),
    );
    render(<App />);
    expect(await screen.findAllByText('0')).toHaveLength(3);
  });

  it('permite recuperar un error del dashboard', async () => {
    const api = installApi();
    api.dashboard.getSummary.mockRejectedValueOnce(new Error('fallo interno'));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron consultar');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Clientes activos')).toBeInTheDocument();
  });

  it('busca con debounce, agrupa resultados y limita la solicitud', async () => {
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByRole('searchbox', { name: 'Buscar en Occhiali' });
    expect(api.search.global).not.toHaveBeenCalled();
    await user.type(input, 'Nuñez');
    await waitFor(() =>
      expect(api.search.global).toHaveBeenCalledWith({ query: 'Nuñez', limit: 5 }),
    );
    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recetas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fichas' })).toBeInTheDocument();
    const clientSection = screen.getByRole('heading', { name: 'Clientes' }).closest('section');
    if (!clientSection) throw new Error('No se encontró el grupo de clientes.');
    expect(within(clientSection).getByRole('link', { name: /Núñez, María/ })).toHaveAttribute(
      'href',
      '#/clientes/1',
    );
    expect(screen.getByRole('link', { name: /Receta del/ })).toHaveAttribute('href', '#/recetas/2');
    expect(screen.getByRole('link', { name: /Ficha OC-3/ })).toHaveAttribute(
      'href',
      '#/trabajos/3',
    );
  });

  it('enfoca con Ctrl+K y cierra los resultados con Escape', async () => {
    installApi();
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByRole('searchbox', { name: 'Buscar en Occhiali' });
    await user.keyboard('{Control>}k{/Control}');
    expect(input).toHaveFocus();
    await user.type(input, 'María');
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: 'Clientes' })).not.toBeInTheDocument();
  });

  it('muestra estados sin resultados y de error sin filtrar detalles', async () => {
    const api = installApi();
    api.search.global.mockResolvedValueOnce(
      ok({ clients: [], prescriptions: [], opticalJobs: [], limit: 5 }),
    );
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByRole('searchbox', { name: 'Buscar en Occhiali' });
    await user.type(input, 'nadie');
    expect(await screen.findByText(/No encontramos resultados/)).toBeInTheDocument();
    api.search.global.mockRejectedValueOnce(new Error('C:\\dato-privado'));
    await user.clear(input);
    await user.type(input, 'error');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar');
    expect(screen.queryByText(/dato-privado/)).not.toBeInTheDocument();
  });

  it('limpia la búsqueda global sin ejecutar una consulta vacía', async () => {
    const api = installApi();
    const user = userEvent.setup();
    render(<App />);
    const searchRegion = screen.getByRole('search', { name: 'Búsqueda global' });
    const input = within(searchRegion).getByRole('searchbox');
    await user.type(input, 'María');
    await waitFor(() => expect(api.search.global).toHaveBeenCalledTimes(1));
    await user.click(within(searchRegion).getByRole('button', { name: 'Limpiar búsqueda global' }));
    expect(input).toHaveValue('');
    expect(api.search.global).toHaveBeenCalledTimes(1);
  });
});
