import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { buttonStyles } from '../components/ui/buttonStyles';
import { Card } from '../components/ui/Card';

export function NotFoundPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Página no encontrada"
        description="La sección solicitada no existe en Occhiali."
      />
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="No encontramos esta página"
          description="Podés volver al inicio y continuar desde el menú principal."
          action={
            <Link to="/" className={buttonStyles()}>
              <ArrowLeft size={16} aria-hidden="true" />
              Volver al inicio
            </Link>
          }
        />
      </Card>
    </div>
  );
}
