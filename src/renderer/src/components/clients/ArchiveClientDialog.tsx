import { Archive } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../ui/Button';

interface ArchiveClientDialogProps {
  clientName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ArchiveClientDialog({
  clientName,
  busy,
  onCancel,
  onConfirm,
}: ArchiveClientDialogProps): React.JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="archive-title"
        aria-describedby="archive-description"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <Archive size={21} aria-hidden="true" />
        </div>
        <h2 id="archive-title" className="mt-4 text-lg font-bold text-slate-950">
          Archivar cliente
        </h2>
        <p id="archive-description" className="mt-2 text-sm leading-6 text-slate-600">
          Vas a archivar a <strong className="text-slate-800">{clientName}</strong>. Sus datos y su
          historial se conservarán, y podrás reactivarlo cuando sea necesario.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Archivando…' : 'Archivar cliente'}
          </Button>
        </div>
      </section>
    </div>
  );
}
