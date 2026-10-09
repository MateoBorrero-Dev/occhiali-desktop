import { useNavigate } from 'react-router-dom';
import type { CreateClientInput } from '../../../shared/database-models';
import { PageHeader } from '../components/common/PageHeader';
import { ClientForm } from '../components/clients/ClientForm';
import { unwrapClientResult } from '../lib/client-api';

export function ClientCreatePage(): React.JSX.Element {
  const navigate = useNavigate();

  const createClient = async (input: CreateClientInput) => {
    const client = unwrapClientResult(await window.optica.clients.create(input));
    void navigate(`/clientes/${client.id}`, {
      replace: true,
      state: { message: 'Cliente registrado correctamente.' },
    });
    return client;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Clientes"
        title="Registrar cliente"
        description="Completá los datos básicos. El DNI y los datos de contacto son opcionales."
      />
      <ClientForm
        submitLabel="Guardar cliente"
        onSubmit={createClient}
        onCancel={() => void navigate('/clientes')}
      />
    </div>
  );
}
