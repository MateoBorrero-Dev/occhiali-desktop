import { BriefcaseBusiness } from 'lucide-react';
import { ModulePlaceholder } from '../components/common/ModulePlaceholder';

export function WorkPage(): React.JSX.Element {
  return (
    <ModulePlaceholder
      icon={BriefcaseBusiness}
      title="Trabajos"
      description="Fichas de producto, armazón, tratamientos y observaciones."
      emptyTitle="El módulo de trabajos estará disponible próximamente"
      emptyDescription="Esta sección reunirá las fichas de trabajo y permitirá vincularlas con clientes y recetas existentes."
    />
  );
}
