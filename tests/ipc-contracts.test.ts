import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClientIpcHandlers } from '../src/main/ipc/client-handlers';
import { createPrescriptionIpcHandlers } from '../src/main/ipc/prescription-handlers';
import { createOpticalJobIpcHandlers } from '../src/main/ipc/optical-job-handlers';
import { createQueryIpcHandlers } from '../src/main/ipc/query-handlers';
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
      prescriptionsList: 'prescriptions:list',
      prescriptionsListByClient: 'prescriptions:list-by-client',
      prescriptionsGet: 'prescriptions:get',
      prescriptionsCreate: 'prescriptions:create',
      prescriptionsCorrect: 'prescriptions:correct',
      prescriptionsRevisions: 'prescriptions:revisions',
      opticalJobsList: 'optical-jobs:list',
      opticalJobsListByClient: 'optical-jobs:list-by-client',
      opticalJobsListByPrescription: 'optical-jobs:list-by-prescription',
      opticalJobsGet: 'optical-jobs:get',
      opticalJobsCreate: 'optical-jobs:create',
      opticalJobsUpdate: 'optical-jobs:update',
      treatmentsList: 'treatments:list',
      dashboardSummary: 'dashboard:get-summary',
      globalSearch: 'search:global',
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

describe('handlers IPC de fichas de trabajo', () => {
  let context: TestDatabase;
  beforeEach(() => {
    context = createTestDatabase();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    destroyTestDatabase(context);
  });

  it('crea, obtiene, lista y actualiza una ficha con respuestas seguras', () => {
    const owner = context.database.clients.create(TEST_CLIENT);
    const handlers = createOpticalJobIpcHandlers(context.database);
    const created = handlers.create({
      clientId: owner.id,
      jobNumber: 'IPC-01',
      product: 'Lentes de sol',
      treatmentIds: ['edge-polish'],
    });
    expect(created).toMatchObject({ ok: true, data: { jobNumber: 'IPC-01' } });
    if (!created.ok) throw new Error('No se pudo preparar la ficha.');
    expect(handlers.get(created.data.id)).toEqual(created);
    expect(handlers.list({ query: 'IPC-01' })).toMatchObject({ ok: true, data: { total: 1 } });
    expect(handlers.listByClient({ clientId: owner.id })).toMatchObject({
      ok: true,
      data: { total: 1 },
    });
    expect(
      handlers.listByPrescription({ prescriptionId: created.data.prescriptionId }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(handlers.update(created.data.id, { product: 'Producto actualizado' })).toMatchObject({
      ok: true,
      data: { id: created.data.id, product: 'Producto actualizado' },
    });
  });

  it('devuelve el catálogo real de tratamientos sin argumentos', () => {
    const handlers = createOpticalJobIpcHandlers(context.database);
    const result = handlers.treatments();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('No se pudo consultar el catálogo.');
    expect(result.data).toHaveLength(5);
    expect(result.data.every((item) => item.isActive)).toBe(true);
    expect(handlers.treatments('extra')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it('rechaza payloads, IDs y cantidades de argumentos inválidos', () => {
    const handlers = createOpticalJobIpcHandlers(context.database);
    expect(handlers.create({ clientId: '1' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(handlers.get('1')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(handlers.update(1)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('diferencia número duplicado, cliente archivado y receta incompatible', () => {
    const first = context.database.clients.create(TEST_CLIENT);
    const second = context.database.clients.create({ ...TEST_CLIENT, firstName: 'Otra' });
    const recipe = context.database.prescriptions.createWithValues({
      clientId: first.id,
      prescriptionDate: '2026-04-01',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '1.00' }],
    });
    const handlers = createOpticalJobIpcHandlers(context.database);
    handlers.create({ clientId: first.id, jobNumber: 'DUP-1' });
    expect(handlers.create({ clientId: first.id, jobNumber: 'DUP-1' })).toMatchObject({
      ok: false,
      error: { code: 'DUPLICATE_JOB_NUMBER' },
    });
    expect(handlers.create({ clientId: second.id, prescriptionId: recipe.id })).toMatchObject({
      ok: false,
      error: { code: 'PRESCRIPTION_MISMATCH' },
    });
    context.database.clients.archive(second.id);
    expect(handlers.create({ clientId: second.id })).toMatchObject({
      ok: false,
      error: { code: 'ARCHIVED_CLIENT' },
    });
  });

  it('diferencia tratamiento inexistente y ficha inexistente', () => {
    const owner = context.database.clients.create(TEST_CLIENT);
    const handlers = createOpticalJobIpcHandlers(context.database);
    expect(handlers.create({ clientId: owner.id, treatmentIds: ['inexistente'] })).toMatchObject({
      ok: false,
      error: { code: 'TREATMENT_NOT_FOUND' },
    });
    expect(handlers.get(999_999)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No existe la ficha solicitada.' },
    });
  });

  it('oculta detalles internos de persistencia', () => {
    vi.spyOn(context.database.opticalJobs, 'search').mockImplementation(() => {
      throw new Error('C:\\ruta-privada\\base.sqlite3');
    });
    expect(createOpticalJobIpcHandlers(context.database).list({})).toEqual({
      ok: false,
      error: {
        code: 'PERSISTENCE',
        message: 'No se pudo completar la operación. Volvé a intentarlo.',
      },
    });
  });
});

describe('handlers IPC de dashboard y búsqueda', () => {
  let context: TestDatabase;
  beforeEach(() => {
    context = createTestDatabase();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    destroyTestDatabase(context);
  });

  it('expone conteos y resultados agrupados mediante canales específicos', () => {
    const client = context.database.clients.create({ ...TEST_CLIENT, firstName: 'Búsqueda' });
    const prescription = context.database.prescriptions.createWithValues({
      clientId: client.id,
      prescriptionDate: '2026-10-01',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '0.25' }],
    });
    context.database.opticalJobs.createWithTreatments({
      clientId: client.id,
      prescriptionId: prescription.id,
      product: 'Búsqueda solar',
    });
    const handlers = createQueryIpcHandlers(context.database);
    expect(handlers.dashboard()).toEqual({
      ok: true,
      data: { activeClients: 1, totalPrescriptions: 1, totalOpticalJobs: 1 },
    });
    expect(handlers.globalSearch({ query: 'Búsqueda' })).toMatchObject({
      ok: true,
      data: {
        clients: [{ id: client.id }],
        prescriptions: [{ id: prescription.id }],
        opticalJobs: [{ product: 'Búsqueda solar' }],
      },
    });
  });

  it('rechaza argumentos y búsquedas inválidas sin exponer detalles internos', () => {
    const handlers = createQueryIpcHandlers(context.database);
    expect(handlers.dashboard('extra')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(handlers.globalSearch({ query: 'a' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    vi.spyOn(context.database.queries, 'dashboard').mockImplementation(() => {
      throw new Error('C:\\datos\\privados\\optica.sqlite3');
    });
    expect(handlers.dashboard()).toEqual({
      ok: false,
      error: { code: 'PERSISTENCE', message: 'No se pudo consultar la información local.' },
    });
  });
});

describe('handlers IPC de recetas', () => {
  let context: TestDatabase;

  beforeEach(() => {
    context = createTestDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    destroyTestDatabase(context);
  });

  it('crea, obtiene y lista recetas mediante contratos específicos', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const handlers = createPrescriptionIpcHandlers(context.database);
    const created = handlers.create({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '+1,25' }],
    });
    expect(created).toMatchObject({ ok: true, data: { clientId: client.id } });
    if (!created.ok) throw new Error('No se pudo preparar la receta de prueba.');
    expect(handlers.get(created.data.id)).toEqual(created);
    expect(handlers.list({ query: 'Cliente' })).toMatchObject({ ok: true, data: { total: 1 } });
    expect(handlers.listByClient({ clientId: client.id })).toMatchObject({
      ok: true,
      data: { total: 1 },
    });
  });

  it('rechaza payloads y argumentos inválidos antes de persistir', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const handlers = createPrescriptionIpcHandlers(context.database);
    expect(
      handlers.create({ clientId: client.id, prescriptionDate: '2026-03-01', values: [] }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(handlers.get('1')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(handlers.correct(1)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('diferencia cliente inexistente y cliente archivado', () => {
    const handlers = createPrescriptionIpcHandlers(context.database);
    const input = {
      prescriptionDate: '2026-03-01',
      values: [{ distance: 'FAR' as const, eye: 'OD' as const, sphere: '1.00' }],
    };
    expect(handlers.create({ ...input, clientId: 999_999 })).toMatchObject({
      ok: false,
      error: { code: 'CLIENT_NOT_FOUND' },
    });
    const client = context.database.clients.create(TEST_CLIENT);
    context.database.clients.archive(client.id);
    expect(handlers.create({ ...input, clientId: client.id })).toMatchObject({
      ok: false,
      error: { code: 'ARCHIVED_CLIENT' },
    });
  });

  it('corrige y consulta revisiones sin exponer SQLite', () => {
    const client = context.database.clients.create(TEST_CLIENT);
    const handlers = createPrescriptionIpcHandlers(context.database);
    const created = handlers.create({
      clientId: client.id,
      prescriptionDate: '2026-03-01',
      values: [{ distance: 'FAR', eye: 'OD', sphere: '1.00' }],
    });
    if (!created.ok) throw new Error('No se pudo preparar la receta de prueba.');
    expect(
      handlers.correct(created.data.id, {
        prescriptionDate: '2026-03-01',
        reason: 'Error de carga',
        values: [{ distance: 'FAR', eye: 'OD', sphere: '2.00' }],
      }),
    ).toMatchObject({ ok: true, data: { id: created.data.id } });
    expect(handlers.revisions(created.data.id)).toMatchObject({
      ok: true,
      data: [{ reason: 'Error de carga' }],
    });
  });

  it('devuelve errores seguros para recetas inexistentes y fallos internos', () => {
    const handlers = createPrescriptionIpcHandlers(context.database);
    expect(handlers.get(999_999)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No existe la receta solicitada.' },
    });
    vi.spyOn(context.database.prescriptions, 'search').mockImplementation(() => {
      throw new Error('C:\\dato-sensible\\base.sqlite3');
    });
    expect(handlers.list({})).toEqual({
      ok: false,
      error: {
        code: 'PERSISTENCE',
        message: 'No se pudo completar la operación. Volvé a intentarlo.',
      },
    });
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
