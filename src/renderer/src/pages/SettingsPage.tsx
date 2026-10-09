import { Settings } from 'lucide-react';
import { ModulePlaceholder } from '../components/common/ModulePlaceholder';

export function SettingsPage(): React.JSX.Element {
  return (
    <ModulePlaceholder
      icon={Settings}
      title="Configuración"
      description="Preferencias generales y herramientas de mantenimiento de la aplicación."
      emptyTitle="Todavía no hay opciones para configurar"
      emptyDescription="Las opciones necesarias se incorporarán junto con las funciones correspondientes, sin agregar controles que todavía no tengan efecto."
    />
  );
}
