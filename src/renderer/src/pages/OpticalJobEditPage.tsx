import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  Client,
  OpticalJob,
  OpticalJobSummary,
  Prescription,
  UpdateOpticalFileInput,
  UpdateOpticalFileResult,
} from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { IntegratedPrescriptionForm } from '../components/prescriptions/IntegratedPrescriptionForm';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapClientResult } from '../lib/client-api';
import { unwrapOpticalJobResult } from '../lib/optical-job-api';
import { unwrapPrescriptionResult } from '../lib/prescription-api';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      job: OpticalJob;
      client: Client;
      prescription: Prescription | null;
      relatedJobs: OpticalJobSummary[];
      relatedJobTotal: number;
    };

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
      .then(async (job) => {
        const [client, prescription, relatedJobs] = await Promise.all([
          window.optica.clients.get(job.clientId).then(unwrapClientResult),
          job.prescriptionId
            ? window.optica.prescriptions.get(job.prescriptionId).then(unwrapPrescriptionResult)
            : Promise.resolve(null),
          job.prescriptionId
            ? window.optica.opticalJobs
                .listByPrescription({ prescriptionId: job.prescriptionId, limit: 100, offset: 0 })
                .then(unwrapOpticalJobResult)
            : Promise.resolve({ items: [], total: 0, limit: 100, offset: 0 }),
        ]);
        return {
          job,
          client,
          prescription,
          relatedJobs: relatedJobs.items,
          relatedJobTotal: relatedJobs.total,
        };
      })
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
      <div className="py-24 text-center text-base font-semibold text-slate-600" role="status">
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
            <Link to="/fichas" className={buttonStyles()}>
              Volver a fichas ópticas
            </Link>
          }
        />
      </Card>
    );

  const submit = async (input: UpdateOpticalFileInput): Promise<UpdateOpticalFileResult> => {
    const updated = unwrapOpticalJobResult(
      await window.optica.opticalJobs.updateFile(jobId, input),
    );
    void navigate(`/fichas/trabajo/${updated.opticalJob.id}`);
    return updated;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Ficha óptica"
        title={`Editar ficha ${state.job.jobNumber ?? `#${state.job.id}`}`}
        description="Actualizá la ficha completa en una sola operación. Las correcciones ópticas conservan su trazabilidad."
        action={
          <Link
            to={`/fichas/trabajo/${state.job.id}`}
            className={buttonStyles({ variant: 'secondary' })}
          >
            <ArrowLeft size={17} aria-hidden="true" /> Volver al detalle
          </Link>
        }
      />

      <IntegratedPrescriptionForm
        fixedClient={state.client}
        initialJob={state.job}
        initialPrescription={state.prescription}
        relatedJobs={state.relatedJobs}
        relatedJobTotal={state.relatedJobTotal}
        onSubmit={submit}
        onCancel={() => void navigate(`/fichas/trabajo/${state.job.id}`)}
      />
    </div>
  );
}
