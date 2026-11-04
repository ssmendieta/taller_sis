import 'reflect-metadata';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';
import { BoletasModule } from '../boletas/boletas.module';
import { BoletaEnvio } from '../boletas/entities/boleta-envio.entity';
import { BoletaEnvioHistorial } from '../boletas/entities/boleta-envio-historial.entity';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { SolicitudesSalidaModule } from './solicitudes-salida.module';
import { SolicitudSalida } from './entities/solicitud-salida.entity';

const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('Logistica: solicitud de salida a boleta por HTTP y PostgreSQL', () => {
  const schema = `salida_boleta_test_${process.pid}_${Date.now()}`;
  const httpFetch = global.fetch;
  const options = (): PostgresConnectionOptions => ({
    ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
    extra: { options: `-c search_path=${schema}` },
  });
  let source: DataSource;
  let app: INestApplication;
  let base: string;
  let creado = false;
  let permisos: string[];
  let usuarioId: string;
  const ordenesPorCodigo: Record<string, string> = { 'ORD-PRUEBA': '8', 'ORD-2026-00007': '700', 'ORD-2026-00008': '800' };
  const codigoOrden = (id: string) => Object.keys(ordenesPorCodigo).find((codigo) => ordenesPorCodigo[codigo] === id) ?? 'ORD-PRUEBA';
  const produccion = {
    consultarOrdenPorId: jest.fn(async (id: string) => ({ id, codigo: codigoOrden(id), producto_id: 3, producto: { codigo: 'P-PRUEBA' } })),
    consultarOrdenPorCodigo: jest.fn(async (codigo: string) => {
      const id = ordenesPorCodigo[codigo];
      if (!id) throw new NotFoundException('Orden no encontrada');
      return { id, codigo };
    }),
    consultarPorOrden: jest.fn(async (ordenCodigo: string) => ['LOTE-A', 'LOTE-B'].map((codigo, indice) => ({
      id: String(indice + 1), codigo, ordenId: ordenesPorCodigo[ordenCodigo], productoId: '3', cantidad: '20.0000',
    }))),
    consultarConformesPorOrden: jest.fn(async () => [{ cantidad: '1000.0000' }]),
  };
  const body = { ordenId: '8', destinoDocumental: 'Destino de prueba', motivo: 'Verificación de persistencia',
    items: [{ referencia: 'LOTE-A', cantidad: '10.0000' }, { referencia: 'LOTE-B', cantidad: '2.0000' }] };

  async function arrancar() {
    const module = await Test.createTestingModule({ imports: [
      TypeOrmModule.forRoot(options()), SolicitudesSalidaModule, BoletasModule,
    ] }).overrideProvider(LotesProduccionClient).useValue(produccion).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }

  beforeAll(async () => {
    source = new DataSource(options());
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      for (const migration of [new CrearSolicitudesSalida1710000000001(), new CrearBoletasEnvio1710000000002(),
        new ReglaConcurrenciaDocumental1710000000003(), new HistorialBoletasEnvio1710000000004()]) {
        await migration.up(runner);
      }
      await runner.commitTransaction();
      creado = true;
    } catch (error) { await runner.rollbackTransaction(); throw error; }
    finally { await runner.release(); }
    await arrancar();
  }, 30000);

  beforeEach(() => {
    usuarioId = '42';
    permisos = ['logistica.solicitudes.consultar', 'logistica.solicitudes.gestionar', 'logistica.boletas.consultar', 'logistica.boletas.gestionar'];
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: usuarioId, rol: 'Encargado de Logística', permisos: permisos.map((codigo) => ({ codigo })),
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    if (source?.isInitialized) {
      try { if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await source.destroy(); }
    }
  });

  async function request(path: string, method = 'GET', datos?: unknown, sesion = true) {
    const respuesta = await httpFetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: 'Bearer prueba' } : {}) },
      ...(datos !== undefined ? { body: JSON.stringify(datos) } : {}),
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }

  it('GET /boletas vacio pagina con relaciones sin el error databaseName', async () => {
    expect(await request('/boletas')).toEqual({ status: 200, body: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 } });
  });

  it('201/200: crea solicitud, la vuelve a listar, crea boleta y mantiene ambos registros tras reiniciar Nest', async () => {
    const solicitud = await request('/solicitudes-salida', 'POST', body);
    expect(solicitud.status).toBe(201);
    expect(solicitud.body).toMatchObject({ ...body, id: expect.any(String), estado: 'BORRADOR', responsableUsuarioId: '42' });
    const guardada = await source.getRepository(SolicitudSalida).findOneOrFail({ where: { id: solicitud.body.id }, relations: { items: true } });
    expect(JSON.parse(JSON.stringify(guardada))).toEqual(solicitud.body);
    expect((await request('/solicitudes-salida')).body).toContainEqual(solicitud.body);
    const boleta = await request('/boletas', 'POST', { solicitudSalidaId: solicitud.body.id, items: body.items });
    expect(boleta.status).toBe(201);
    expect(boleta.body).toMatchObject({ id: expect.any(String), solicitudSalidaId: solicitud.body.id, estado: 'BORRADOR' });
    const detalle = await request(`/boletas/${boleta.body.id}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.numero).toMatch(/^BOL-\d{4}-\d{5}$/);
    const pagina = await request('/boletas?page=1&limit=1');
    expect(pagina.status).toBe(200);
    const { historial, ...sinHistorial } = detalle.body;
    expect(historial).toEqual([]);
    expect(pagina.body).toMatchObject({ total: 1, items: [expect.objectContaining(sinHistorial)] });
    await app.close();
    await arrancar();
    expect((await request(`/solicitudes-salida/${solicitud.body.id}`)).status).toBe(200);
    // El POST usa 201 y la consulta 200; los datos persistidos deben ser idénticos.
    expect((await request(`/solicitudes-salida/${solicitud.body.id}`)).body).toEqual(solicitud.body);
    expect(await request(`/boletas/${boleta.body.id}`)).toEqual(detalle);
  });

  it('la paginacion con varios items devuelve boletas completas sin duplicar cabeceras', async () => {
    const solicitud = await request('/solicitudes-salida', 'POST', body);
    const boleta = await request('/boletas', 'POST', { solicitudSalidaId: solicitud.body.id, items: body.items });
    expect(boleta.status).toBe(201);
    const total = await source.getRepository(BoletaEnvio).count();
    const pagina = await request('/boletas?page=1&limit=1&estado=BORRADOR');
    expect(pagina.status).toBe(200);
    expect(pagina.body.total).toBe(total);
    expect(pagina.body.items).toHaveLength(1);
    expect(pagina.body.items[0].items).toHaveLength(2);
    expect(pagina.body.items[0].solicitudSalida.id).toBe(solicitud.body.id);
  });

  it.each([['ordenId numerico', { ...body, ordenId: 8 }], ['sin items', { ...body, items: [] }],
    ['cantidad cero', { ...body, items: [{ referencia: 'LOTE-A', cantidad: '0' }] }],
    ['cantidad como numero', { ...body, items: [{ referencia: 'LOTE-A', cantidad: 10 }] }],
    ['estado en body', { ...body, estado: 'PREPARADA' }]])('400: %s no deja una solicitud parcial', async (_caso, datos) => {
    const anteriores = await source.getRepository(SolicitudSalida).count();
    expect((await request('/solicitudes-salida', 'POST', datos)).status).toBe(400);
    expect(await source.getRepository(SolicitudSalida).count()).toBe(anteriores);
  });

  it('401/403: mantiene la autenticacion y los permisos independientes de solicitudes y boletas', async () => {
    const anteriores = await source.getRepository(SolicitudSalida).count();
    expect((await request('/solicitudes-salida', 'POST', body, false)).status).toBe(401);
    permisos = ['logistica.boletas.gestionar'];
    expect((await request('/solicitudes-salida')).status).toBe(403);
    expect((await request('/solicitudes-salida', 'POST', body)).status).toBe(403);
    permisos = ['logistica.solicitudes.consultar'];
    expect((await request('/solicitudes-salida')).status).toBe(200);
    expect((await request('/boletas')).status).toBe(403);
    expect(await source.getRepository(SolicitudSalida).count()).toBe(anteriores);
  });

  it('404: una boleta con referencia ajena a la solicitud no se persiste', async () => {
    const solicitud = await request('/solicitudes-salida', 'POST', body);
    const anteriores = await source.getRepository(BoletaEnvio).count();
    expect((await request('/boletas', 'POST', { solicitudSalidaId: solicitud.body.id,
      items: [{ referencia: 'LOTE-AJENO', cantidad: '1.0000' }] })).status).toBe(404);
    expect(await source.getRepository(BoletaEnvio).count()).toBe(anteriores);
  });

  it('500: si falla un item no queda una cabecera de solicitud huerfana', async () => {
    const anteriores = await source.getRepository(SolicitudSalida).count();
    await source.query(`ALTER TABLE "${schema}".solicitudes_salida_items ADD CONSTRAINT fallo_item_prueba CHECK (referencia <> 'LOTE-FALLO')`);
    try {
      expect((await request('/solicitudes-salida', 'POST', { ...body, items: [{ referencia: 'LOTE-FALLO', cantidad: '1.0000' }] })).status).toBe(500);
      expect(await source.getRepository(SolicitudSalida).count()).toBe(anteriores);
    } finally { await source.query(`ALTER TABLE "${schema}".solicitudes_salida_items DROP CONSTRAINT fallo_item_prueba`); }
  });

  async function crearBoleta(emitida = false, ordenId = '8') {
    const solicitud = await request('/solicitudes-salida', 'POST', { ...body, ordenId });
    expect(solicitud.status).toBe(201);
    const creada = await request('/boletas', 'POST', { solicitudSalidaId: solicitud.body.id, items: body.items });
    expect(creada.status).toBe(201);
    if (emitida) expect((await request(`/boletas/${creada.body.id}/emitir`, 'POST')).status).toBe(201);
    return (await request(`/boletas/${creada.body.id}`)).body;
  }

  it('ABC-124: anula EMITIDA con permiso, persiste auditoría de otro actor y conserva responsable e ítems tras reiniciar', async () => {
    const original = await crearBoleta(true);
    usuarioId = '55';
    const anulada = await request(`/boletas/${original.id}/anular`, 'POST', { motivo: '  Destino incorrecto  ' });
    expect(anulada.status).toBe(201);
    const detalle = await request(`/boletas/${original.id}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({ ...original, actualizadoEn: expect.any(String), estado: 'ANULADA', historial: [expect.objectContaining({
      boletaId: original.id, estadoAnterior: 'EMITIDA', estadoNuevo: 'ANULADA',
      usuarioActorId: '55', motivo: 'Destino incorrecto', fechaHora: expect.any(String),
    })] });
    expect(detalle.body.responsableUsuarioId).toBe('42');
    expect(Number.isNaN(Date.parse(detalle.body.historial[0].fechaHora))).toBe(false);
    const guardada = await source.getRepository(BoletaEnvio).findOneOrFail({ where: { id: original.id },
      relations: { items: true, historial: true } });
    expect(JSON.parse(JSON.stringify(guardada))).toEqual(detalle.body);
    await app.close(); await arrancar();
    expect(await request(`/boletas/${original.id}`)).toEqual(detalle);
  });

  it.each(['', '   '])('ABC-124: motivo %j devuelve 400 sin cambiar la boleta ni insertar auditoría', async (motivo) => {
    const original = await crearBoleta(true);
    const anteriores = await source.getRepository(BoletaEnvioHistorial).count();
    expect((await request(`/boletas/${original.id}/anular`, 'POST', { motivo })).status).toBe(400);
    expect((await request(`/boletas/${original.id}`)).body).toEqual(original);
    expect(await source.getRepository(BoletaEnvioHistorial).count()).toBe(anteriores);
  });

  it('ABC-124: sin permiso gestionar devuelve 403, sin sesión 401, sin cambiar estado ni historial', async () => {
    const original = await crearBoleta(true);
    permisos = ['logistica.boletas.consultar'];
    expect((await request(`/boletas/${original.id}/anular`, 'POST', { motivo: 'Motivo' })).status).toBe(403);
    expect((await request(`/boletas/${original.id}/anular`, 'POST', { motivo: 'Motivo' }, false)).status).toBe(401);
    expect((await request(`/boletas/${original.id}`)).body).toEqual(original);
  });

  it('ABC-124: BORRADOR y ANULADA devuelven 409 sin datos parciales ni historial duplicado', async () => {
    const borrador = await crearBoleta();
    expect((await request(`/boletas/${borrador.id}/anular`, 'POST', { motivo: 'Motivo' })).status).toBe(409);
    expect((await request(`/boletas/${borrador.id}`)).body).toEqual(borrador);
    const emitida = await crearBoleta(true);
    expect((await request(`/boletas/${emitida.id}/anular`, 'POST', { motivo: 'Primera anulación' })).status).toBe(201);
    const primera = await request(`/boletas/${emitida.id}`);
    expect((await request(`/boletas/${emitida.id}/anular`, 'POST', { motivo: 'Repetida' })).status).toBe(409);
    expect(await request(`/boletas/${emitida.id}`)).toEqual(primera);
    expect(await source.getRepository(BoletaEnvioHistorial).countBy({ boletaId: emitida.id })).toBe(1);
  });

  it('ABC-123: filtra código y estado en PostgreSQL, pagina y al limpiar devuelve el total sin filtros', async () => {
    const borrador = await crearBoleta(false, '700');
    const emitida = await crearBoleta(true, '700');
    const otraOrden = await crearBoleta(false, '800');
    const porOrden = await request('/boletas?orden=ORD-2026-00007');
    expect(porOrden.status).toBe(200);
    expect(porOrden.body).toMatchObject({ total: 2, page: 1, limit: 10, totalPages: 1 });
    expect(porOrden.body.items.map((item: BoletaEnvio) => item.id).sort()).toEqual([borrador.id, emitida.id].sort());
    expect(porOrden.body.items.every((item: BoletaEnvio) => item.solicitudSalida.ordenId === '700')).toBe(true);
    const combinada = await request('/boletas?orden=ORD-2026-00007&estado=EMITIDA');
    expect(combinada.status).toBe(200);
    expect(combinada.body).toMatchObject({ total: 1, items: [expect.objectContaining({ id: emitida.id, estado: 'EMITIDA' })] });
    const primera = await request('/boletas?orden=ORD-2026-00007&page=1&limit=1');
    const segunda = await request('/boletas?orden=ORD-2026-00007&page=2&limit=1');
    expect(primera.body).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });
    expect(segunda.body).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(primera.body.items).toHaveLength(1);
    expect(segunda.body.items).toHaveLength(1);
    expect(primera.body.items[0].id).not.toBe(segunda.body.items[0].id);
    const todas = await request('/boletas?page=1&limit=100');
    expect(todas.body.total).toBe(await source.getRepository(BoletaEnvio).count());
    expect(todas.body.items).toEqual(expect.arrayContaining([borrador, emitida, otraOrden].map(({ id }) => expect.objectContaining({ id }))));
  });

  it('ABC-123: código inexistente devuelve 200 sin resultados y ausencia de permiso devuelve 403', async () => {
    const inexistente = await request('/boletas?orden=ORD-INEXISTENTE&estado=EMITIDA&page=1&limit=5');
    expect(inexistente).toEqual({ status: 200, body: { items: [], total: 0, page: 1, limit: 5, totalPages: 0 } });
    permisos = ['logistica.boletas.gestionar'];
    expect((await request('/boletas?orden=ORD-2026-00007&estado=EMITIDA')).status).toBe(403);
    expect((await request('/boletas')).status).toBe(403);
  });
});
