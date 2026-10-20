// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupAlertBanner } from '../../src/renderer/src/components/backup/BackupAlertBanner';
import type { BackupStatus } from '../../src/shared/database-models';

const baseStatus: BackupStatus = {
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

function renderAlert(status: BackupStatus): void {
  Object.defineProperty(window, 'optica', {
    configurable: true,
    value: {
      backup: {
        status: vi.fn(() => Promise.resolve({ ok: true as const, data: status })),
      },
    },
  });
  render(
    <MemoryRouter>
      <BackupAlertBanner />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('alertas globales de respaldos', () => {
  it('no muestra una alerta durante la gracia inicial', async () => {
    renderAlert(baseStatus);
    await Promise.resolve();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ir a Configuración/)).not.toBeInTheDocument();
  });

  it('muestra advertencia después de 24 horas con acceso directo a respaldos', async () => {
    renderAlert({ ...baseStatus, alertLevel: 'WARNING', lastBackupAgeHours: 25 });
    expect(await screen.findByText(/más de 24 horas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Configuración → Respaldos/ })).toHaveAttribute(
      'href',
      '/configuracion?seccion=respaldos',
    );
  });

  it('prioriza la alerta de 72 horas e informa por separado el fallo externo', async () => {
    renderAlert({
      ...baseStatus,
      alertLevel: 'CRITICAL',
      externalCopyStatus: 'FAILED',
      exportDirectory: 'C:\\QA\\externo',
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('más de 72 horas');
    expect(alert).toHaveTextContent('copia al destino externo falló');
  });

  it('advierte inmediatamente cuando el último archivo local desapareció', async () => {
    renderAlert({
      ...baseStatus,
      alertLevel: 'MISSING',
      lastBackupAt: '2026-10-19T12:00:00.000Z',
      lastBackupFile: 'occhiali-backup-20261019120000000.ocbackup',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No encontramos el último respaldo local',
    );
  });
});
