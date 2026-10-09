// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/app/App';
import { Button } from '../../src/renderer/src/components/ui/Button';

function mockAppInfo(
  implementation: () => Promise<{ name: string; version: string }> = () =>
    Promise.resolve({ name: 'OCCHIALI', version: '0.1.0' }),
): void {
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      getAppInfo: vi.fn(implementation),
      clients: {
        list: vi.fn(() =>
          Promise.resolve({
            ok: true as const,
            data: { items: [], total: 0, limit: 25, offset: 0 },
          }),
        ),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
        restore: vi.fn(),
      },
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
}

describe('interfaz principal', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    mockAppInfo();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renderiza el layout, la identidad y la navegación principal', () => {
    render(<App />);

    expect(screen.getByText('OCCHIALI')).toBeInTheDocument();
    expect(screen.getByText('Sistema de Gestión Óptica')).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(5);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Bienvenida a Occhiali' }),
    ).toBeInTheDocument();
  });

  it('muestra el estado local y la versión obtenida por el preload', async () => {
    render(<App />);

    expect(await screen.findByText('Sistema local listo')).toBeInTheDocument();
    expect(screen.getByText('Versión 0.1.0')).toBeInTheDocument();
  });

  it('muestra un mensaje comprensible si el estado del sistema no está disponible', async () => {
    mockAppInfo(() => Promise.reject(new Error('fallo simulado')));
    render(<App />);

    expect(await screen.findByText('Estado no disponible')).toBeInTheDocument();
    expect(screen.queryByText('fallo simulado')).not.toBeInTheDocument();
  });

  it('navega con la sidebar entre las pantallas principales', async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });

    await user.click(within(navigation).getByRole('link', { name: 'Clientes' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Clientes' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(navigation).getByRole('link', { name: 'Recetas' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Recetas' })).toBeInTheDocument();

    await user.click(within(navigation).getByRole('link', { name: 'Trabajos' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Trabajos' })).toBeInTheDocument();

    await user.click(within(navigation).getByRole('link', { name: 'Configuración' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument();
  });

  it('ofrece accesos rápidos funcionales desde Inicio', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /Ir a recetas/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Recetas' })).toBeInTheDocument();
  });

  it('presenta estados vacíos reales de clientes y trabajos', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: 'Clientes' }));
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Todavía no hay clientes registrados.',
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Trabajos' }));
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Todavía no hay fichas de trabajo.',
      }),
    ).toBeInTheDocument();
  });

  it('renderiza una página no encontrada y permite volver al inicio', async () => {
    window.location.hash = '#/ruta-inexistente';
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Bienvenida a Occhiali' }),
    ).toBeInTheDocument();
  });
});

describe('Button', () => {
  afterEach(cleanup);

  it('admite foco y activación por teclado', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respeta el estado deshabilitado', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
