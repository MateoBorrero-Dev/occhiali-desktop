import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  headingLevel?: 1 | 2;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  headingLevel = 1,
}: PageHeaderProps): React.JSX.Element {
  const Heading = headingLevel === 2 ? 'h2' : 'h1';

  return (
    <header className="flex min-w-0 flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-xs font-bold tracking-[0.14em] text-teal-700 uppercase">
            {eyebrow}
          </p>
        )}
        <Heading className="text-2xl font-bold tracking-tight text-slate-950 lg:text-[1.75rem]">
          {title}
        </Heading>
        {description && (
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">{description}</p>
        )}
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </header>
  );
}
