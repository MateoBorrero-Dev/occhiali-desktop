import { Archive, ArrowLeft, UserRoundX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  Client,
  CreateOpticalJobInput,
  UpdateOpticalJobInput,
} from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { OpticalJobForm } from '../components/optical-jobs/OpticalJobForm';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapClientResult } from '../lib/client-api';
import { unwrapOpticalJobResult } from '../lib/optical-job-api';

export function OpticalJobCreatePage(): React.JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const fixedId = id ? Number(id) : null;
  const [client, setClient] = useState<Client | undefined>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    fixedId ? 'loading' : 'ready',
  );
  useEffect(() => {
    if (!fixedId) return;
    let active = true;
    void window.optica.clients
      .get(fixedId)
      .then(unwrapClientResult)
      .then((result) => {
        if (active) {
          setClient(result);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [fixedId]);
  if (status === 'loading')
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando cliente…
      </div>
    );
  if (status === 'error' || (fixedId && !client))
    return (
      <Card>
        <EmptyState
          icon={UserRoundX}
          title="No se pudo abrir el cliente"
          description="La ficha solicitada no existe o no está disponible."
          action={
            <Link to="/clientes" className={buttonStyles()}>
              Volver a clientes
            </Link>
          }
        />
      </Card>
    );
  if (client?.isArchived)
    return (
      <Card>
        <EmptyState
          icon={Archive}
          title="El cliente está archivado"
          description="Reactivalo para registrar una nueva ficha de trabajo. Su historial continúa disponible."
          action={
            <Link to={`/clientes/${client.id}`} className={buttonStyles()}>
              Volver a la ficha
            </Link>
          }
        />
      </Card>
    );
  const submit = async (input: CreateOpticalJobInput | UpdateOpticalJobInput) => {
    const created = unwrapOpticalJobResult(
      await window.optica.opticalJobs.create(input as CreateOpticalJobInput),
    );
    void navigate(`/trabajos/${created.id}`, {
      replace: true,
      state: { message: 'Ficha registrada correctamente.' },
    });
    return created;
  };
  return (
    <div>
      <PageHeader
        eyebrow="Producto o pedido óptico"
        title="Nueva ficha de trabajo"
        description={
          client
            ? `La ficha quedará asociada exclusivamente a ${client.firstName} ${client.lastName}.`
            : 'Buscá un cliente y registrá las características comerciales del producto.'
        }
        action={
          <Link
            to={client ? `/clientes/${client.id}` : '/trabajos'}
            className={buttonStyles({ variant: 'secondary' })}
          >
            <ArrowLeft size={17} />
            Volver
          </Link>
        }
      />
      <OpticalJobForm
        fixedClient={client}
        submitLabel="Guardar ficha"
        onSubmit={submit}
        onCancel={() => {
          void navigate(client ? `/clientes/${client.id}` : '/trabajos');
        }}
      />
    </div>
  );
}
