import { FileText } from 'lucide-react';
import { ModulePlaceholder } from '../components/common/ModulePlaceholder';

export function PrescriptionsPage(): React.JSX.Element {
  return (
    <ModulePlaceholder
      icon={FileText}
      title="Recetas"
      description="Historial cronológico de graduaciones y prescripciones ópticas."
      emptyTitle="El módulo de recetas estará disponible próximamente"
      emptyDescription="Acá se podrán registrar recetas de lejos y cerca, consultar valores anteriores y preservar el historial."
    />
  );
}
