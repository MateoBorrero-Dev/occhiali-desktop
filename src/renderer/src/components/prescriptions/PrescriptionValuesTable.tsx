import type { DisplayPrescriptionValue } from '../../lib/prescription-api';
import { distanceLabel, formatOpticalDecimal } from '../../lib/prescription-api';

interface PrescriptionValuesTableProps {
  values: readonly DisplayPrescriptionValue[];
  caption?: string;
}

export function PrescriptionValuesTable({
  values,
  caption = 'Graduaciones ópticas',
}: PrescriptionValuesTableProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs font-bold tracking-wide text-slate-600 uppercase">
          <tr>
            <th className="px-4 py-3" scope="col">
              Visión
            </th>
            <th className="px-3 py-3" scope="col">
              Ojo
            </th>
            <th className="px-3 py-3 text-right" scope="col">
              ESF
            </th>
            <th className="px-3 py-3 text-right" scope="col">
              CIL
            </th>
            <th className="px-3 py-3 text-right" scope="col">
              EJE
            </th>
            <th className="px-3 py-3 text-right" scope="col">
              DIP
            </th>
            <th className="px-4 py-3 text-right" scope="col">
              ALT
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {values.map((value) => (
            <tr key={`${value.distance}:${value.eye}`}>
              <th className="px-4 py-3 font-semibold text-slate-900" scope="row">
                {distanceLabel(value.distance)}
              </th>
              <td className="px-3 py-3 font-semibold text-slate-700">{value.eye}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                {formatOpticalDecimal(value.sphere)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {formatOpticalDecimal(value.cylinder)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {value.axis === null ? '—' : `${value.axis}°`}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {formatOpticalDecimal(value.dip)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatOpticalDecimal(value.height)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
