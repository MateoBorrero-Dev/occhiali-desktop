interface ClientStatusBadgeProps {
  archived: boolean;
}

export function ClientStatusBadge({ archived }: ClientStatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
        archived ? 'bg-slate-200 text-slate-700' : 'bg-teal-50 text-teal-800'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${archived ? 'bg-slate-500' : 'bg-teal-600'}`}
        aria-hidden="true"
      />
      {archived ? 'Archivado' : 'Activo'}
    </span>
  );
}
