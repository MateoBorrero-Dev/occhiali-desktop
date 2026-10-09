import { RefreshCw, UserRoundX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Client, CreateClientInput } from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { ClientForm } from '../components/clients/ClientForm';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { ClientRequestError, unwrapClientResult } from '../lib/client-api';

type EditState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; client: Client };

export function ClientEditPage(): React.JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<EditState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
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
        setState(
          error instanceof ClientRequestError && error.detail.code === 'NOT_FOUND'
            ? { status: 'not-found' }
            : { status: 'error' },
        );
      });
    return () => {
      active = false;
    };
  }, [clientId, reloadToken]);

  if (state.status === 'loading') {
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando datos del cliente…
      </div>
    );
  }
  if (state.status === 'not-found') {
    return (
      <Card>
        <EmptyState
          icon={UserRoundX}
          title="Cliente no encontrado"
          description="No se puede editar un registro inexistente."
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
          title="No pudimos cargar el cliente"
          description="Volvé a intentar la consulta."
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

  const updateClient = async (input: CreateClientInput): Promise<Client> => {
    const client = unwrapClientResult(await window.optica.clients.update(state.client.id, input));
    void navigate(`/clientes/${client.id}`, {
      replace: true,
      state: { message: 'Cambios guardados correctamente.' },
    });
    return client;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Clientes"
        title="Editar cliente"
        description={`Actualizá la información de ${state.client.firstName} ${state.client.lastName}.`}
      />
      <ClientForm
        initialClient={state.client}
        submitLabel="Guardar cambios"
        onSubmit={updateClient}
        onCancel={() => void navigate(`/clientes/${state.client.id}`)}
      />
    </div>
  );
}
