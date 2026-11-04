import type { DecimalValue, Eye, PrescriptionDistance } from '../../../../shared/database-models';
import type { DisplayPrescriptionValue } from '../../lib/prescription-api';
import { formatOpticalDecimal } from '../../lib/prescription-api';

interface PrescriptionValuesTableProps {
  values: readonly DisplayPrescriptionValue[];
  additionOd?: DecimalValue | null;
  additionOi?: DecimalValue | null;
  caption?: string;
}

export function PrescriptionValuesTable({
  values,
  caption = 'Graduaciones ópticas',
}: PrescriptionValuesTableProps): React.JSX.Element {
  const findValue = (
    distance: PrescriptionDistance,
    eye: Eye,
  ): DisplayPrescriptionValue | undefined =>
    values.find((value) => value.distance === distance && value.eye === eye);

  return (
    <div className="min-w-0 max-w-full space-y-4" aria-label={caption}>
      {(['FAR', 'NEAR'] as const).map((distance) => (
        <section
          key={distance}
          className="min-w-0 max-w-full overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-teal-200 bg-teal-50 px-4 py-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-xs font-black text-white"
              aria-hidden="true"
            >
              {distance === 'FAR' ? 'L' : 'C'}
            </span>
            <h3 className="text-sm font-black tracking-[0.08em] text-teal-950 uppercase">
              {distance === 'FAR' ? 'Lejos' : 'Cerca'}
            </h3>
          </div>
          <div className="max-w-full overflow-x-auto" tabIndex={0}>
            <div className="w-full min-w-[752px] px-4">
              <table className="w-full max-w-[860px] table-fixed border-collapse text-left text-sm">
                <caption className="sr-only">
                  {caption}: {distance === 'FAR' ? 'lejos' : 'cerca'}
                </caption>
                <colgroup>
                  <col className="w-24" />
                  {['ESF', 'CIL', 'EJE', 'DIP', 'ALT'].map((label) => (
                    <col key={label} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50/80 text-xs font-bold tracking-wide text-slate-600 uppercase">
                  <tr>
                    <th
                      className="sticky left-0 z-10 border-r border-teal-100 bg-teal-50 px-4 py-3"
                      scope="col"
                    >
                      Ojo
                    </th>
                    {['ESF', 'CIL', 'EJE', 'DIP', 'ALT'].map((label) => (
                      <th key={label} className="px-3 py-3 text-center" scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100">
                  {(['OD', 'OI'] as const).map((eye) => {
                    const value = findValue(distance, eye);
                    return (
                      <tr key={eye} className="group hover:bg-teal-50/30">
                        <th
                          className="sticky left-0 z-10 border-r border-teal-100 bg-white px-4 py-3 group-hover:bg-teal-50"
                          scope="row"
                        >
                          <span className="inline-flex min-w-11 items-center justify-center rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-black text-teal-800">
                            {eye}
                          </span>
                        </th>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatOpticalDecimal(value?.sphere ?? null)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatOpticalDecimal(value?.cylinder ?? null)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {value?.axis == null ? '—' : `${value.axis}°`}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatOpticalDecimal(value?.dip ?? null)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatOpticalDecimal(value?.height ?? null)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
