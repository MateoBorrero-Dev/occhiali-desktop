import type { DecimalValue } from '../../shared/database-models';

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d{1,2})?$/;

export function toScaledHundredths(value: DecimalValue | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new TypeError('El valor decimal debe usar hasta dos cifras decimales.');
  }

  const negative = normalized.startsWith('-');
  const unsigned = normalized.replace(/^[+-]/, '');
  const [integerPart = '0', decimalPart = ''] = unsigned.split('.');
  const scaled = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));

  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError('El valor decimal está fuera del rango admitido.');
  }

  return negative ? -scaled : scaled;
}

export function fromScaledHundredths(value: number | null): DecimalValue | null {
  if (value === null) {
    return null;
  }

  if (!Number.isSafeInteger(value)) {
    throw new RangeError('La base contiene un valor decimal inválido.');
  }

  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const integerPart = Math.floor(absolute / 100);
  const decimalPart = String(absolute % 100).padStart(2, '0');
  return `${sign}${integerPart}.${decimalPart}`;
}
