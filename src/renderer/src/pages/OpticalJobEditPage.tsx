import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  Client,
  CreateOpticalJobInput,
  OpticalJob,
  UpdateOpticalJobInput,
} from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { OpticalJobForm } from '../components/optical-jobs/OpticalJobForm';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapClientResult } from '../lib/client-api';
import { unwrapOpticalJobResult } from '../lib/optical-job-api';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; job: OpticalJob; client: Client };
export function OpticalJobEditPage(): React.JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const jobId = Number(id);
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    void window.optica.opticalJobs
      .get(jobId)
      .then(unwrapOpticalJobResult)
      .then(async (job) => ({
        job,
        client: unwrapClientResult(await window.optica.clients.get(job.clientId)),
      }))
      .then((data) => {
        if (active) setState({ status: 'ready', ...data });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [jobId]);
  if (state.status === 'loading')
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando ficha…
      </div>
    );
  if (state.status === 'error')
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="No se pudo abrir la ficha"
          description="El registro no existe o no está disponible."
          action={
            <Link to="/trabajos" className={buttonStyles()}>
              Volver a trabajos
            </Link>
          }
        />
      </Card>
    );
  const submit = async (input: CreateOpticalJobInput | UpdateOpticalJobInput) => {
    const updated = unwrapOpticalJobResult(await window.optica.opticalJobs.update(jobId, input));
    void navigate(`/trabajos/${updated.id}`, {
      replace: true,
      state: { message: 'Cambios guardados correctamente.' },
    });
    return updated;
  };
  return (
    <div>
      <PageHeader
        eyebrow="Ficha de trabajo"
        title="Editar ficha"
        description="El cliente permanece asociado y la receta seleccionada debe pertenecerle."
        action={
          <Link to={`/trabajos/${state.job.id}`} className={buttonStyles({ variant: 'secondary' })}>
            <ArrowLeft size={17} />
            Cancelar
          </Link>
        }
      />
      <OpticalJobForm
        fixedClient={state.client}
        initialJob={state.job}
        submitLabel="Guardar cambios"
        onSubmit={submit}
        onCancel={() => {
          void navigate(`/trabajos/${state.job.id}`);
        }}
      />
    </div>
  );
}
