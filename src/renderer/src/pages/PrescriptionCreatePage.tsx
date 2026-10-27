import { ArrowLeft, Archive, UserRoundX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Client, CreatePrescriptionBundleInput } from '../../../shared/database-models';
import { IntegratedPrescriptionForm } from '../components/prescriptions/IntegratedPrescriptionForm';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapClientResult } from '../lib/client-api';
import { unwrapPrescriptionResult } from '../lib/prescription-api';
import { recipesAndJobsPath } from '../app/routes';

export function PrescriptionCreatePage(): React.JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const fixedId = id ? Number(id) : null;
  const [client, setClient] = useState<Client | undefined>();
  const [clientState, setClientState] = useState<'loading' | 'ready' | 'error'>(
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
          setClientState('ready');
        }
      })
      .catch(() => {
        if (active) setClientState('error');
      });
    return () => {
      active = false;
    };
  }, [fixedId]);

  const submit = async (input: CreatePrescriptionBundleInput) => {
    const created = unwrapPrescriptionResult(
      await window.optica.prescriptions.createIntegrated(input),
    );
    void navigate(
      created.opticalJob
        ? `/trabajos/${created.opticalJob.id}`
        : `/recetas/${created.prescription.id}`,
      {
        replace: true,
        state: {
          message: created.opticalJob
            ? 'Receta y ficha registradas correctamente.'
            : 'Receta registrada correctamente.',
        },
      },
    );
    return created;
  };

  if (clientState === 'loading')
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando cliente…
      </div>
    );
  if (clientState === 'error' || (fixedId && !client))
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
          description="Reactivalo para registrar una nueva receta. Su historial continúa disponible."
          action={
            <Link to={`/clientes/${client.id}`} className={buttonStyles()}>
              Volver a la ficha
            </Link>
          }
        />
      </Card>
    );

  return (
    <div>
      <PageHeader
        eyebrow="Historial óptico"
        title="Nueva receta y trabajo"
        description={
          client
            ? `La receta quedará asociada exclusivamente a ${client.firstName} ${client.lastName}.`
            : 'Registrá la receta y, si corresponde, completá el trabajo óptico en la misma pantalla.'
        }
        action={
          <Link
            to={client ? `/clientes/${client.id}` : recipesAndJobsPath('recetas')}
            className={buttonStyles({ variant: 'secondary' })}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Volver
          </Link>
        }
      />
      <IntegratedPrescriptionForm
        fixedClient={client}
        onSubmit={submit}
        onCancel={() => {
          void navigate(client ? `/clientes/${client.id}` : recipesAndJobsPath('recetas'));
        }}
      />
    </div>
  );
}
