import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BackupStatus } from '../../../../shared/database-models';

const STATUS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function unwrap<T>(value: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!value.ok) throw new Error(value.error.message);
  return value.data;
}

export function BackupAlertBanner(): React.JSX.Element | null {
  const api = window.optica.backup;
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const load = useCallback((): void => {
    if (!api) return;
    void api
      .status()
      .then(unwrap)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [api]);

  useEffect(() => {
    load();
    const refreshInterval = window.setInterval(load, STATUS_REFRESH_INTERVAL_MS);
    window.addEventListener('occhiali-backup-changed', load);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('occhiali-backup-changed', load);
    };
  }, [load]);

  if (!status) return null;
  const externalProblem =
    status.externalCopyStatus === 'FAILED' || status.externalCopyStatus === 'MISSING';
  if (status.alertLevel === 'NONE' && !externalProblem) return null;

  const critical = status.alertLevel === 'CRITICAL' || status.alertLevel === 'MISSING';
  const messages: string[] = [];
  if (status.alertLevel === 'MISSING')
    messages.push('No encontramos el último respaldo local registrado.');
  else if (status.alertLevel === 'CRITICAL')
    messages.push('Pasaron más de 72 horas sin un respaldo válido.');
  else if (status.alertLevel === 'WARNING')
    messages.push('Pasaron más de 24 horas sin un respaldo válido.');
  if (status.externalCopyStatus === 'FAILED')
    messages.push('La última copia al destino externo falló.');
  else if (status.externalCopyStatus === 'MISSING')
    messages.push('La última copia externa registrada ya no está disponible.');

  return (
    <div
      role={critical ? 'alert' : 'status'}
      className={`border-b px-6 py-3 lg:px-8 ${
        critical
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-amber-200 bg-amber-50 text-amber-950'
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold">
        <AlertTriangle aria-hidden="true" size={18} className="shrink-0" />
        <span className="min-w-0 flex-1">{messages.join(' ')}</span>
        <Link
          to="/configuracion?seccion=respaldos"
          className="rounded-md underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Ir a Configuración → Respaldos
        </Link>
      </div>
    </div>
  );
}
