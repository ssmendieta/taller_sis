import 'reflect-metadata';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { EJEMPLO_RESPUESTA_RECURSOS_V1 } from '../recursos-externos/dto/recursos-logisticos-v1';
import { GuardarRutaDto } from './dto/guardar-ruta.dto';
import { RutasModule } from './rutas.module';

// ABC-373: HTTP, módulos, validadores, transacciones y bloqueos PostgreSQL reales.
// Los sistemas externos Auth, ERP y Producción son simuladores HTTP explícitos.
// Solo se crean/eliminan datos del esquema temporal abc373_* de esta ejecución.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-373: aceptación de asignación de rutas por HTTP y PostgreSQL', () => {
  const schema = `abc373_${process.pid}_${Date.now()}`;
  const opciones: PostgresConnectionOptions = {
    ...(AppDataSource.options as PostgresConnectionOptions), schema,
    extra: { options: `-c search_path=${schema}`, application_name: schema, max: 12 },
  };
  const variables = ['AUTH_SERVICE_URL', 'PRODUCCION_SERVICE_URL', 'ERP_RECURSOS_URL',
    'ERP_RECURSOS_TOKEN', 'ERP_RECURSOS_REINTENTOS'];
  const originales = new Map(variables.map((nombre) => [nombre, process.env[nombre]]));
  let admin: DataSource;
  let source: DataSource;
  let app: INestApplication;
  let base: string;
  let externos: Server;
  let creado = false;
  let erpDisponible: boolean;
  let produccionDisponible: boolean;
  let vehiculos: typeof EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos;
  let choferes: typeof EJEMPLO_RESPUESTA_RECURSOS_V1.choferes;
  let unidades: Map<string, string | null>;
  let solicitudesExternas: Array<{ path: string; authorization: string | undefined }>;

  async function iniciarApp() {
    const modulo = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ ...opciones, migrations: [], retryAttempts: 0 }), RutasModule],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }

  beforeAll(async () => {
    admin = new DataSource({ ...opciones, migrations: [], entities: [] });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    creado = true;
    source = new DataSource(opciones);
    await source.initialize();
    await source.runMigrations({ transaction: 'all' });

    externos = createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      solicitudesExternas.push({ path: url.pathname, authorization: req.headers.authorization });
      const responder = (status: number, datos: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(datos));
      };
      if (url.pathname === '/me') {
        const permisos = req.headers.authorization === 'Bearer gestor'
          ? ['logistica.rutas.gestionar', 'logistica.rutas.consultar']
          : req.headers.authorization === 'Bearer lector' ? ['logistica.rutas.consultar'] : null;
        return permisos ? responder(200, { id: '42', permisos }) : responder(401, { message: 'Sesión de prueba inválida' });
      }
      if (url.pathname === '/v1/recursos-logisticos') {
        if (req.headers.authorization !== 'Bearer erp-prueba') return responder(401, {});
        return erpDisponible ? responder(200, {
          version: 'recursos-logisticos.v1', fecha: url.searchParams.get('fecha'),
          generadoEn: '2026-11-11T12:00:00Z', vehiculos, choferes,
        }) : responder(503, {});
      }
      const orden = /^\/ordenes\/(\d+)$/.exec(url.pathname);
      if (orden) {
        if (!produccionDisponible) return responder(503, {});
        if (!unidades.has(orden[1])) return responder(404, {});
        return responder(200, { id: orden[1], codigo: `ORD-${orden[1]}`, producto_id: '1',
          producto: unidades.get(orden[1]) === null ? null : { unidad_producto: unidades.get(orden[1]) } });
      }
      responder(404, {});
    });
    await new Promise<void>((resolve) => externos.listen(0, '127.0.0.1', resolve));
    const externoUrl = `http://127.0.0.1:${(externos.address() as AddressInfo).port}`;
    process.env.AUTH_SERVICE_URL = externoUrl;
    process.env.PRODUCCION_SERVICE_URL = externoUrl;
    process.env.ERP_RECURSOS_URL = externoUrl;
    process.env.ERP_RECURSOS_TOKEN = 'erp-prueba';
    process.env.ERP_RECURSOS_REINTENTOS = '0';
    await iniciarApp();
  }, 30000);

  beforeEach(async () => {
    await source.query('TRUNCATE rutas, solicitudes_salida, grupos_salida, recursos_externos_snapshots RESTART IDENTITY CASCADE');
    erpDisponible = produccionDisponible = true;
    vehiculos = ['V1', 'V2'].map((idExterno) => ({ idExterno, placa: idExterno, descripcion: null,
      capacidad: { valor: '15.0000', unidad: 'kg' }, disponible: true }));
    choferes = ['C1', 'C2'].map((idExterno) => ({ idExterno, nombre: idExterno, licenciaCategoria: null, disponible: true }));
    unidades = new Map();
    solicitudesExternas = [];
  });

  afterAll(async () => {
    try {
      await app?.close();
      if (externos?.listening) {
        externos.closeAllConnections();
        await new Promise<void>((resolve, reject) => externos.close((error) => error ? reject(error) : resolve()));
      }
      if (source?.isInitialized) await source.destroy();
      if (creado && admin?.isInitialized) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      if (admin?.isInitialized) await admin.destroy();
      for (const [nombre, valor] of originales) {
        if (valor === undefined) delete process.env[nombre]; else process.env[nombre] = valor;
      }
    }
  });

  async function boleta(cantidad = '5.0000', unidad: string | null = 'kg', estado = 'EMITIDA') {
    const [solicitud] = await source.query(`INSERT INTO solicitudes_salida
      (orden_id, destino_documental, motivo, responsable_usuario_id, estado)
      VALUES ($1, 'Tienda', 'ABC-373', 42, 'PREPARADA')
      RETURNING id::text, orden_id::text`, [String(unidades.size + 1)]);
    unidades.set(solicitud.orden_id, unidad);
    const [documento] = await source.query(`INSERT INTO boletas_envio (solicitud_salida_id, responsable_usuario_id, estado)
      VALUES ($1, 42, $2) RETURNING id::text`, [solicitud.id, estado]);
    await source.query(`INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad)
      VALUES ($1, 'Producto de prueba', $2)`, [documento.id, cantidad]);
    return documento.id as string;
  }

  const dto = (boletaIds: string[], cambios: Partial<GuardarRutaDto> = {}): GuardarRutaDto => ({
    grupoId: null, fechaProgramada: '2026-11-11', vehiculoExternoId: 'V1', choferExternoId: 'C1',
    paradas: [{ destino: 'Tienda', boletaIds }], ...cambios,
  });
  async function consultar(method: string, ruta: string, cuerpo?: unknown, token: string | null = 'gestor') {
    const res = await fetch(base + ruta, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(5000) });
    return { status: res.status, cuerpo: await res.json() };
  }
  const crear = (cuerpo: unknown, token: string | null = 'gestor') => consultar('POST', '/rutas', cuerpo, token);
  const conteos = () => source.query(`SELECT (SELECT count(*)::int FROM rutas) AS rutas,
    (SELECT count(*)::int FROM rutas_paradas) AS paradas,
    (SELECT count(*)::int FROM rutas_paradas_boletas) AS documentos`);

  it('CA-01 y persistencia de CA-05: guarda grupo, paradas, documentos, fecha y autor; recupera todo al reiniciar la aplicación', async () => {
    const ids = [await boleta(), await boleta('2.1250')];
    const [grupo] = await source.query(`INSERT INTO grupos_salida
      (destino,fecha_requerida,tipo_carga,unidad_carga,creado_por_usuario_id)
      VALUES ('Tienda','2026-11-11','Seca','kg',42) RETURNING id::text`);
    await source.query(`INSERT INTO grupos_salida_solicitudes (grupo_id,solicitud_id)
      SELECT $1, solicitud_salida_id FROM boletas_envio WHERE id = ANY($2::bigint[])`, [grupo.id, ids]);
    const cuerpo = dto(ids, { grupoId: grupo.id, paradas: [
      { destino: 'Primera tienda', boletaIds: [ids[0]] }, { destino: 'Segunda tienda', boletaIds: [ids[1]] },
    ] });
    const guardado = await crear(cuerpo);
    expect(guardado.status).toBe(201);
    expect(guardado.cuerpo).toMatchObject({ grupoId: grupo.id, fechaProgramada: cuerpo.fechaProgramada,
      vehiculoExternoId: 'V1', choferExternoId: 'C1', responsableUsuarioId: '42', estado: 'PLANIFICADA' });
    expect(guardado.cuerpo.paradas.map(({ secuencia, destino, boletas }) => ({ secuencia, destino, boletas: boletas.map((b) => b.boletaId) })))
      .toEqual([{ secuencia: 1, destino: 'Primera tienda', boletas: [ids[0]] }, { secuencia: 2, destino: 'Segunda tienda', boletas: [ids[1]] }]);
    expect(solicitudesExternas.some((s) => s.path.startsWith('/ordenes/') && s.authorization === 'Bearer gestor')).toBe(true);
    expect((await source.query('SELECT count(*)::int AS cantidad FROM eventos_outbox'))[0].cantidad).toBe(0);
    await app.close();
    await iniciarApp();
    expect(await consultar('GET', `/rutas/${guardado.cuerpo.id}`, undefined, 'lector')).toEqual({ status: 200, cuerpo: guardado.cuerpo });
    expect((await consultar('GET', '/rutas')).cuerpo).toHaveLength(1);
  });

  it.each(['vehículo', 'chofer'])('CA-02: dos peticiones HTTP concurrentes por el mismo %s esperan un bloqueo real y solo una se guarda', async (recurso) => {
    const cuerpos = [dto([await boleta()]), dto([await boleta()], recurso === 'vehículo'
      ? { choferExternoId: 'C2' } : { vehiculoExternoId: 'V2' })];
    const clave = `rutas:${recurso === 'vehículo' ? 'vehiculo:2026-11-11:V1' : 'chofer:2026-11-11:C1'}`;
    const bloqueo = source.createQueryRunner();
    await bloqueo.startTransaction();
    let peticiones: Promise<Awaited<ReturnType<typeof crear>>[]> | undefined;
    let esperando = 0;
    try {
      await bloqueo.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [clave]);
      peticiones = Promise.all(cuerpos.map((cuerpo) => crear(cuerpo)));
      for (let intento = 0; intento < 80 && esperando < 2; intento++) {
        const [fila] = await source.query(`SELECT count(*)::int AS cantidad FROM pg_locks l
          JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE l.locktype = 'advisory' AND NOT l.granted AND a.application_name = $1`, [schema]);
        esperando = fila.cantidad;
        if (esperando < 2) await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      await bloqueo.rollbackTransaction();
      await bloqueo.release();
    }
    const respuestas = await peticiones!;
    expect(esperando).toBe(2);
    expect(respuestas.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(respuestas.find(({ status }) => status === 409)!.cuerpo.codigo).toBe('CONFLICTO_RECURSOS');
    expect(await conteos()).toEqual([{ rutas: 1, paradas: 1, documentos: 1 }]);
  });

  it.each(['PLANIFICADA', 'DESPACHADA'])('CA-02: una ruta %s ocupa los recursos del día, pero no los del día siguiente', async (estado) => {
    const primera = await crear(dto([await boleta()]));
    expect(primera.status).toBe(201);
    if (estado === 'DESPACHADA') await source.query(`UPDATE rutas SET estado = 'DESPACHADA',
      despachada_en = NOW(), despachada_por_usuario_id = 42 WHERE id = $1`, [primera.cuerpo.id]);
    const otraBoleta = await boleta();
    expect((await crear(dto([otraBoleta]))).status).toBe(409);
    expect((await crear(dto([otraBoleta], { fechaProgramada: '2026-11-12' }))).status).toBe(201);
  });

  it.each(['COMPLETADA', 'CANCELADA'])('CA-02: una ruta %s deja libres sus recursos para otra asignación', async (estado) => {
    const primera = await crear(dto([await boleta()]));
    expect(primera.status).toBe(201);
    await source.query(`UPDATE rutas SET estado = $2::varchar, despachada_en = NOW(), despachada_por_usuario_id = 42,
      completada_en = CASE WHEN $2::varchar = 'COMPLETADA' THEN NOW() ELSE NULL END WHERE id = $1`, [primera.cuerpo.id, estado]);
    expect((await crear(dto([await boleta()]))).status).toBe(201);
  });

  it('CA-03: admite el límite exacto y rechaza una diezmilésima de sobrecarga sin dejar filas parciales', async () => {
    const ids = [await boleta('10.0000'), await boleta('5.0001')];
    const exceso = await crear(dto(ids));
    expect(exceso.status).toBe(409);
    expect(exceso.cuerpo.message).toContain('15.0001 kg');
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
    await source.query('UPDATE boletas_envio_items SET cantidad = 5 WHERE boleta_id = $1', [ids[1]]);
    expect((await crear(dto(ids))).status).toBe(201);
  });

  it.each([
    ['unidad desconocida', 'g', 'Unidad de carga desconocida'],
    ['unidad ausente', null, 'Carga desconocida'],
    ['unidades mezcladas', 'l', 'mezcla unidades'],
  ])('CA-03: bloquea %s', async (_caso, unidad, mensaje) => {
    const respuesta = await crear(dto([await boleta(), await boleta('1.0000', unidad)]));
    expect(respuesta.status).toBe(409);
    expect(respuesta.cuerpo.message).toContain(mensaje);
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });

  it('CA-03: no convierte litros de capacidad en kilogramos de carga', async () => {
    vehiculos[0].capacidad.unidad = 'l';
    const respuesta = await crear(dto([await boleta()]));
    expect(respuesta.status).toBe(409);
    expect(respuesta.cuerpo.message).toContain('no se convierten');
  });

  it('CA-03: una boleta sin ítems bloquea la asignación', async () => {
    const id = await boleta();
    await source.query('DELETE FROM boletas_envio_items WHERE boleta_id = $1', [id]);
    expect((await crear(dto([id]))).cuerpo.message).toContain('no tienen ítems');
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });

  it.each(['vehículo', 'chofer'])('CA-02: rechaza el %s no disponible en el ERP', async (recurso) => {
    if (recurso === 'vehículo') vehiculos[0].disponible = false; else choferes[0].disponible = false;
    const respuesta = await crear(dto([await boleta()]));
    expect(respuesta.status).toBe(409);
    expect(respuesta.cuerpo.codigo).toBe('CONFLICTO_RECURSOS');
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });

  it('CA-03: sin ERP ni respaldo responde 503 y no asigna recursos', async () => {
    erpDisponible = false;
    expect((await crear(dto([await boleta()]))).status).toBe(503);
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });

  it('CA-03: con Producción indisponible responde 503 sin persistir una carga supuesta', async () => {
    produccionDisponible = false;
    expect((await crear(dto([await boleta()]))).status).toBe(503);
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });

  it('CA-02: ante una caída del ERP conserva la copia persistida y valida los recursos de respaldo', async () => {
    expect((await crear(dto([await boleta()]))).status).toBe(201);
    erpDisponible = false;
    expect((await crear(dto([await boleta()], { vehiculoExternoId: 'V2', choferExternoId: 'C2' }))).status).toBe(201);
    expect((await source.query('SELECT count(*)::int AS cantidad FROM recursos_externos_snapshots'))[0].cantidad).toBe(1);
    expect((await crear(dto([await boleta()]))).status).toBe(409);
  });

  it('CA-04: edita una ruta planificada sin entrar en conflicto consigo misma y reemplaza sus paradas', async () => {
    const primera = await crear(dto([await boleta()]));
    expect(primera.status).toBe(201);
    const nueva = await boleta('2.1250');
    const respuesta = await consultar('PUT', `/rutas/${primera.cuerpo.id}`, dto([nueva], {
      vehiculoExternoId: 'V2', paradas: [{ destino: 'Nuevo destino', boletaIds: [nueva] }],
    }));
    expect(respuesta.status).toBe(200);
    expect(respuesta.cuerpo.vehiculoExternoId).toBe('V2');
    expect(respuesta.cuerpo.paradas).toHaveLength(1);
    expect(respuesta.cuerpo.paradas[0]).toMatchObject({ destino: 'Nuevo destino', secuencia: 1, boletas: [{ boletaId: nueva }] });
    expect(await conteos()).toEqual([{ rutas: 1, paradas: 1, documentos: 1 }]);
  });

  it('CA-04: una edición con sobrecarga conserva exactamente la ruta y sus documentos anteriores', async () => {
    const primera = await crear(dto([await boleta()]));
    const respuesta = await consultar('PUT', `/rutas/${primera.cuerpo.id}`, dto([await boleta('15.0001')]));
    expect(respuesta.status).toBe(409);
    expect((await consultar('GET', `/rutas/${primera.cuerpo.id}`)).cuerpo).toEqual(primera.cuerpo);
  });

  it('CA-04: un fallo SQL posterior a reemplazar las paradas revierte también recursos y documentos', async () => {
    const primera = await crear(dto([await boleta()]));
    expect(primera.status).toBe(201);
    await source.query("ALTER TABLE rutas_paradas ADD CONSTRAINT ck_abc373_fallo CHECK (destino <> 'FALLO_PRUEBA')");
    try {
      const nueva = await boleta();
      const respuesta = await consultar('PUT', `/rutas/${primera.cuerpo.id}`, dto([nueva], {
        vehiculoExternoId: 'V2', paradas: [{ destino: 'FALLO_PRUEBA', boletaIds: [nueva] }],
      }));
      expect(respuesta.status).toBe(500);
      expect((await consultar('GET', `/rutas/${primera.cuerpo.id}`)).cuerpo).toEqual(primera.cuerpo);
      expect(await conteos()).toEqual([{ rutas: 1, paradas: 1, documentos: 1 }]);
    } finally {
      await source.query('ALTER TABLE rutas_paradas DROP CONSTRAINT ck_abc373_fallo');
    }
  });

  it('CA-04: después del despacho no permite editar ni altera fecha, recursos o paradas', async () => {
    const primera = await crear(dto([await boleta()]));
    await source.query(`UPDATE rutas SET estado = 'DESPACHADA', despachada_en = NOW(),
      despachada_por_usuario_id = 42 WHERE id = $1`, [primera.cuerpo.id]);
    const antes = await consultar('GET', `/rutas/${primera.cuerpo.id}`);
    expect((await consultar('PUT', `/rutas/${primera.cuerpo.id}`, dto([await boleta()]))).status).toBe(409);
    expect(await consultar('GET', `/rutas/${primera.cuerpo.id}`)).toEqual(antes);
  });

  it.each(['ANULADA', 'BORRADOR'])('CA-04: excluye una boleta %s sin crear paradas huérfanas', async (estado) => {
    expect((await crear(dto([await boleta('1.0000', 'kg', estado)]))).status).toBe(409);
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });

  it('CA-04: una boleta de otra ruta activa no se duplica aunque se elijan otros recursos', async () => {
    const id = await boleta();
    expect((await crear(dto([id]))).status).toBe(201);
    expect((await crear(dto([id], { vehiculoExternoId: 'V2', choferExternoId: 'C2' }))).status).toBe(409);
    expect(await conteos()).toEqual([{ rutas: 1, paradas: 1, documentos: 1 }]);
  });

  it.each([[null, 401], ['invalido', 401], ['lector', 403]] as const)('permisos: sesión %s obtiene %s antes de consultar datos externos', async (token, status) => {
    expect((await crear(dto([await boleta()]), token)).status).toBe(status);
    expect(solicitudesExternas.every(({ path }) => path === '/me')).toBe(true);
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });

  it('permisos: un lector consulta pero no edita una ruta; una petición sin sesión tampoco la lee', async () => {
    const primera = await crear(dto([await boleta()]));
    expect(primera.status).toBe(201);
    const ruta = `/rutas/${primera.cuerpo.id}`;
    expect((await consultar('GET', ruta, undefined, null)).status).toBe(401);
    expect((await consultar('GET', ruta, undefined, 'lector')).status).toBe(200);
    expect((await consultar('PUT', ruta, dto([await boleta()]), 'lector')).status).toBe(403);
    expect((await consultar('GET', ruta)).cuerpo).toEqual(primera.cuerpo);
  });

  it('validación: rechaza responsable enviado por el cliente y documentos repetidos con 400', async () => {
    const id = await boleta();
    expect((await crear({ ...dto([id]), responsableUsuarioId: '999' })).status).toBe(400);
    expect((await crear(dto([id, id]))).status).toBe(400);
    expect(await conteos()).toEqual([{ rutas: 0, paradas: 0, documentos: 0 }]);
  });
});
