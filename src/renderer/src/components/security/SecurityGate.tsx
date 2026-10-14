import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { App } from '../../app/App';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { SecurityStatus } from '../../../../shared/database-models';

function unwrap<T>(value: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!value.ok) throw new Error(value.error.message);
  return value.data;
}

export function SecurityGate(): React.JSX.Element {
  const api = window.optica.security;
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    void api
      .status()
      .then(unwrap)
      .then(setStatus)
      .catch(() => setError('No se pudo comprobar la protección de acceso.'));
    const lock = (): void =>
      setStatus((current) => (current ? { ...current, authenticated: false } : current));
    window.addEventListener('occhiali-lock', lock);
    return () => window.removeEventListener('occhiali-lock', lock);
  }, [api]);
  useEffect(() => {
    if (!api || !status?.authenticated) return;
    let timeout = window.setTimeout(() => undefined, 0);
    let lastTouch = 0;
    const lock = (): void => {
      void api
        .logout()
        .finally(() =>
          setStatus((current) => (current ? { ...current, authenticated: false } : current)),
        );
    };
    const schedule = (): void => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(lock, status.inactivityMinutes * 60_000);
      if (Date.now() - lastTouch >= 60_000) {
        lastTouch = Date.now();
        void api.touch().then((value) => {
          if (!value.ok) lock();
        });
      }
    };
    schedule();
    window.addEventListener('keydown', schedule);
    window.addEventListener('pointerdown', schedule);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('keydown', schedule);
      window.removeEventListener('pointerdown', schedule);
    };
  }, [api, status?.authenticated, status?.inactivityMinutes]);
  if (!api) return <App />;
  if (!status)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-semibold text-slate-600">
        Comprobando protección…
      </div>
    );
  if (status.authenticated) return <App />;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!status.configured && password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      setStatus(
        unwrap(status.configured ? await api.login(password) : await api.setup(password, 15)),
      );
      setPassword('');
      setConfirm('');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo autenticar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <Card className="w-full max-w-md p-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white">
          {status.configured ? (
            <LockKeyhole aria-hidden="true" />
          ) : (
            <ShieldCheck aria-hidden="true" />
          )}
        </div>
        <h1 className="mt-5 text-2xl font-bold">
          {status.configured ? 'Desbloquear Occhiali' : 'Proteger Occhiali'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {status.configured
            ? 'Ingresá tu contraseña para acceder a los datos locales.'
            : 'Creá una contraseña local de al menos 10 caracteres. No cifra por sí sola el archivo SQLite.'}
        </p>
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-semibold">
            Contraseña
            <input
              autoFocus
              type="password"
              minLength={10}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          {!status.configured && (
            <label className="block text-sm font-semibold">
              Repetir contraseña
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-red-800">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Comprobando…' : status.configured ? 'Ingresar' : 'Configurar protección'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
