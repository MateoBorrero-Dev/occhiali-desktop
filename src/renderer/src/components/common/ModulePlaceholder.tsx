import type { LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

interface ModulePlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}

export function ModulePlaceholder({
  icon,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: ModulePlaceholderProps): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
      </Card>
    </div>
  );
}
