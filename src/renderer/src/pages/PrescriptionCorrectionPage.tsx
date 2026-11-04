import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  CorrectPrescriptionInput,
  CreatePrescriptionInput,
  OpticalJobSummary,
  Prescription,
} from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { PrescriptionForm } from '../components/prescriptions/PrescriptionForm';
import { PrescriptionOpticalJobs } from '../components/optical-jobs/PrescriptionOpticalJobs';
import { SharedPrescriptionWarning } from '../components/prescriptions/SharedPrescriptionWarning';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapOpticalJobResult } from '../lib/optical-job-api';
import { unwrapPrescriptionResult } from '../lib/prescription-api';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      prescription: Prescription;
      jobs: OpticalJobSummary[];
      jobTotal: number;
    };

export function PrescriptionCorrectionPage(): React.JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const prescriptionId = Number(id);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.optica.prescriptions.get(prescriptionId).then(unwrapPrescriptionResult),
      window.optica.opticalJobs
        .listByPrescription({ prescriptionId, limit: 100, offset: 0 })
        .then(unwrapOpticalJobResult),
    ])
      .then(([prescription, jobs]) => {
        if (active) {
          setState({
            status: 'ready',
            prescription,
            jobs: jobs.items,
            jobTotal: jobs.total,
          });
        }
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [prescriptionId]);

  useEffect(() => {
    if (state.status !== 'ready' || state.jobTotal !== 1 || state.jobs.length !== 1) return;
    void navigate(`/fichas/trabajo/${state.jobs[0]!.id}/editar`, { replace: true });
  }, [navigate, state]);

  if (state.status === 'loading')
    return (
      <div className="py-24 text-center text-base font-semibold text-slate-600" role="status">
        Cargando graduación…
      </div>
    );
  if (state.status === 'error')
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="No se pudo abrir la graduación"
          description="El registro no existe o no está disponible."
          action={
            <Link to="/fichas" className={buttonStyles()}>
              Volver a fichas ópticas
            </Link>
          }
        />
      </Card>
    );

  if (state.jobTotal === 1) {
    return (
      <div className="py-24 text-center text-base font-semibold text-slate-600" role="status">
        Abriendo la edición unificada de la ficha…
      </div>
    );
  }

  if (state.jobTotal > 1) {
    return (
      <div>
        <PageHeader
          eyebrow="Graduación compartida"
          title="Elegí la ficha que querés editar"
          description={`Esta graduación pertenece a ${state.jobTotal} fichas. No se seleccionará ninguna automáticamente.`}
          action={
            <Link
              to={`/fichas/receta/${state.prescription.id}`}
              className={buttonStyles({ variant: 'secondary' })}
            >
              <ArrowLeft size={17} aria-hidden="true" /> Volver a la graduación
            </Link>
          }
        />
        <SharedPrescriptionWarning
          jobs={state.jobs}
          total={state.jobTotal}
          prescriptionId={state.prescription.id}
        />
        <PrescriptionOpticalJobs prescriptionId={state.prescription.id} action="edit" />
      </div>
    );
  }

  const returnPath = `/fichas/receta/${state.prescription.id}`;
  const requireOpticalData =
    state.prescription.values.length > 0 ||
    state.prescription.additionOd !== null ||
    state.prescription.additionOi !== null;

  const submit = async (input: CreatePrescriptionInput | CorrectPrescriptionInput) => {
    const corrected = unwrapPrescriptionResult(
      await window.optica.prescriptions.correct(prescriptionId, input as CorrectPrescriptionInput),
    );
    void navigate(returnPath, {
      replace: true,
      state: { message: 'Corrección guardada con trazabilidad.' },
    });
    return corrected;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Trazabilidad"
        title="Corregir graduación"
        description={
          'Esta receta histórica no está vinculada a una ficha comercial. Se conservará una instantánea completa antes de aplicar la corrección.'
        }
        action={
          <Link to={returnPath} className={buttonStyles({ variant: 'secondary' })}>
            <ArrowLeft size={17} aria-hidden="true" /> Cancelar
          </Link>
        }
      />
      <PrescriptionForm
        initialPrescription={state.prescription}
        correction
        requireOpticalData={requireOpticalData}
        notesEditable
        submitLabel="Guardar corrección"
        onSubmit={submit}
        onCancel={() => void navigate(returnPath)}
      />
    </div>
  );
}
