import { describe, expect, it } from 'vitest';
import { assertNoArguments, IPC_CHANNELS } from '../src/shared/ipc-contracts';

describe('contratos IPC', () => {
  it('mantiene una lista explícita de canales permitidos', () => {
    expect(IPC_CHANNELS).toEqual({ appInfo: 'app:get-info' });
  });

  it('acepta una llamada sin argumentos', () => {
    expect(() => assertNoArguments(IPC_CHANNELS.appInfo, [])).not.toThrow();
  });

  it('rechaza argumentos no esperados', () => {
    expect(() => assertNoArguments(IPC_CHANNELS.appInfo, ['no permitido'])).toThrow(TypeError);
  });
});
