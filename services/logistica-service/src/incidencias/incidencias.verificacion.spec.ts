import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { AppDataSource } from '../database/data-source';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';
import { CrearRutas1710000000005 } from '../database/migrations/1710000000005-CrearRutas';
import { EstadosDespachoEntrega1710000000006 } from '../database/migrations/1710000000006-EstadosDespachoEntrega';
import { ObservacionesDespachoEntrega1710000000008 } from '../database/migrations/1710000000008-ObservacionesDespachoEntrega';
import { CrearIncidenciasTransporte1710000000009 } from '../database/migrations/1710000000009-CrearIncidenciasTransporte';
import { EventosOutboxLogistica1710000000011 } from '../database/migrations/1710000000011-EventosOutboxLogistica';
import { ResultadoInventarioRuta1710000000012 } from '../database/migrations/1710000000012-ResultadoInventarioRuta';
import { Ruta } from '../rutas/entities/ruta.entity';
import { ValidacionAsignacionService } from '../rutas/validaciones/validacion-asignacion.service';
import { ValidarIncidenciaPipe } from './dto/validar-incidencia.pipe';
import { IncidenciasController } from './incidencias.controller';
import { IncidenciasService } from './incidencias.service';

// ABC-383: verificación de los criterios de ABC-379 sobre PostgreSQL real con
// el servicio y el validador de recursos reales. Solo el ERP y la unidad de la
// orden (otros sistemas) se reemplazan por datos fijos. Se activa con LOGISTICA_DB_REAL=1.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describe('ABC-383: permisos y validación de entrada (sin base)', () => {
  it('consultar exige logistica.rutas.consultar y registrar logistica.rutas.gestionar', () => {
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, IncidenciasController.prototype.consultar)).toBe('logistica.rutas.consultar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, IncidenciasController.prototype.registrar)).toBe('logistica.rutas.gestionar');
  });

  it.each([
    [{ tipo: 'RETRASO', motivo: '   ' }],
    [{ tipo: 'RETRASO', motivo: '' }],
    [{ tipo: 'RETRASO' }],
    [{ tipo: 'INVENTADO', motivo: 'x' }],
    [{ tipo: 'RETRASO', motivo: 'x', nuevaFecha: '2027-02-30' }],
    [{ tipo: 'RETRASO', motivo: 'x', registradaPorUsuarioId: '1' }],
  ])('rechaza con 400 %j', (cuerpo) => {
    expect(() => new ValidarIncidenciaPipe().transform(cuerpo)).toThrow(BadRequestException);
  });
});

describeReal('ABC-383: incidencias y reprogramaciones contra PostgreSQL', () => {
  const schema = `abc383_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let service: IncidenciasService;
  let creado = false;
  let erp: { vehiculos: any[]; choferes: any[] };

  const recurso = (idExterno: string, disponible = true) => ({ idExterno, disponible });
  const vehiculo = (idExterno: string, disponible = true) => ({
    ...recurso(idExterno, disponible), placa: idExterno, descripcion: null, capacidad: { valor: '1000', unidad: 'kg' },
  });
  const chofer = (idExterno: string, disponible = true) => ({
    ...recurso(idExterno, disponible), nombre: idExterno, licenciaCategoria: null,
  });

  async function conectar() {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
      extra: { options: `-c search_path=${schema}` },
    });
    await source.initialize();
    const recursos = {
      consultar: async ({ fecha }: { fecha: string }) => ({
        fecha, origen: 'ERP', generadoEn: '', sincronizadoEn: '', aviso: null,
        filtros: { disponible: null, capacidadMinima: null },
        totales: { vehiculos: erp.vehiculos.length, choferes: erp.choferes.length },
        vehiculos: erp.vehiculos, choferes: erp.choferes,
      }),
    };
    const produccion = { consultarOrdenPorId: async () => ({ producto: { unidad_producto: 'kg' } }) };
    service = new IncidenciasService(source, new ValidacionAsignacionService(recursos as any, produccion as any));
  }

  beforeAll(async () => {
    await conectar();
    await source.query(`CREATE SCHEMA "${schema}"`);
    creado = true;
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      for (const migracion of [
        new CrearSolicitudesSalida1710000000001(), new CrearBoletasEnvio1710000000002(),
        new ReglaConcurrenciaDocumental1710000000003(), new HistorialBoletasEnvio1710000000004(),
        new CrearRutas1710000000005(), new EstadosDespachoEntrega1710000000006(),
        new ObservacionesDespachoEntrega1710000000008(), new CrearIncidenciasTransporte1710000000009(),
        new EventosOutboxLogistica1710000000011(), new ResultadoInventarioRuta1710000000012(),
      ]) {
        await migracion.up(runner);
      }
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }, 30000);

  beforeEach(() => {
    erp = {
      vehiculos: ['VEH-01', 'VEH-02', 'VEH-03', 'VEH-04', 'VEH-05'].map((id) => vehiculo(id)),
      choferes: ['CHO-01', 'CHO-02', 'CHO-03', 'CHO-04', 'CHO-05'].map((id) => chofer(id)),
    };
  });

  afterAll(async () => {
    if (!source?.isInitialized) return;
    try {
      if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await source.destroy();
    }
  });

  let numero = 0;
  async function crearRuta(fecha: string, vehiculoId: string, choferId: string, estado = 'PLANIFICADA') {
    const [solicitud] = await source.query(
      `INSERT INTO solicitudes_salida (orden_id, destino_documental, motivo, responsable_usuario_id)
       VALUES (2, 'Tienda', 'Envío', 4) RETURNING id::text AS id`);
    const [boleta] = await source.query(
      `INSERT INTO boletas_envio (solicitud_salida_id, numero, estado, responsable_usuario_id)
       VALUES ($1, $2, 'EMITIDA', 4) RETURNING id::text AS id`, [solicitud.id, `BOL-383-${++numero}`]);
    await source.query("INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES ($1, 'LOT-A', 100)", [boleta.id]);
    const despachada = estado === 'DESPACHADA' || estado === 'COMPLETADA';
    const [ruta] = await source.query(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, responsable_usuario_id, estado,
                          despachada_en, despachada_por_usuario_id, completada_en)
       VALUES ($1, $2, $3, 4, $4, $5, $6, $7) RETURNING id::text AS id`,
      [fecha, vehiculoId, choferId, estado, despachada ? new Date() : null, despachada ? 4 : null,
        estado === 'COMPLETADA' ? new Date() : null]);
    const paradas = await source.query(
      `INSERT INTO rutas_paradas (ruta_id, secuencia, destino)
       VALUES ($1, 1, 'Tienda Central'), ($1, 2, 'Sucursal Norte') RETURNING id::text AS id`, [ruta.id]);
    await source.query('INSERT INTO rutas_paradas_boletas (parada_id, boleta_id) VALUES ($1, $2)', [paradas[0].id, boleta.id]);
    return { id: ruta.id as string, paradaIds: paradas.map((p: { id: string }) => p.id) as string[] };
  }

  async function estado(rutaId: string) {
    const [ruta] = await source.query('SELECT fecha_programada::text AS fecha FROM rutas WHERE id = $1', [rutaId]);
    const [{ incidencias }] = await source.query('SELECT COUNT(*)::int AS incidencias FROM incidencias_transporte WHERE ruta_id = $1', [rutaId]);
    const [{ reprogramaciones }] = await source.query('SELECT COUNT(*)::int AS reprogramaciones FROM rutas_reprogramaciones WHERE ruta_id = $1', [rutaId]);
    return { fecha: ruta.fecha as string, incidencias, reprogramaciones };
  }

  const incidencia = (cambios: Record<string, unknown> = {}) =>
    new ValidarIncidenciaPipe().transform({ tipo: 'AVERIA_VEHICULO', motivo: 'Falla de frenos', ...cambios });

  it('CA-01/CA-02: registra la incidencia y reprograma conservando el historial y la fecha original', async () => {
    const r = await crearRuta('2027-03-10', 'VEH-01', 'CHO-01');
    const primera = await service.registrar(r.id, incidencia({ nuevaFecha: '2027-03-12' }), '4', 'Bearer t');
    expect(primera).toMatchObject({ fechaOriginal: '2027-03-10', fechaProgramada: '2027-03-12' });
    const segunda = await service.registrar(r.id, incidencia({ tipo: 'CLIENTE_AUSENTE', motivo: 'Local cerrado',
      paradaId: r.paradaIds[1], nuevaFecha: '2027-03-15' }), '5', 'Bearer t');
    expect(segunda.fechaOriginal).toBe('2027-03-10');
    expect(segunda.reprogramaciones.map((x: any) => [x.fechaAnterior, x.fechaNueva, x.registradaPorUsuarioId])).toEqual([
      ['2027-03-10', '2027-03-12', '4'], ['2027-03-12', '2027-03-15', '5'],
    ]);
    expect(segunda.reprogramaciones.every((x: any, i: number) => x.incidenciaId === segunda.incidencias[i].id)).toBe(true);
    expect(await estado(r.id)).toEqual({ fecha: '2027-03-15', incidencias: 2, reprogramaciones: 2 });
  });

  it('una incidencia sin fecha no reprograma', async () => {
    const r = await crearRuta('2027-03-11', 'VEH-02', 'CHO-02');
    await service.registrar(r.id, incidencia({ tipo: 'RETRASO', motivo: 'Tráfico' }), '4', 'Bearer t');
    expect(await estado(r.id)).toEqual({ fecha: '2027-03-11', incidencias: 1, reprogramaciones: 0 });
  });

  it.each([
    ['fecha pasada', '2026-01-01'],
    ['fecha igual a la programada', '2027-03-20'],
  ])('rechaza %s con 409 sin cambios parciales', async (_caso, fecha) => {
    const r = await crearRuta('2027-03-20', 'VEH-03', 'CHO-03');
    await expect(service.registrar(r.id, incidencia({ nuevaFecha: fecha }), '4', 'Bearer t')).rejects.toBeInstanceOf(ConflictException);
    expect(await estado(r.id)).toEqual({ fecha: '2027-03-20', incidencias: 0, reprogramaciones: 0 });
  });

  it.each(['ENTREGADA', 'ANULADA'])('CA-03: rechaza una entrega %s', async (estadoEntrega) => {
    const r = await crearRuta('2027-03-21', 'VEH-03', 'CHO-03', 'DESPACHADA');
    await source.query(
      `UPDATE rutas_paradas SET estado_entrega = $2, entrega_actualizada_en = NOW(), entrega_usuario_id = 4 WHERE id = $1`,
      [r.paradaIds[0], estadoEntrega]);
    await expect(service.registrar(r.id, incidencia({ paradaId: r.paradaIds[0], nuevaFecha: '2027-03-25' }), '4', 'Bearer t'))
      .rejects.toThrow('ya está resuelta');
    expect(await estado(r.id)).toEqual({ fecha: '2027-03-21', incidencias: 0, reprogramaciones: 0 });
  });

  it.each(['COMPLETADA', 'CANCELADA'])('rechaza incidencias en una ruta %s', async (estadoRuta) => {
    const r = await crearRuta('2027-03-22', 'VEH-04', 'CHO-04', estadoRuta);
    await expect(service.registrar(r.id, incidencia(), '4', 'Bearer t')).rejects.toBeInstanceOf(ConflictException);
    expect((await estado(r.id)).incidencias).toBe(0);
  });

  it('CA-04: rechaza la reprogramación si el vehículo ya tiene otra ruta ese día, sin cambios parciales', async () => {
    const ocupada = await crearRuta('2027-04-01', 'VEH-05', 'CHO-05');
    const r = await crearRuta('2027-03-30', 'VEH-05', 'CHO-04');
    const fallo = await service.registrar(r.id, incidencia({ nuevaFecha: '2027-04-01' }), '4', 'Bearer t').catch((e) => e);
    expect(fallo).toBeInstanceOf(ConflictException);
    expect(fallo.getResponse()).toMatchObject({
      codigo: 'CONFLICTO_RECURSOS',
      conflictos: [{ recurso: 'VEHICULO', idExterno: 'VEH-05', motivo: `ruta ${ocupada.id}` }],
    });
    expect(await estado(r.id)).toEqual({ fecha: '2027-03-30', incidencias: 0, reprogramaciones: 0 });
  });

  it('CA-04: rechaza si el ERP informa el chofer no disponible en la nueva fecha', async () => {
    const r = await crearRuta('2027-05-01', 'VEH-01', 'CHO-02');
    erp.choferes = erp.choferes.map((c) => (c.idExterno === 'CHO-02' ? chofer('CHO-02', false) : c));
    await expect(service.registrar(r.id, incidencia({ nuevaFecha: '2027-05-03' }), '4', 'Bearer t'))
      .rejects.toThrow('no está disponible');
    expect(await estado(r.id)).toEqual({ fecha: '2027-05-01', incidencias: 0, reprogramaciones: 0 });
  });

  it('aislamiento: una parada de otra ruta da 404 y el historial no mezcla rutas', async () => {
    const a = await crearRuta('2027-06-01', 'VEH-01', 'CHO-01');
    const b = await crearRuta('2027-06-01', 'VEH-02', 'CHO-02');
    await expect(service.registrar(a.id, incidencia({ paradaId: b.paradaIds[0] }), '4', 'Bearer t'))
      .rejects.toBeInstanceOf(NotFoundException);
    await service.registrar(b.id, incidencia({ motivo: 'Solo de B' }), '4', 'Bearer t');
    const historialA = await service.consultar(a.id);
    expect(historialA.incidencias).toEqual([]);
    expect((await service.consultar(b.id)).incidencias.map((i: any) => i.motivo)).toEqual(['Solo de B']);
    await expect(service.consultar('999999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rollback: si falla la actualización de la ruta no quedan ni incidencia ni reprogramación', async () => {
    const r = await crearRuta('2027-07-01', 'VEH-03', 'CHO-03');
    const original = EntityManager.prototype.update;
    const espia = jest.spyOn(EntityManager.prototype, 'update').mockImplementation(function (this: EntityManager, entidad: any, ...resto: any[]) {
      if (entidad === Ruta) throw new Error('fallo simulado al actualizar la ruta');
      return (original as any).call(this, entidad, ...resto);
    });
    try {
      await expect(service.registrar(r.id, incidencia({ nuevaFecha: '2027-07-05' }), '4', 'Bearer t'))
        .rejects.toThrow('fallo simulado');
    } finally {
      espia.mockRestore();
    }
    expect(await estado(r.id)).toEqual({ fecha: '2027-07-01', incidencias: 0, reprogramaciones: 0 });
  });

  it('concurrencia: dos rutas con el mismo vehículo reprogramadas al mismo día a la vez, solo una gana', async () => {
    const a = await crearRuta('2027-08-01', 'VEH-04', 'CHO-01');
    const b = await crearRuta('2027-08-02', 'VEH-04', 'CHO-02');
    const resultados = await Promise.allSettled([
      service.registrar(a.id, incidencia({ nuevaFecha: '2027-08-10' }), '4', 'Bearer t'),
      service.registrar(b.id, incidencia({ nuevaFecha: '2027-08-10' }), '4', 'Bearer t'),
    ]);
    expect(resultados.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    const [{ total }] = await source.query(
      "SELECT COUNT(*)::int AS total FROM rutas WHERE vehiculo_externo_id = 'VEH-04' AND fecha_programada = '2027-08-10'");
    expect(total).toBe(1);
  });

  it('persistencia: el historial se conserva tras reiniciar la conexión', async () => {
    const r = await crearRuta('2027-09-01', 'VEH-05', 'CHO-05');
    await service.registrar(r.id, incidencia({ nuevaFecha: '2027-09-03' }), '4', 'Bearer t');
    await source.destroy();
    await conectar();
    const historial = await service.consultar(r.id);
    expect(historial).toMatchObject({ fechaOriginal: '2027-09-01', fechaProgramada: '2027-09-03' });
    expect(historial.incidencias).toHaveLength(1);
    expect(historial.reprogramaciones).toHaveLength(1);
  });
});
