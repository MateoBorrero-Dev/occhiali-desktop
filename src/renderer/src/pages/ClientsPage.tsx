import { Users } from 'lucide-react';
import { ModulePlaceholder } from '../components/common/ModulePlaceholder';

export function ClientsPage(): React.JSX.Element {
  return (
    <ModulePlaceholder
      icon={Users}
      title="Clientes"
      description="Datos personales e historial general de cada cliente de la óptica."
      emptyTitle="El módulo de clientes estará disponible próximamente"
      emptyDescription="En la siguiente fase vas a poder registrar, editar y consultar clientes desde esta sección."
    />
  );
}
