import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  FolderOpen,
  History,
  KeyRound,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  BackupHistoryEvent,
  BackupHistorySnapshot,
  BackupMetadata,
  BackupStatus,
  SecurityStatus,
} from '../../../shared/database-models';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

function unwrap<T>(value: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!value.ok) throw new Error(value.error.message);
  return value.data;
}

function formatAge(hours: number | null): string {
  if (hours === null) return 'Sin copias registradas';
  if (hours < 1) return 'Hace menos de una hora';
  if (hours < 24) return `Hace ${Math.floor(hours)} hora${Math.floor(hours) === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} día${days === 1 ? '' : 's'}`;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const operationLabels: Record<BackupHistoryEvent['operation'], string> = {
  CREATE: 'Creación',
  VERIFY: 'Verificación',
  EXPORT: 'Copia externa',
  RESTORE: 'Restauración',
  RETENTION: 'Retención',
};

const resultLabels: Record<BackupHistoryEvent['result'], string> = {
  STARTED: 'Iniciado',
  SUCCESS: 'Correcto',
  PARTIAL: 'Parcial',
  FAILURE: 'Fallido',
};

export function SettingsPage(): React.JSX.Element {
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [history, setHistory] = useState<BackupHistorySnapshot | null>(null);
  const [access, setAccess] = useState<SecurityStatus | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [automaticPassword, setAutomaticPassword] = useState('');
  const [automaticPasswordRepeat, setAutomaticPasswordRepeat] = useState('');
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
    if (api)
      void api
        .history()
        .then(unwrap)
        .then(setHistory)
        .catch(() => setError('No se pudo consultar el historial de respaldos.'));
    if (window.optica.security)
      void window.optica.security
        .status()
        .then(unwrap)
        .then(setAccess)
        .catch(() => setError('No se pudo consultar el estado de seguridad.'));
  }, [api]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      void Promise.all([api.status(), api.history()]).then(([nextStatus, nextHistory]) => {
        if (nextStatus.ok) setBackup(nextStatus.data);
        if (nextHistory.ok) setHistory(nextHistory.data);
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [api]);
  useEffect(() => {
    if (!backup || !window.location.hash.includes('seccion=respaldos')) return;
    const target = document.getElementById('respaldos');
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView();
  }, [backup]);
  const refreshBackupData = async (): Promise<void> => {
    const [nextStatus, nextHistory] = await Promise.all([api.status(), api.history()]);
    setBackup(unwrap(nextStatus));
    setHistory(unwrap(nextHistory));
    window.dispatchEvent(new Event('occhiali-backup-changed'));
  };
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
          <ChangePassword
            onDone={(text) => {
              setError(null);
              setMessage(text);
            }}
            onError={(text) => {
              setMessage(null);
              setError(text);
            }}
          />
        </Card>
        <Card id="respaldos" className="scroll-mt-6 p-6 xl:col-span-2">
          <div className="flex items-center gap-3">
            <Save className="text-teal-700" />
            <h2 className="text-base font-bold">Copias de seguridad</h2>
          </div>
          {backup && (
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="font-bold text-slate-500">Último respaldo creado y verificado</dt>
                <dd>
                  {backup.lastBackupAt
                    ? new Date(backup.lastBackupAt).toLocaleString('es-AR')
                    : 'Todavía no existe'}
                </dd>
                <dd className="mt-1 text-slate-600">{formatAge(backup.lastBackupAgeHours)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Archivo local</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  {backup.lastBackupExists ? (
                    <CheckCircle2 aria-hidden="true" size={16} className="text-teal-700" />
                  ) : (
                    <AlertCircle aria-hidden="true" size={16} className="text-amber-700" />
                  )}
                  {backup.lastBackupAt
                    ? backup.lastBackupExists
                      ? 'Disponible'
                      : 'No encontrado'
                    : 'Todavía no existe'}
                </dd>
                {backup.lastBackupSizeBytes !== null && (
                  <dd className="mt-1 text-slate-600">{formatSize(backup.lastBackupSizeBytes)}</dd>
                )}
              </div>
              <div>
                <dt className="font-bold text-slate-500">Destino externo</dt>
                <dd className="font-semibold">
                  {backup.externalCopyStatus === 'NOT_CONFIGURED'
                    ? 'No configurado'
                    : backup.externalCopyStatus === 'COPIED'
                      ? 'Última copia verificada localmente en el destino'
                      : backup.externalCopyStatus === 'PENDING'
                        ? `Copia externa pendiente (intento ${backup.externalRetryAttempts} de 3)`
                        : backup.externalCopyStatus === 'FAILED'
                          ? 'Última copia fallida'
                          : backup.externalCopyStatus === 'MISSING'
                            ? 'Copia no encontrada'
                            : 'Pendiente de primera copia'}
                </dd>
                <dd className="mt-1 text-slate-600">Sincronización remota no verificada</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Automatización</dt>
                <dd>
                  {backup.automaticState === 'DISABLED'
                    ? 'Modo asistido'
                    : backup.automaticState === 'RUNNING'
                      ? 'Creando respaldo…'
                      : backup.automaticState === 'BLOCKED'
                        ? 'Bloqueada por credencial'
                        : backup.automaticState === 'ERROR'
                          ? 'Último intento fallido'
                          : backup.automaticState === 'PENDING'
                            ? backup.due
                              ? 'Respaldo pendiente'
                              : 'Esperando primera copia programada'
                            : 'Automática y al día'}
                </dd>
              </div>
            </dl>
          )}
          {backup?.lastBackupAt && backup.lastBackupExists && (
            <p className="mt-4 text-xs text-slate-500">
              La disponibilidad comprueba que el archivo exista. Usá Verificar respaldo para validar
              nuevamente su contenido cifrado.
            </p>
          )}
          {backup?.exportDirectory && (
            <p className="mt-4 break-all rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Carpeta seleccionada: {backup.exportDirectory}
            </p>
          )}
          {backup && !backup.historyAvailable && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              El respaldo puede seguir siendo válido, pero no se pudo actualizar el historial de
              operaciones.
            </p>
          )}
          {backup?.historyRecoveredFromDamage && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {backup.historyAvailable
                ? 'Se preservó un historial dañado para revisión y se inició uno nuevo.'
                : 'Se detectó un historial dañado que no pudo ponerse en cuarentena. Se preservó sin sobrescribirlo y el registro de nuevos eventos quedó deshabilitado.'}
            </p>
          )}
          {backup?.externalCopyStatus === 'FAILED' && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
            >
              {backup.lastBackupExists
                ? 'El respaldo local se creó correctamente, pero falló la copia externa. Revisá la carpeta seleccionada.'
                : 'Falló la última copia externa y el respaldo local ya no está disponible. Creá una nueva copia.'}
            </p>
          )}
          {backup?.externalCopyStatus === 'PENDING' && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
            >
              El respaldo local es válido. La copia externa está pendiente y Occhiali la reintentará
              sin crear otro respaldo local.
            </p>
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
                  await refreshBackupData();
                  return created.externalCopyPending
                    ? 'Respaldo local cifrado y verificado. La copia externa quedó pendiente de reintento.'
                    : created.exportError
                      ? 'Respaldo local cifrado y verificado. No se pudo copiar a la carpeta externa.'
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
                  setHistory(unwrap(await api.history()));
                  window.dispatchEvent(new Event('occhiali-backup-changed'));
                  return 'Carpeta de exportación actualizada. La sincronización remota no puede verificarse.';
                })
              }
            >
              <Cloud size={16} /> Seleccionar carpeta sincronizada
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void run(async () => {
                  unwrap(await api.openDirectory());
                  return 'Carpeta de respaldos abierta.';
                })
              }
            >
              <FolderOpen size={16} /> Ver carpeta
            </Button>
          </div>
        </Card>
        {backup && (
          <Card className="p-6 xl:col-span-2">
            <h2 className="text-base font-bold">Programación de respaldos</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              El modo automático funciona sólo mientras Occhiali está abierto. La contraseña se
              protege con el almacenamiento seguro de Windows y nunca puede mostrarse ni recuperarse
              desde la aplicación.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex min-h-12 items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm">
                <input
                  type="radio"
                  name="backup-mode"
                  checked={!backup.automaticEnabled}
                  onChange={() => setBackup({ ...backup, automaticEnabled: false })}
                />
                <span>
                  <strong className="block">Modo asistido</strong>
                  Occhiali avisa, pero la copia se inicia manualmente con la contraseña.
                </span>
              </label>
              <label className="flex min-h-12 items-start gap-3 rounded-lg border border-teal-200 bg-teal-50/50 p-4 text-sm">
                <input
                  type="radio"
                  name="backup-mode"
                  checked={backup.automaticEnabled}
                  disabled={backup.protectedCredentialState === 'UNAVAILABLE'}
                  onChange={() => setBackup({ ...backup, automaticEnabled: true })}
                />
                <span>
                  <strong className="block">Modo automático</strong>
                  Crea la copia pendiente a la hora elegida, al iniciar o al reanudar Windows.
                </span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
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
                    window.dispatchEvent(new Event('occhiali-backup-changed'));
                    return backup.automaticEnabled
                      ? 'Respaldo automático activado.'
                      : 'Modo asistido activado.';
                  })
                }
              >
                Guardar programación
              </Button>
            </div>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">Contraseña protegida</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {backup.protectedCredentialState === 'READY'
                      ? 'Configurada y protegida por Windows.'
                      : backup.protectedCredentialState === 'UNAVAILABLE'
                        ? 'El almacenamiento seguro de Windows no está disponible.'
                        : backup.protectedCredentialState === 'DAMAGED'
                          ? 'La credencial está dañada o ya no puede descifrarse.'
                          : 'Todavía no está configurada.'}
                  </p>
                </div>
                {backup.lastAutomaticBackupAt && (
                  <p className="text-xs text-slate-500">
                    Último automático:{' '}
                    {new Date(backup.lastAutomaticBackupAt).toLocaleString('es-AR')}
                  </p>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Nueva contraseña de recuperación
                  <input
                    aria-label="Contraseña automática"
                    type="password"
                    value={automaticPassword}
                    onChange={(event) => setAutomaticPassword(event.target.value)}
                    placeholder="Mínimo 12 caracteres"
                    className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Repetir contraseña
                  <input
                    aria-label="Repetir contraseña automática"
                    type="password"
                    value={automaticPasswordRepeat}
                    onChange={(event) => setAutomaticPasswordRepeat(event.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Conservá esta contraseña fuera de la computadora. La protección de Windows no
                reemplaza esa copia: si la perdés, podrías no poder restaurar en otro equipo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || backup.protectedCredentialState === 'UNAVAILABLE'}
                  onClick={() =>
                    void run(async () => {
                      if (automaticPassword !== automaticPasswordRepeat)
                        throw new Error('Las contraseñas de recuperación no coinciden.');
                      setBackup(unwrap(await api.setAutomaticCredential(automaticPassword)));
                      setAutomaticPassword('');
                      setAutomaticPasswordRepeat('');
                      await refreshBackupData();
                      return 'Contraseña protegida actualizada.';
                    })
                  }
                >
                  {backup.protectedCredentialState === 'READY' ? 'Reemplazar' : 'Proteger'}
                  {' contraseña'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || backup.protectedCredentialState === 'MISSING'}
                  onClick={() =>
                    void run(async () => {
                      setBackup(unwrap(await api.clearAutomaticCredential()));
                      window.dispatchEvent(new Event('occhiali-backup-changed'));
                      return 'Credencial eliminada y modo automático desactivado.';
                    })
                  }
                >
                  Eliminar credencial
                </Button>
              </div>
            </div>
          </Card>
        )}
        <Card className="p-6 xl:col-span-2">
          <div className="flex items-center gap-3">
            <History className="text-teal-700" />
            <h2 className="text-base font-bold">Historial de respaldos</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Registra operaciones locales y copias externas. No guarda contraseñas ni información de
            clientes.
          </p>
          {!history || history.events.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">
              Todavía no hay operaciones registradas.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="border-b border-slate-200 px-3 py-2">Fecha</th>
                    <th className="border-b border-slate-200 px-3 py-2">Operación</th>
                    <th className="border-b border-slate-200 px-3 py-2">Resultado</th>
                    <th className="border-b border-slate-200 px-3 py-2">Archivo</th>
                    <th className="border-b border-slate-200 px-3 py-2">Tamaño</th>
                    <th className="border-b border-slate-200 px-3 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {history.events.slice(0, 10).map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="border-b border-slate-100 px-3 py-3 whitespace-nowrap">
                        {new Date(event.occurredAt).toLocaleString('es-AR')}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 font-semibold">
                        {operationLabels[event.operation]}
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          {event.trigger === 'AUTOMATIC'
                            ? 'Automática'
                            : event.trigger === 'RETRY'
                              ? 'Reintento'
                              : 'Manual'}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            event.result === 'STARTED'
                              ? 'bg-sky-50 text-sky-800'
                              : event.result === 'SUCCESS'
                                ? 'bg-teal-50 text-teal-800'
                                : event.result === 'PARTIAL'
                                  ? 'bg-amber-50 text-amber-900'
                                  : 'bg-red-50 text-red-800'
                          }`}
                        >
                          {resultLabels[event.result]}
                        </span>
                      </td>
                      <td className="max-w-48 border-b border-slate-100 px-3 py-3 break-all">
                        {event.fileName ?? '—'}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 whitespace-nowrap">
                        {formatSize(event.sizeBytes)}
                      </td>
                      <td className="max-w-64 border-b border-slate-100 px-3 py-3 text-slate-600">
                        {event.result === 'STARTED'
                          ? 'Operación iniciada; el resultado final se registra por separado.'
                          : (event.error ??
                            (event.externalState === 'COPIED'
                              ? 'Depositado externamente; sincronización remota no verificada.'
                              : 'Operación completada.'))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="p-6 xl:col-span-2">
          <div className="flex items-center gap-3">
            <RefreshCw className="text-teal-700" />
            <h2 className="text-base font-bold">Restauración</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            El archivo se autentica y verifica antes de reemplazar la base. Occhiali crea primero
            una copia de la base actual y reinicia después de restaurar.
          </p>
          {verified && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
            >
              El respaldo es del {new Date(verified.createdAt).toLocaleString('es-AR')} (Occhiali{' '}
              {verified.appVersion}). Al restaurarlo se reemplazarán los datos actuales y se
              perderán los cambios realizados después de esa fecha. Antes del reemplazo se creará
              una copia local de seguridad.
            </p>
          )}
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
                  const verification = await api.verify(recoveryPassword);
                  const nextHistory = await api.history();
                  if (nextHistory.ok) setHistory(nextHistory.data);
                  const meta = unwrap(verification);
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
                  const metadata = verified;
                  if (!metadata) return 'Primero verificá el respaldo.';
                  if (
                    !window.confirm(
                      `Se reemplazarán los datos actuales por el respaldo del ${new Date(
                        metadata.createdAt,
                      ).toLocaleString(
                        'es-AR',
                      )}. Los cambios posteriores dejarán de estar activos. Occhiali creará antes una copia local de seguridad y se reiniciará. ¿Continuar?`,
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

function ChangePassword({
  onDone,
  onError,
}: {
  onDone: (message: string) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
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
            onError(error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.'),
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
