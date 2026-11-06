import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../database/migrations/1710000000004-HistorialBoletasEnvio';
import { CrearRutas1710000000005 } from '../database/migrations/1710000000005-CrearRutas';
import { EstadosDespachoEntrega1710000000006 } from '../database/migrations/1710000000006-EstadosDespachoEntrega';
import { ObservacionesDespachoEntrega1710000000008 } from '../database/migrations/1710000000008-ObservacionesDespachoEntrega';
import { CrearIncidenciasTransporte1710000000009 } from '../database/migrations/1710000000009-CrearIncidenciasTransporte';
import { IncidenciaTransporte } from './entities/incidencia-transporte.entity';
import { ReprogramacionRuta } from './entities/reprogramacion-ruta.entity';
import { TipoIncidencia } from './entities/tipo-incidencia.enum';

// PostgreSQL real (PostgreSQL 15+, como Docker). Se activa con LOGISTICA_DB_REAL=1
// y usa un esquema temporal que se borra al final.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-380: incidencias y reprogramaciones en PostgreSQL', () => {
  const schema = `incidencias_test_${process.pid}_${Date.now()}`;
  const options = (): PostgresConnectionOptions => ({
    ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
    extra: { options: `-c search_path=${schema}` },
  });
  let source: DataSource;
  let creado = false;

  async function conectar() {
    source = new DataSource(options());
    await source.initialize();
  }

  async function enEsquema(trabajo: (runner: ReturnType<DataSource['createQueryRunner']>) => Promise<void>) {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await trabajo(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async function codigo(promesa: Promise<unknown>): Promise<string> {
    try {
      await promesa;
    } catch (error) {
      const fallo = error as { code?: string; driverError?: { code?: string } };
      return fallo.driverError?.code ?? fallo.code ?? 'SIN_CODIGO';
    }
    return 'SIN_ERROR';
  }

  async function crearRuta(fecha = '2026-11-10') {
    const [ruta] = await source.query(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, responsable_usuario_id)
       VALUES ($1, 'VEH-01', 'CHO-12', 42) RETURNING id::text AS id`,
      [fecha],
    );
    const paradas = await source.query(
      `INSERT INTO rutas_paradas (ruta_id, secuencia, destino)
       VALUES ($1, 1, 'Tienda Central'), ($1, 2, 'Sucursal Norte') RETURNING id::text AS id`,
      [ruta.id],
    );
    return { rutaId: ruta.id as string, paradaIds: paradas.map((parada: { id: string }) => parada.id) as string[] };
  }

  const incidencias = () => source.getRepository(IncidenciaTransporte);
  const reprogramaciones = () => source.getRepository(ReprogramacionRuta);

  beforeAll(async () => {
    await conectar();
    await source.query(`CREATE SCHEMA "${schema}"`);
    creado = true;
    await enEsquema(async (runner) => {
      for (const migracion of [
        new CrearSolicitudesSalida1710000000001(), new CrearBoletasEnvio1710000000002(),
        new ReglaConcurrenciaDocumental1710000000003(), new HistorialBoletasEnvio1710000000004(),
        new CrearRutas1710000000005(), new EstadosDespachoEntrega1710000000006(),
        new ObservacionesDespachoEntrega1710000000008(), new CrearIncidenciasTransporte1710000000009(),
      ]) {
        await migracion.up(runner);
      }
    });
  }, 30000);

  afterAll(async () => {
    if (!source?.isInitialized) return;
    try {
      if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await source.destroy();
    }
  });

  it('tras reiniciar conserva las incidencias y el historial completo de reprogramaciones', async () => {
    const { rutaId, paradaIds } = await crearRuta();
    const averia = await incidencias().save({
      rutaId, paradaId: null, tipo: TipoIncidencia.AVERIA_VEHICULO, motivo: 'Falla de frenos', registradaPorUsuarioId: '42',
    });
    await incidencias().save({
      rutaId, paradaId: paradaIds[1], tipo: TipoIncidencia.CLIENTE_AUSENTE, motivo: 'Local cerrado', registradaPorUsuarioId: '43',
    });
    await reprogramaciones().save({
      rutaId, incidenciaId: averia.id, fechaAnterior: '2026-11-10', fechaNueva: '2026-11-12', motivo: 'Vehículo en taller', registradaPorUsuarioId: '42',
    });
    await reprogramaciones().save({
      rutaId, incidenciaId: null, fechaAnterior: '2026-11-12', fechaNueva: '2026-11-15', motivo: 'Cliente pidió otro día', registradaPorUsuarioId: '42',
    });
    await source.query('UPDATE rutas SET fecha_programada = $2 WHERE id = $1', [rutaId, '2026-11-15']);

    // Reinicio: se cierra el pool y se vuelve a conectar.
    await source.destroy();
    await conectar();

    const guardadas = await incidencias().find({ where: { rutaId }, order: { id: 'ASC' } });
    expect(guardadas.map(({ tipo, motivo, paradaId, registradaPorUsuarioId }) => ({ tipo, motivo, paradaId, registradaPorUsuarioId }))).toEqual([
      { tipo: 'AVERIA_VEHICULO', motivo: 'Falla de frenos', paradaId: null, registradaPorUsuarioId: '42' },
      { tipo: 'CLIENTE_AUSENTE', motivo: 'Local cerrado', paradaId: paradaIds[1], registradaPorUsuarioId: '43' },
    ]);
    expect(guardadas.every((incidencia) => incidencia.registradaEn instanceof Date)).toBe(true);

    const historial = await reprogramaciones().find({ where: { rutaId }, order: { id: 'ASC' } });
    expect(historial.map(({ fechaAnterior, fechaNueva, incidenciaId }) => ({ fechaAnterior, fechaNueva, incidenciaId }))).toEqual([
      { fechaAnterior: '2026-11-10', fechaNueva: '2026-11-12', incidenciaId: averia.id },
      { fechaAnterior: '2026-11-12', fechaNueva: '2026-11-15', incidenciaId: null },
    ]);
    const [ruta] = await source.query('SELECT fecha_programada::text AS fecha FROM rutas WHERE id = $1', [rutaId]);
    expect(ruta.fecha).toBe(historial[historial.length - 1].fechaNueva);
  });

  it('rechaza parada o incidencia de otra ruta, datos vacíos, tipos desconocidos y fechas iguales', async () => {
    const a = await crearRuta();
    const b = await crearRuta('2026-11-11');
    const base = { rutaId: a.rutaId, tipo: 'RETRASO', motivo: 'Tráfico', registrada_por_usuario_id: 42 };
    const insertarIncidencia = (cambios: Record<string, unknown>) => {
      const fila = { ...base, ...cambios } as Record<string, unknown>;
      return source.query(
        'INSERT INTO incidencias_transporte (ruta_id, parada_id, tipo, motivo, registrada_por_usuario_id) VALUES ($1, $2, $3, $4, $5)',
        [fila.rutaId, fila.paradaId ?? null, fila.tipo, fila.motivo, fila.registrada_por_usuario_id],
      );
    };
    expect(await codigo(insertarIncidencia({ paradaId: b.paradaIds[0] }))).toBe('23503');
    expect(await codigo(insertarIncidencia({ motivo: '   ' }))).toBe('23514');
    expect(await codigo(insertarIncidencia({ tipo: 'INVENTADO' }))).toBe('23514');
    expect(await codigo(insertarIncidencia({ registrada_por_usuario_id: 0 }))).toBe('23514');

    const [deB] = await source.query(
      "INSERT INTO incidencias_transporte (ruta_id, tipo, motivo, registrada_por_usuario_id) VALUES ($1, 'OTRO', 'x', 1) RETURNING id::text AS id",
      [b.rutaId],
    );
    const insertarReprogramacion = (incidenciaId: string | null, anterior: string, nueva: string) => source.query(
      'INSERT INTO rutas_reprogramaciones (ruta_id, incidencia_id, fecha_anterior, fecha_nueva, motivo, registrada_por_usuario_id) VALUES ($1, $2, $3, $4, $5, 42)',
      [a.rutaId, incidenciaId, anterior, nueva, 'Cambio'],
    );
    expect(await codigo(insertarReprogramacion(deB.id, '2026-11-10', '2026-11-12'))).toBe('23503');
    expect(await codigo(insertarReprogramacion(null, '2026-11-10', '2026-11-10'))).toBe('23514');
  });

  it('no permite borrar una ruta con historial y conserva la incidencia si se reemplazan sus paradas', async () => {
    const { rutaId, paradaIds } = await crearRuta();
    const incidencia = await incidencias().save({
      rutaId, paradaId: paradaIds[0], tipo: TipoIncidencia.DIRECCION_INCORRECTA, motivo: 'Calle cambiada', registradaPorUsuarioId: '42',
    });
    expect(await codigo(source.query('DELETE FROM rutas WHERE id = $1', [rutaId]))).toBe('23503');

    // Igual que PUT /rutas/:id (ABC-370) sobre una ruta PLANIFICADA.
    await source.query('DELETE FROM rutas_paradas WHERE ruta_id = $1', [rutaId]);
    const conservada = await incidencias().findOneByOrFail({ id: incidencia.id });
    expect(conservada).toMatchObject({ rutaId, paradaId: null, motivo: 'Calle cambiada' });
  });

  it('la migración se revierte y se vuelve a aplicar', async () => {
    const migracion = new CrearIncidenciasTransporte1710000000009();
    await enEsquema(async (runner) => {
      await runner.query('TRUNCATE rutas_reprogramaciones, incidencias_transporte');
      await migracion.down(runner);
      const [tabla] = await runner.query("SELECT to_regclass('incidencias_transporte') AS existe");
      expect(tabla.existe).toBeNull();
      await migracion.up(runner);
    });
    const [tabla] = await source.query("SELECT to_regclass('incidencias_transporte')::text AS existe");
    expect(tabla.existe).toBe('incidencias_transporte');
  });
});
