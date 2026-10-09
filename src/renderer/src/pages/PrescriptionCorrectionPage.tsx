import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  CorrectPrescriptionInput,
  CreatePrescriptionInput,
  Prescription,
} from '../../../shared/database-models';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { PrescriptionForm } from '../components/prescriptions/PrescriptionForm';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';
import { unwrapPrescriptionResult } from '../lib/prescription-api';

export function PrescriptionCorrectionPage(): React.JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const prescriptionId = Number(id);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    void window.optica.prescriptions
      .get(prescriptionId)
      .then(unwrapPrescriptionResult)
      .then((result) => {
        if (active) {
          setPrescription(result);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [prescriptionId]);
  if (status === 'loading')
    return (
      <div className="py-24 text-center text-sm font-semibold text-slate-600" role="status">
        Cargando receta…
      </div>
    );
  if (status === 'error' || !prescription)
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="No se pudo abrir la receta"
          description="El registro no existe o no está disponible."
          action={
            <Link to="/recetas" className={buttonStyles()}>
              Volver a recetas
            </Link>
          }
        />
      </Card>
    );
  const submit = async (input: CreatePrescriptionInput | CorrectPrescriptionInput) => {
    const corrected = unwrapPrescriptionResult(
      await window.optica.prescriptions.correct(prescriptionId, input as CorrectPrescriptionInput),
    );
    void navigate(`/recetas/${corrected.id}`, {
      replace: true,
      state: { message: 'Corrección guardada con trazabilidad.' },
    });
    return corrected;
  };
  return (
    <div>
      <PageHeader
        eyebrow="Trazabilidad"
        title="Corregir receta"
        description="Se conservará una instantánea completa de los datos actuales antes de aplicar la corrección."
        action={
          <Link
            to={`/recetas/${prescription.id}`}
            className={buttonStyles({ variant: 'secondary' })}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Cancelar
          </Link>
        }
      />
      <PrescriptionForm
        initialPrescription={prescription}
        correction
        submitLabel="Guardar corrección"
        onSubmit={submit}
        onCancel={() => {
          void navigate(`/recetas/${prescription.id}`);
        }}
      />
    </div>
  );
}
