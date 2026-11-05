import { describe, expect, it } from 'vitest';
import {
  assertAuthorizedWhatsAppUrl,
  buildWhatsAppUrl,
  normalizeWhatsAppPhone,
  parseWhatsAppShareInput,
  WhatsAppValidationError,
} from '../src/shared/whatsapp-validation';

describe('validación de WhatsApp asistido', () => {
  it.each([
    ['011 15 1234-5678', '5491112345678'],
    ['11 15 1234 5678', '5491112345678'],
    ['0351 15 1234567', '5493511234567'],
    ['+54 9 351 1234567', '5493511234567'],
    ['54 9 351 1234567', '5493511234567'],
    ['+54 351 15 1234567', '5493511234567'],
    ['+54 351 1234567', '543511234567'],
    ['54 11 4000 5000', '541140005000'],
    ['+1 (415) 555-2671', '14155552671'],
  ])('normaliza %s como %s', (input, expected) => {
    expect(normalizeWhatsAppPhone(input)).toBe(expected);
  });

  it.each(['', '11 4000 5000', '15 1234 5678', '351 123', 'teléfono'])(
    'rechaza el teléfono ambiguo o incompleto %s',
    (input) => {
      expect(() => normalizeWhatsAppPhone(input)).toThrow(WhatsAppValidationError);
    },
  );

  it('valida un contrato estricto y limita el mensaje', () => {
    expect(() =>
      parseWhatsAppShareInput({ phone: '+54 9 351 1234567', message: 'Hola', url: 'https://x' }),
    ).toThrow(WhatsAppValidationError);
    expect(() =>
      parseWhatsAppShareInput({ phone: '+54 9 351 1234567', message: 'x'.repeat(1001) }),
    ).toThrow(WhatsAppValidationError);
  });

  it('codifica de forma segura acentos, signos y saltos de línea', () => {
    expect(
      buildWhatsAppUrl({ phone: '+54 9 351 1234567', message: '¡Hola, Ana!\nComprobante #1' }),
    ).toBe('https://wa.me/5493511234567?text=%C2%A1Hola%2C%20Ana!%0AComprobante%20%231');
  });

  it.each([
    'http://wa.me/5493511234567?text=Hola',
    'https://evil.example/5493511234567?text=Hola',
    'javascript:alert(1)',
    'https://wa.me/5493511234567?text=Hola&next=https://evil.example',
    'https://wa.me/5493511234567?text=Hola&text=Otro',
    'https://usuario@wa.me/5493511234567?text=Hola',
    'https://wa.me/5493511234567?text=Hola#fragmento',
    'https://wa.me/no-es-numero?text=Hola',
  ])('rechaza destinos externos no autorizados: %s', (url) => {
    expect(() => assertAuthorizedWhatsAppUrl(url)).toThrow();
  });

  it('acepta exclusivamente HTTPS wa.me con teléfono y mensaje', () => {
    expect(assertAuthorizedWhatsAppUrl('https://wa.me/5493511234567?text=Hola').toString()).toBe(
      'https://wa.me/5493511234567?text=Hola',
    );
  });
});
