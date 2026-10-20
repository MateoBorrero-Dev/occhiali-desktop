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
import type { BackupApi, SecurityResult } from '../../src/shared/ipc-contracts';

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
  nextExternalRetryAt: null,
  externalRetryAttempts: 0,
  lastRestoreAt: null,
  lastAutomaticBackupAt: null,
  lastAutomaticAttemptAt: null,
  lastAutomaticErrorAt: null,
  automaticEnabled: false,
  automaticHour: 20,
  retentionCount: 14,
  protectedCredentialState: 'MISSING',
  automaticState: 'DISABLED',
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
    setAutomaticCredential: vi.fn(() => Promise.resolve({ ok: true as const, data: backupStatus })),
    clearAutomaticCredential: vi.fn(() =>
      Promise.resolve({ ok: true as const, data: backupStatus }),
    ),
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
    selectRestoreFile: vi.fn<BackupApi['selectRestoreFile']>(() =>
      Promise.resolve({ ok: true as const, data: null }),
    ),
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
  it('no informa que la automatización está al día antes de la primera copia', async () => {
    const { backup } = installApis(true);
    backup.status.mockResolvedValue({
      ok: true as const,
      data: {
        ...backupStatus,
        automaticEnabled: true,
        protectedCredentialState: 'READY',
        automaticState: 'PENDING',
      },
    });

    render(<SettingsPage />);

    expect(await screen.findByText('Esperando primera copia programada')).toBeInTheDocument();
    expect(screen.queryByText('Automática y al día')).not.toBeInTheDocument();
  });

  it('muestra estado real, guarda programación y evita doble creación', async () => {
    const { backup } = installApis(true);
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(await screen.findByText(/Todavía no existe una copia válida/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Modo automático/));
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
            id: 'evento-iniciado',
            occurredAt: '2026-10-19T11:59:59.000Z',
            operation: 'CREATE',
            trigger: 'AUTOMATIC',
            result: 'STARTED',
            localState: 'NOT_APPLICABLE',
            externalState: 'UNKNOWN',
          },
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
    expect(screen.getByText('Iniciado')).toBeInTheDocument();
    expect(
      screen.getByText('Operación iniciada; el resultado final se registra por separado.'),
    ).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.queryByText(/C:\\QA\\backups/)).not.toBeInTheDocument();
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto');
  });

  it('advierte claramente cuando falla la copia externa pero el respaldo local es válido', async () => {
    const { backup } = installApis(true);
    backup.status.mockResolvedValue({
      ok: true as const,
      data: {
        ...backupStatus,
        lastBackupAt: '2026-10-20T04:00:00.000Z',
        lastBackupFile: 'occhiali-backup-20261020040000000.ocbackup',
        lastBackupExists: true,
        lastBackupSizeBytes: 2048,
        externalCopyStatus: 'FAILED',
      },
    });

    render(<SettingsPage />);

    expect(await screen.findByText('Última copia fallida')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El respaldo local se creó correctamente, pero falló la copia externa.',
    );
  });

  it('configura la credencial automática sin permitir verla ni recuperarla', async () => {
    const { backup } = installApis(true);
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.type(
      await screen.findByLabelText('Contraseña automática'),
      'Recuperacion-Automatica-2026',
    );
    await user.type(
      screen.getByLabelText('Repetir contraseña automática'),
      'Recuperacion-Automatica-2026',
    );
    expect(screen.getByLabelText('Contraseña automática')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /Proteger contraseña/ }));

    expect(backup.setAutomaticCredential).toHaveBeenCalledWith('Recuperacion-Automatica-2026');
    expect(screen.queryByText('Recuperacion-Automatica-2026')).not.toBeInTheDocument();
  });

  it('rechaza localmente contraseñas automáticas que no coinciden', async () => {
    const { backup } = installApis(true);
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.type(await screen.findByLabelText('Contraseña automática'), 'Primera-Ficticia-2026');
    await user.type(
      screen.getByLabelText('Repetir contraseña automática'),
      'Segunda-Ficticia-2026',
    );
    await user.click(screen.getByRole('button', { name: /Proteger contraseña/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no coinciden');
    expect(backup.setAutomaticCredential).not.toHaveBeenCalled();
  });

  it('advierte la fecha y la pérdida de cambios antes de restaurar datos antiguos', async () => {
    const { backup } = installApis(true);
    backup.selectRestoreFile.mockResolvedValue({
      ok: true as const,
      data: { fileName: 'occhiali-backup-20261018090000000.ocbackup' },
    });
    backup.verify.mockResolvedValue({
      ok: true as const,
      data: {
        formatVersion: 1,
        createdAt: '2026-10-18T12:00:00.000Z',
        appVersion: '0.9.0',
        schemaMigrations: ['001_initial_schema'],
      },
    });
    backup.restore.mockResolvedValue({
      ok: true as const,
      data: { restartRequired: true as const },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.type(
      await screen.findByLabelText('Contraseña de recuperación'),
      'Recuperacion-Historica-2026',
    );
    await user.click(screen.getByRole('button', { name: 'Seleccionar respaldo' }));
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'se perderán los cambios realizados después de esa fecha',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Occhiali 0.9.0');

    await user.click(screen.getByRole('button', { name: 'Restaurar respaldo' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Los cambios posteriores'));
    expect(backup.restore).toHaveBeenCalledWith('Recuperacion-Historica-2026', true);
  });
});
