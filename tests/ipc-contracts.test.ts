import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClientIpcHandlers } from '../src/main/ipc/client-handlers';
import { assertArgumentCount, assertNoArguments, IPC_CHANNELS } from '../src/shared/ipc-contracts';
import { createTestDatabase, destroyTestDatabase, TEST_CLIENT } from './database/helpers';
import type { TestDatabase } from './database/helpers';

describe('contratos IPC', () => {
  it('mantiene una lista explícita de canales permitidos', () => {
    expect(IPC_CHANNELS).toEqual({
      appInfo: 'app:get-info',
      clientsList: 'clients:list',
      clientsGet: 'clients:get',
      clientsCreate: 'clients:create',
      clientsUpdate: 'clients:update',
      clientsArchive: 'clients:archive',
      clientsRestore: 'clients:restore',
    });
  });

  it('acepta una llamada sin argumentos', () => {
    expect(() => assertNoArguments(IPC_CHANNELS.appInfo, [])).not.toThrow();
  });

  it('rechaza argumentos no esperados', () => {
    expect(() => assertNoArguments(IPC_CHANNELS.appInfo, ['no permitido'])).toThrow(TypeError);
    expect(() => assertArgumentCount(IPC_CHANNELS.clientsGet, [], 1)).toThrow(TypeError);
  });
});

describe('handlers IPC de clientes', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    destroyTestDatabase(context);
  });

  it('crea y lista clientes con una respuesta segura', () => {
    const handlers = createClientIpcHandlers(context.database);
    const created = handlers.create({ ...TEST_CLIENT, documentNumber: null });
    const listed = handlers.list({ status: 'active', limit: 25, offset: 0 });
    expect(created.ok).toBe(true);
    expect(listed.ok && listed.data.total).toBe(1);
  });

  it('rechaza entradas inválidas antes de llegar a SQLite', () => {
    const handlers = createClientIpcHandlers(context.database);
    const result = handlers.create({ ...TEST_CLIENT, firstName: '' });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Revisá los datos ingresados.',
        fields: { firstName: 'El nombre es obligatorio.' },
      },
    });
  });

  it('rechaza IDs y cantidad de argumentos inválidos', () => {
    const handlers = createClientIpcHandlers(context.database);
    expect(handlers.get('1')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(handlers.update(1)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('diferencia un cliente inexistente', () => {
    const handlers = createClientIpcHandlers(context.database);
    expect(handlers.get(999_999)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No existe el cliente solicitado.' },
    });
  });

  it('informa DNI duplicado sin revelar detalles de SQLite', () => {
    const handlers = createClientIpcHandlers(context.database);
    handlers.create({ ...TEST_CLIENT, documentNumber: '12345678' });
    const duplicated = handlers.create({ ...TEST_CLIENT, documentNumber: '12.345.678' });
    expect(duplicated).toEqual({
      ok: false,
      error: {
        code: 'DUPLICATE_DOCUMENT',
        message: 'Ya existe un cliente registrado con ese DNI.',
      },
    });
  });

  it('archiva y reactiva mediante operaciones específicas', () => {
    const handlers = createClientIpcHandlers(context.database);
    const created = handlers.create(TEST_CLIENT);
    if (!created.ok) throw new Error('No se pudo preparar el cliente de prueba.');
    expect(handlers.archive(created.data.id)).toMatchObject({
      ok: true,
      data: { isArchived: true },
    });
    expect(handlers.restore(created.data.id)).toMatchObject({
      ok: true,
      data: { isArchived: false },
    });
  });

  it('oculta errores internos de persistencia', () => {
    vi.spyOn(context.database.clients, 'search').mockImplementation(() => {
      throw new Error('C:\\ruta-privada\\optica.sqlite3');
    });
    const result = createClientIpcHandlers(context.database).list({});
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PERSISTENCE',
        message: 'No se pudo completar la operación. Volvé a intentarlo.',
      },
    });
  });

  it('diferencia conflictos temporales del almacenamiento', () => {
    vi.spyOn(context.database.clients, 'search').mockImplementation(() => {
      throw Object.assign(new Error('busy'), { code: 'SQLITE_BUSY' });
    });
    expect(createClientIpcHandlers(context.database).list({})).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });
});
