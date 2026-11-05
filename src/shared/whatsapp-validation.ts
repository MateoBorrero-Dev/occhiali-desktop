export class WhatsAppValidationError extends Error {
  public constructor(public readonly issues: readonly { field: string; message: string }[]) {
    super(issues[0]?.message ?? 'Los datos para compartir no son válidos.');
    this.name = 'WhatsAppValidationError';
  }
}

export const WHATSAPP_MESSAGE_LIMIT = 1_000;

export interface WhatsAppShareInput {
  phone: string;
  message: string;
}

function phoneError(message: string): never {
  throw new WhatsAppValidationError([{ field: 'phone', message }]);
}

function digitsOnly(value: string): string {
  return value.replace(/[\s().-]/g, '');
}

function assertInternationalLength(digits: string): string {
  if (!/^\d{8,15}$/.test(digits) || /^0+$/.test(digits)) {
    phoneError('Ingresá un teléfono internacional válido, con código de país y sin internos.');
  }
  return digits;
}

function normalizeArgentineMobile(value: string): string | null {
  let local = value;
  if (local.startsWith('0')) local = local.slice(1);
  if (/^9\d{10}$/.test(local)) return `54${local}`;
  if (local.length !== 12) return null;

  const candidates: string[] = [];
  for (let areaLength = 2; areaLength <= 4; areaLength += 1) {
    if (local.slice(areaLength, areaLength + 2) !== '15') continue;
    const national = `${local.slice(0, areaLength)}${local.slice(areaLength + 2)}`;
    if (/^\d{10}$/.test(national)) candidates.push(`549${national}`);
  }
  return candidates.length === 1 ? candidates[0]! : null;
}

export function normalizeWhatsAppPhone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    phoneError('Ingresá el teléfono del destinatario para este envío.');
  }
  const compact = digitsOnly(value.trim());
  if (compact.startsWith('+')) {
    const digits = compact.slice(1);
    if (!/^\d+$/.test(digits)) phoneError('El teléfono contiene caracteres no permitidos.');
    if (/^549\d{10}$/.test(digits)) return digits;
    if (digits.startsWith('54')) {
      const national = digits.slice(2);
      const converted = normalizeArgentineMobile(national);
      if (converted) return converted;
      if (/^\d{10}$/.test(national)) return digits;
      phoneError(
        'El número argentino es ambiguo. Usá el formato internacional móvil +54 9 seguido de característica y número.',
      );
    }
    return assertInternationalLength(digits);
  }

  if (!/^\d+$/.test(compact)) phoneError('El teléfono contiene caracteres no permitidos.');
  if (/^549\d{10}$/.test(compact)) return compact;
  if (compact.startsWith('54')) {
    const national = compact.slice(2);
    const converted = normalizeArgentineMobile(national);
    if (converted) return converted;
    if (/^\d{10}$/.test(national)) return compact;
    phoneError(
      'El número argentino es ambiguo. Usá el formato internacional móvil +54 9 seguido de característica y número.',
    );
  }
  const argentina = normalizeArgentineMobile(compact);
  if (argentina) return argentina;
  phoneError(
    'No se puede determinar el país o la característica. Corregí el número usando formato internacional, por ejemplo +54 9 351 1234567.',
  );
}

export function parseWhatsAppShareInput(value: unknown): WhatsAppShareInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WhatsAppValidationError([{ field: 'form', message: 'La solicitud no es válida.' }]);
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => key !== 'phone' && key !== 'message') ||
    !Object.hasOwn(input, 'phone') ||
    !Object.hasOwn(input, 'message')
  ) {
    throw new WhatsAppValidationError([
      { field: 'form', message: 'La solicitud contiene campos no permitidos.' },
    ]);
  }
  const phone = normalizeWhatsAppPhone(input.phone);
  if (typeof input.message !== 'string' || !input.message.trim()) {
    throw new WhatsAppValidationError([{ field: 'message', message: 'Escribí un mensaje.' }]);
  }
  const message = input.message.trim();
  if (message.length > WHATSAPP_MESSAGE_LIMIT) {
    throw new WhatsAppValidationError([
      {
        field: 'message',
        message: `El mensaje no puede superar los ${WHATSAPP_MESSAGE_LIMIT} caracteres.`,
      },
    ]);
  }
  return { phone, message };
}

export function buildWhatsAppUrl(input: WhatsAppShareInput): string {
  const phone = normalizeWhatsAppPhone(input.phone);
  const message = parseWhatsAppShareInput({ phone, message: input.message }).message;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function assertAuthorizedWhatsAppUrl(value: string): URL {
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'wa.me' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.hash !== '' ||
    !/^\/\d{8,15}$/.test(parsed.pathname) ||
    [...parsed.searchParams.keys()].some((key) => key !== 'text') ||
    parsed.searchParams.getAll('text').length !== 1 ||
    !parsed.searchParams.get('text')
  ) {
    throw new WhatsAppValidationError([
      { field: 'form', message: 'El destino externo no está autorizado.' },
    ]);
  }
  return parsed;
}
