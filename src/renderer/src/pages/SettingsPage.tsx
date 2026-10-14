import { Cloud, FolderOpen, KeyRound, Lock, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BackupMetadata, BackupStatus, SecurityStatus } from '../../../shared/database-models';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

function unwrap<T>(value: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!value.ok) throw new Error(value.error.message);
  return value.data;
}

export function SettingsPage(): React.JSX.Element {
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [access, setAccess] = useState<SecurityStatus | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [verified, setVerified] = useState<BackupMetadata | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const api = window.optica.backup;
  useEffect(() => {
    if (api)
      void api
        .status()
        .then(unwrap)
        .then(setBackup)
        .catch(() => setError('No se pudo consultar el estado de las copias.'));
    if (window.optica.security)
      void window.optica.security
        .status()
        .then(unwrap)
        .then(setAccess)
        .catch(() => setError('No se pudo consultar el estado de seguridad.'));
  }, [api]);
  const run = async (operation: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await operation());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Configuración"
        description="Protección de acceso, copias cifradas y recuperación de datos."
      />
      {(message || error) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`mt-5 rounded-lg border px-4 py-3 text-sm font-semibold ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-teal-200 bg-teal-50 text-teal-900'}`}
        >
          {error ?? message}
        </div>
      )}
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-teal-700" />
            <h2 className="text-base font-bold">Seguridad de acceso</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            La sesión se valida en Main. Esta contraseña bloquea la interfaz, pero no cifra la base
            activa; usá BitLocker o cifrado de dispositivo para proteger el disco.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                void run(async () => {
                  unwrap(await window.optica.security.logout());
                  window.dispatchEvent(new Event('occhiali-lock'));
                  return 'Sesión cerrada.';
                })
              }
            >
              <Lock size={16} /> Bloquear ahora
            </Button>
            {access && (
              <label className="flex items-center gap-2 text-sm font-semibold">
                Bloquear tras
                <input
                  aria-label="Minutos de inactividad"
                  type="number"
                  min={1}
                  max={240}
                  value={access.inactivityMinutes}
                  onChange={(event) =>
                    setAccess({ ...access, inactivityMinutes: Number(event.target.value) })
                  }
                  className="min-h-10 w-20 rounded-lg border border-slate-300 px-2"
                />
                minutos
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      setAccess(
                        unwrap(
                          await window.optica.security.setInactivity(access.inactivityMinutes),
                        ),
                      );
                      return 'Tiempo de bloqueo actualizado.';
                    })
                  }
                >
                  Guardar
                </Button>
              </label>
            )}
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <KeyRound className="text-teal-700" />
            <h2 className="text-base font-bold">Contraseña</h2>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            El cambio de contraseña de acceso no cambia la clave de recuperación de respaldos.
          </p>
          <ChangePassword onDone={(text) => setMessage(text)} />
        </Card>
        <Card className="p-6 xl:col-span-2">
          <div className="flex items-center gap-3">
            <Save className="text-teal-700" />
            <h2 className="text-base font-bold">Copias de seguridad</h2>
          </div>
          {backup && (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-bold text-slate-500">Último respaldo válido</dt>
                <dd>
                  {backup.lastBackupAt
                    ? new Date(backup.lastBackupAt).toLocaleString('es-AR')
                    : 'Todavía no existe'}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Ubicación local</dt>
                <dd className="break-all">{backup.localDirectory}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Carpeta sincronizada</dt>
                <dd className="break-all">{backup.exportDirectory ?? 'No configurada'}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Automatización</dt>
                <dd>
                  {backup.automaticEnabled
                    ? backup.due
                      ? 'Respaldo asistido pendiente'
                      : 'Al día'
                    : 'Desactivada'}
                </dd>
              </div>
            </dl>
          )}
          {backup && !backup.lastBackupAt && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Todavía no existe una copia válida. Creá una y guardá la contraseña de recuperación
              fuera de esta computadora.
            </p>
          )}
          <label className="mt-5 block max-w-xl text-sm font-semibold">
            Contraseña de recuperación
            <input
              type="password"
              value={recoveryPassword}
              onChange={(event) => setRecoveryPassword(event.target.value)}
              placeholder="Mínimo 12 caracteres; guardala fuera del equipo"
              className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const created = unwrap(await api.create(recoveryPassword));
                  setBackup(unwrap(await api.status()));
                  return created.exportError
                    ? 'Respaldo local cifrado y verificado. No se pudo copiar a la carpeta sincronizada.'
                    : created.exportedToSyncFolder
                      ? 'Respaldo local creado y depositado en la carpeta sincronizada. La sincronización remota no fue verificada.'
                      : 'Respaldo local cifrado y verificado.';
                })
              }
            >
              <Save size={16} /> Crear copia ahora
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void run(async () => {
                  setBackup(unwrap(await api.selectExportDirectory()));
                  return 'Carpeta de exportación actualizada. La sincronización remota no puede verificarse.';
                })
              }
            >
              <Cloud size={16} /> Seleccionar carpeta sincronizada
            </Button>
            <Button variant="secondary" onClick={() => void api.openDirectory()}>
              <FolderOpen size={16} /> Ver carpeta
            </Button>
          </div>
        </Card>
        {backup && (
          <Card className="p-6 xl:col-span-2">
            <h2 className="text-base font-bold">Respaldo automático asistido</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Occhiali avisa cuando corresponde una copia diaria. Por seguridad no guarda la
              contraseña de recuperación: la copia se confirma manualmente y no puede ejecutarse con
              la aplicación cerrada.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={backup.automaticEnabled}
                  onChange={(event) =>
                    setBackup({ ...backup, automaticEnabled: event.target.checked })
                  }
                />
                Recordatorio diario
              </label>
              <label className="text-sm font-semibold">
                Hora
                <input
                  aria-label="Hora del respaldo"
                  type="number"
                  min={0}
                  max={23}
                  value={backup.automaticHour}
                  onChange={(event) =>
                    setBackup({ ...backup, automaticHour: Number(event.target.value) })
                  }
                  className="mt-1 block min-h-10 w-24 rounded-lg border border-slate-300 px-3"
                />
              </label>
              <label className="text-sm font-semibold">
                Cantidad a conservar
                <input
                  aria-label="Cantidad de respaldos"
                  type="number"
                  min={2}
                  max={90}
                  value={backup.retentionCount}
                  onChange={(event) =>
                    setBackup({ ...backup, retentionCount: Number(event.target.value) })
                  }
                  className="mt-1 block min-h-10 w-28 rounded-lg border border-slate-300 px-3"
                />
              </label>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setBackup(
                      unwrap(
                        await api.configure({
                          automaticEnabled: backup.automaticEnabled,
                          automaticHour: backup.automaticHour,
                          retentionCount: backup.retentionCount,
                        }),
                      ),
                    );
                    return 'Programación asistida actualizada.';
                  })
                }
              >
                Guardar programación
              </Button>
            </div>
          </Card>
        )}
        <Card className="p-6 xl:col-span-2">
          <div className="flex items-center gap-3">
            <RefreshCw className="text-teal-700" />
            <h2 className="text-base font-bold">Restauración</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            El archivo se autentica y verifica antes de reemplazar la base. Occhiali crea primero
            una copia de la base actual y reinicia después de restaurar.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() =>
                void run(async () => {
                  const value = unwrap(await api.selectRestoreFile());
                  setSelectedFile(value?.fileName ?? null);
                  setVerified(null);
                  return value ? `Archivo seleccionado: ${value.fileName}` : 'Selección cancelada.';
                })
              }
            >
              Seleccionar respaldo
            </Button>
            {selectedFile && <span className="text-sm font-semibold">{selectedFile}</span>}
            <Button
              variant="secondary"
              disabled={!selectedFile || busy}
              onClick={() =>
                void run(async () => {
                  const meta = unwrap(await api.verify(recoveryPassword));
                  setVerified(meta);
                  return `Respaldo válido del ${new Date(meta.createdAt).toLocaleString('es-AR')}.`;
                })
              }
            >
              Verificar
            </Button>
            <Button
              disabled={!verified || busy}
              onClick={() =>
                void run(async () => {
                  if (
                    !window.confirm(
                      'Se restaurará el respaldo y Occhiali se reiniciará. ¿Continuar?',
                    )
                  )
                    return 'Restauración cancelada.';
                  unwrap(await api.restore(recoveryPassword, true));
                  return 'Restauración aplicada. Reiniciando…';
                })
              }
            >
              Restaurar respaldo
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChangePassword({ onDone }: { onDone: (message: string) => void }): React.JSX.Element {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void window.optica.security
          .changePassword(current, next)
          .then(unwrap)
          .then(() => {
            setCurrent('');
            setNext('');
            onDone('Contraseña actualizada.');
          })
          .catch((error: unknown) =>
            onDone(error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.'),
          )
          .finally(() => setBusy(false));
      }}
    >
      <input
        aria-label="Contraseña actual"
        type="password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        className="min-h-10 w-full rounded-lg border border-slate-300 px-3"
        placeholder="Contraseña actual"
      />
      <input
        aria-label="Nueva contraseña"
        type="password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
        className="min-h-10 w-full rounded-lg border border-slate-300 px-3"
        placeholder="Nueva contraseña (10 caracteres o más)"
      />
      <Button type="submit" size="sm" disabled={busy}>
        Cambiar contraseña
      </Button>
    </form>
  );
}
