// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecurityGate } from '../../src/renderer/src/components/security/SecurityGate';
import { SettingsPage } from '../../src/renderer/src/pages/SettingsPage';
import type {
  BackupHistorySnapshot,
  BackupStatus,
  SecurityStatus,
} from '../../src/shared/database-models';
import type { SecurityResult } from '../../src/shared/ipc-contracts';

const unlocked: SecurityStatus = {
  configured: true,
  authenticated: true,
  inactivityMinutes: 15,
  retryAfterSeconds: 0,
};

const backupStatus: BackupStatus = {
  localDirectory: 'C:\\QA\\backups',
  exportDirectory: null,
  lastBackupAt: null,
  lastBackupFile: null,
  lastBackupSizeBytes: null,
  lastBackupExists: false,
  lastBackupAgeHours: null,
  lastErrorAt: null,
  lastExternalCopyAt: null,
  lastRestoreAt: null,
  automaticEnabled: false,
  automaticHour: 20,
  retentionCount: 14,
  due: false,
  alertLevel: 'NONE',
  externalCopyStatus: 'NOT_CONFIGURED',
  historyAvailable: true,
  historyRecoveredFromDamage: false,
  busy: false,
  remoteSyncVerified: false,
};

const emptyHistory: BackupHistorySnapshot = {
  events: [],
  available: true,
  recoveredFromDamage: false,
};

function installApis(configured: boolean) {
  const security = {
    status: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        data: { ...unlocked, configured, authenticated: false },
      }),
    ),
    setup: vi.fn(() => new Promise<never>(() => undefined)),
    login: vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'SECURITY', message: 'La contraseña no es correcta.' },
      }),
    ),
    logout: vi.fn(() => Promise.resolve({ ok: true as const, data: unlocked })),
    touch: vi.fn(() => Promise.resolve({ ok: true as const, data: unlocked })),
    changePassword: vi.fn((): Promise<SecurityResult<true>> =>
      Promise.resolve({ ok: true as const, data: true as const }),
    ),
    setInactivity: vi.fn(() => Promise.resolve({ ok: true as const, data: unlocked })),
  };
  const backup = {
    status: vi.fn(() => Promise.resolve({ ok: true as const, data: backupStatus })),
    history: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        data: emptyHistory,
      }),
    ),
    configure: vi.fn(() => Promise.resolve({ ok: true as const, data: backupStatus })),
    selectExportDirectory: vi.fn(() => Promise.resolve({ ok: true as const, data: backupStatus })),
    create: vi.fn(
      () =>
        new Promise<never>(() => {
          // The pending operation lets the test verify double-submit prevention.
        }),
    ),
    openDirectory: vi.fn((): Promise<SecurityResult<true>> =>
      Promise.resolve({ ok: true as const, data: true as const }),
    ),
    selectRestoreFile: vi.fn(() => Promise.resolve({ ok: true as const, data: null })),
    verify: vi.fn(),
    restore: vi.fn(),
  };
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: { security, backup },
  });
  return { security, backup };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('protección de acceso en React', () => {
  it('muestra configuración inicial y valida la repetición', async () => {
    const { security } = installApis(false);
    const user = userEvent.setup();
    render(<SecurityGate />);
    expect(await screen.findByRole('heading', { name: 'Proteger Occhiali' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Occhiali Óptica' })).toHaveAttribute(
      'src',
      expect.stringContaining('occhiali-logo-oscuro-transparente'),
    );
    const fields = screen.getAllByLabelText(/Contraseña|Repetir contraseña/);
    await user.type(fields[0]!, 'Acceso-Ficticio-2026');
    await user.type(fields[1]!, 'No-Coincide-2026');
    await user.click(screen.getByRole('button', { name: 'Configurar protección' }));
    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');
    expect(security.setup).not.toHaveBeenCalled();
  });

  it('envía una configuración válida una sola vez y muestra carga', async () => {
    const { security } = installApis(false);
    const user = userEvent.setup();
    render(<SecurityGate />);
    await screen.findByRole('heading', { name: 'Proteger Occhiali' });
    const fields = screen.getAllByLabelText(/Contraseña|Repetir contraseña/);
    await user.type(fields[0]!, 'Acceso-Ficticio-2026');
    await user.type(fields[1]!, 'Acceso-Ficticio-2026');
    await user.click(screen.getByRole('button', { name: 'Configurar protección' }));
    expect(security.setup).toHaveBeenCalledWith('Acceso-Ficticio-2026', 15);
    expect(screen.getByRole('button', { name: 'Comprobando…' })).toBeDisabled();
  });

  it('informa una contraseña de login incorrecta sin exponer detalles', async () => {
    installApis(true);
    const user = userEvent.setup();
    render(<SecurityGate />);
    expect(
      await screen.findByRole('heading', { name: 'Desbloquear Occhiali' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contraseña'), 'Acceso-Incorrecto-2026');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña no es correcta.');
  });
});

describe('configuración de respaldos en React', () => {
  it('muestra estado real, guarda programación y evita doble creación', async () => {
    const { backup } = installApis(true);
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(await screen.findByText(/Todavía no existe una copia válida/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Recordatorio diario'));
    await user.clear(screen.getByLabelText('Cantidad de respaldos'));
    await user.type(screen.getByLabelText('Cantidad de respaldos'), '7');
    await user.click(screen.getByRole('button', { name: 'Guardar programación' }));
    await waitFor(() => expect(backup.configure).toHaveBeenCalled());

    await user.type(
      screen.getByLabelText('Contraseña de recuperación'),
      'Recuperacion-Ficticia-2026',
    );
    const create = screen.getByRole('button', { name: 'Crear copia ahora' });
    await user.click(create);
    await user.click(create);
    expect(backup.create).toHaveBeenCalledTimes(1);
    expect(create).toBeDisabled();
  });

  it('muestra como error un cambio de contraseña rechazado', async () => {
    const { security } = installApis(true);
    security.changePassword.mockResolvedValue({
      ok: false as const,
      error: { code: 'SECURITY', message: 'La contraseña actual no es correcta.' },
    });
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.type(screen.getByLabelText('Contraseña actual'), 'Acceso-Incorrecto-2026');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'Acceso-Nuevo-Ficticio-2026');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La contraseña actual no es correcta.',
    );
  });

  it('informa cuando no puede abrir la carpeta de respaldos', async () => {
    const { backup } = installApis(true);
    backup.openDirectory.mockResolvedValue({
      ok: false as const,
      error: { code: 'BACKUP', message: 'No se pudo abrir la carpeta de respaldos.' },
    });
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(await screen.findByRole('button', { name: 'Ver carpeta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo abrir la carpeta de respaldos.',
    );
  });

  it('presenta el historial en un contenedor responsive sin exponer rutas', async () => {
    const { backup } = installApis(true);
    backup.history.mockResolvedValue({
      ok: true as const,
      data: {
        available: true,
        recoveredFromDamage: false,
        events: [
          {
            id: 'evento-1',
            occurredAt: '2026-10-19T12:00:00.000Z',
            operation: 'CREATE',
            result: 'PARTIAL',
            localState: 'VALID',
            externalState: 'FAILED',
            fileName: 'occhiali-backup-20261019120000000.ocbackup',
            sizeBytes: 2048,
            error: 'El respaldo local es válido, pero falló la copia externa.',
          },
        ],
      },
    });

    render(<SettingsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Historial de respaldos' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Parcial')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.queryByText(/C:\\QA\\backups/)).not.toBeInTheDocument();
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto');
  });
});
