export const DELIVERY_RECEIPT_TIME_ZONE = 'America/Argentina/Cordoba';

const boundaryFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DELIVERY_RECEIPT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function zonedParts(timestamp: number): Record<string, number> {
  return Object.fromEntries(
    boundaryFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function deliveryDateBoundaryIso(date: string, dayOffset: number): string {
  const normalizedTarget = new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)) + dayOffset,
    ),
  );
  const target = Date.UTC(
    normalizedTarget.getUTCFullYear(),
    normalizedTarget.getUTCMonth(),
    normalizedTarget.getUTCDate(),
  );
  let timestamp = target;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(timestamp);
    const representedAsUtc = Date.UTC(
      parts.year ?? 0,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
    );
    const correction = target - representedAsUtc;
    timestamp += correction;
    if (correction === 0) break;
  }

  return new Date(timestamp).toISOString();
}
