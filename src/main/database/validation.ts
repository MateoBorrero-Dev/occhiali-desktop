export function requiredText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${fieldName} es obligatorio.`);
  }
  return normalized;
}

export function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function calendarDate(value: string, fieldName: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${fieldName} debe tener formato AAAA-MM-DD.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`${fieldName} no es una fecha válida.`);
  }

  return value;
}

export function optionalCalendarDate(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  return value === null || value === undefined ? null : calendarDate(value, fieldName);
}

export function axisDegrees(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0 || value > 180) {
    throw new RangeError('El eje debe ser un número entero entre 0 y 180.');
  }

  return value;
}
