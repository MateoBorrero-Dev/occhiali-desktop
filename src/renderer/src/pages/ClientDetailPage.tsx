import {
  Archive,
  ArrowLeft,
  FileText,
  Pencil,
  RefreshCw,
  RotateCcw,
  UserRoundX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Client } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { ArchiveClientDialog } from '../components/clients/ArchiveClientDialog';
import { ClientStatusBadge } from '../components/clients/ClientStatusBadge';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import {
  ClientRequestError,
  displayValue,
  formatCalendarDate,
  formatTimestamp,
  unwrapClientResult,
} from '../lib/client-api';

type DetailState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; client: Client };

function DetailItem({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1.5 whitespace-pre-wrap text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function ClientDetailPage(): React.JSX.Element {
  const { id } = useParams();
  const location = useLocation();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    const routeState = location.state as { message?: unknown } | null;
    return typeof routeState?.message === 'string' ? routeState.message : null;
  });
  const [mutationError, setMutationError] = useState<string | null>(null);
  const clientId = Number(id);

  useEffect(() => {
    let active = true;
    void window.optica.clients
      .get(clientId)
      .then(unwrapClientResult)
      .then((client) => {
        if (active) setState({ status: 'ready', client });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ClientRequestError && error.detail.code === 'NOT_FOUND') {
          setState({ status: 'not-found' });
        } else {
          setState({ status: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [clientId, reloadToken]);

  const setClientFromMutation = (client: Client, successMessage: string): void => {
    setState({ status: 'ready', client });
    setMessage(successMessage);
    setMutationError(null);
  };

  const archiveClient = async (): Promise<void> => {
    if (state.status !== 'ready' || mutationBusy) return;
    setMutationBusy(true);
    try {
      const client = unwrapClientResult(await window.optica.clients.archive(state.client.id));
      setClientFromMutation(client, 'Cliente archivado. Su historial permanece disponible.');
      setShowArchiveDialog(false);
    } catch (error: unknown) {
      setMutationError(
        error instanceof ClientRequestError
          ? error.detail.message
          : 'No se pudo archivar el cliente. Volvé a intentarlo.',
      );
    } finally {
      setMutationBusy(false);
    }
  };

  const restoreClient = async (): Promise<void> => {
    if (state.status !== 'ready' || mutationBusy) return;
    setMutationBusy(true);
    try {
      const client = unwrapClientResult(await window.optica.clients.restore(state.client.id));
      setClientFromMutation(client, 'Cliente reactivado correctamente.');
    } catch (error: unknown) {
      setMutationError(
        error instanceof ClientRequestError
          ? error.detail.message
          : 'No se pudo reactivar el cliente. Volvé a intentarlo.',
      );
    } finally {
      setMutationBusy(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando ficha del cliente…
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Card>
        <EmptyState
          icon={UserRoundX}
          title="Cliente no encontrado"
          description="El registro solicitado no existe o ya no está disponible."
          action={
            <Link to="/clientes" className={buttonStyles()}>
              Volver al listado
            </Link>
          }
        />
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <EmptyState
          icon={RefreshCw}
          title="No pudimos cargar la ficha"
          description="Ocurrió un problema al consultar el almacenamiento local."
          action={
            <Button
              onClick={() => {
                setState({ status: 'loading' });
                setReloadToken((value) => value + 1);
              }}
            >
              Reintentar
            </Button>
          }
        />
      </Card>
    );
  }

  const { client } = state;
  const fullName = `${client.firstName} ${client.lastName}`;

  return (
    <div>
      <PageHeader
        eyebrow="Ficha de cliente"
        title={fullName}
        description={`Registro #${client.id}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/clientes" className={buttonStyles({ variant: 'secondary' })}>
              <ArrowLeft size={17} aria-hidden="true" /> Volver
            </Link>
            <Link to={`/clientes/${client.id}/editar`} className={buttonStyles()}>
              <Pencil size={16} aria-hidden="true" /> Editar
            </Link>
          </div>
        }
      />

      {message && (
        <div
          className="mt-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900"
          role="status"
        >
          {message}
        </div>
      )}
      {mutationError && (
        <div
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          {mutationError}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <h2 className="text-base font-bold text-slate-950">Información personal</h2>
            <ClientStatusBadge archived={client.isArchived} />
          </div>
          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            <DetailItem label="DNI" value={displayValue(client.documentNumber)} />
            <DetailItem label="Teléfono" value={displayValue(client.phone)} />
            <DetailItem label="Dirección" value={displayValue(client.address)} />
            <DetailItem label="Fecha de nacimiento" value={formatCalendarDate(client.birthDate)} />
            <DetailItem label="Fecha de registro" value={formatTimestamp(client.createdAt)} />
            <DetailItem label="Última actualización" value={formatTimestamp(client.updatedAt)} />
            <div className="md:col-span-2">
              <DetailItem label="Observaciones" value={displayValue(client.notes)} />
            </div>
          </dl>
        </Card>

        <Card className="h-fit p-5">
          <h2 className="text-sm font-bold text-slate-950">Estado del registro</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {client.isArchived
              ? 'Este cliente no aparece en el listado activo, pero conserva toda su información.'
              : 'Archivar oculta al cliente del listado activo sin eliminar su historial.'}
          </p>
          {client.isArchived ? (
            <Button
              className="mt-5 w-full"
              onClick={() => void restoreClient()}
              disabled={mutationBusy}
            >
              <RotateCcw size={17} aria-hidden="true" />
              {mutationBusy ? 'Reactivando…' : 'Reactivar cliente'}
            </Button>
          ) : (
            <Button
              className="mt-5 w-full"
              variant="secondary"
              onClick={() => setShowArchiveDialog(true)}
            >
              <Archive size={17} aria-hidden="true" /> Archivar cliente
            </Button>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <FileText size={19} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-950">Historial de recetas</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Las recetas ópticas de este cliente se integrarán en la Fase 5. Todavía no hay
              información clínica para mostrar.
            </p>
          </div>
        </div>
      </Card>

      {showArchiveDialog && (
        <ArchiveClientDialog
          clientName={fullName}
          busy={mutationBusy}
          onCancel={() => setShowArchiveDialog(false)}
          onConfirm={() => void archiveClient()}
        />
      )}
    </div>
  );
}
