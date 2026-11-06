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
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { ReportesService } from './reportes.service';

// PostgreSQL real con las consultas reales del reporte. Se activa con
// LOGISTICA_DB_REAL=1 y usa un esquema temporal. Producción es un doble.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-340: totales del reporte contra PostgreSQL', () => {
  const schema = `reportes_test_${process.pid}_${Date.now()}`;
  const options = (): PostgresConnectionOptions => ({
    ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
    extra: { options: `-c search_path=${schema}` },
  });
  let source: DataSource;
  let creado = false;
  let service: ReportesService;

  const uno = async (sql: string, params: unknown[] = []) => (await source.query(sql, params))[0].id as string;

  beforeAll(async () => {
    source = new DataSource(options());
    await source.initialize();
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

    const solicitud = await uno(
      "INSERT INTO solicitudes_salida (orden_id, destino_documental, motivo, responsable_usuario_id) VALUES (7, 'Tienda Central', 'Prueba', 42) RETURNING id::text AS id",
    );
    const boleta = (estado: string, creadoEn: string) => uno(
      'INSERT INTO boletas_envio (solicitud_salida_id, estado, responsable_usuario_id, creado_en) VALUES ($1, $2, 42, $3) RETURNING id::text AS id',
      [solicitud, estado, creadoEn],
    );
    const b1 = await boleta('EMITIDA', '2026-11-03T12:00:00-04:00');
    const b2 = await boleta('ANULADA', '2026-11-04T12:00:00-04:00');
    const b3 = await boleta('EMITIDA', '2026-12-01T01:00:00Z'); // 30/11 21:00 en La Paz: dentro del período
    const b4 = await boleta('EMITIDA', '2026-12-01T05:00:00Z'); // 01/12 01:00 en La Paz: fuera
    for (const [id, cantidad] of [[b1, '100.5'], [b1, '200'], [b1, '300'], [b2, '50'], [b3, '10'], [b4, '99']]) {
      await source.query("INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES ($1, 'LOTE-A', $2)", [id, cantidad]);
    }

    const ruta = await uno(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, estado, responsable_usuario_id,
                          despachada_en, despachada_por_usuario_id, completada_en)
       VALUES ('2026-11-10', 'VEH-01', 'CHO-12', 'COMPLETADA', 42, NOW(), 42, NOW()) RETURNING id::text AS id`,
    );
    await uno("INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, responsable_usuario_id) VALUES ('2026-12-05', 'VEH-02', 'CHO-07', 42) RETURNING id::text AS id");
    const parada = (secuencia: number) => uno(
      `INSERT INTO rutas_paradas (ruta_id, secuencia, destino, estado_entrega, entrega_actualizada_en, entrega_usuario_id)
       VALUES ($1, $2, 'Destino', 'ENTREGADA', NOW(), 42) RETURNING id::text AS id`,
      [ruta, secuencia],
    );
    const p1 = await parada(1);
    const p2 = await parada(2);
    for (const [paradaId, boletaId] of [[p1, b1], [p1, b2], [p2, b3]]) {
      await source.query('INSERT INTO rutas_paradas_boletas (parada_id, boleta_id) VALUES ($1, $2)', [paradaId, boletaId]);
    }
    for (const tipo of ['RETRASO', 'RETRASO', 'CARGA_DANADA']) {
      await source.query("INSERT INTO incidencias_transporte (ruta_id, tipo, motivo, registrada_por_usuario_id) VALUES ($1, $2, 'x', 42)", [ruta, tipo]);
    }
    await source.query(
      "INSERT INTO rutas_reprogramaciones (ruta_id, fecha_anterior, fecha_nueva, motivo, registrada_por_usuario_id) VALUES ($1, '2026-11-08', '2026-11-10', 'x', 42)",
      [ruta],
    );

    const produccion = { consultarOrdenPorId: async () => ({ producto: { unidad_producto: 'kg' } }) };
    service = new ReportesService(source, produccion as unknown as LotesProduccionClient);
  }, 30000);

  afterAll(async () => {
    if (!source?.isInitialized) return;
    try {
      if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await source.destroy();
    }
  });

  it('los totales coinciden con la fuente: sin multiplicar por ítems ni incidencias y sin contar anuladas como entregadas', async () => {
    const reporte = await service.generar(
      { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estadoRuta: null, estadoBoleta: null }, 'Bearer prueba',
    );
    expect(reporte.rutas).toHaveLength(1);
    expect(reporte.rutas[0]).toMatchObject({
      fechaProgramada: '2026-11-10', estado: 'COMPLETADA',
      paradas: { total: 2, entregadas: 2, pendientes: 0, anuladas: 0 },
      boletas: { total: 3, emitidas: 2, anuladas: 1, entregadas: 2 },
      incidencias: 3, reprogramaciones: 1,
    });
    expect(reporte.boletas.map(({ estado, fecha, items, cantidadTotal, entregada }) => ({ estado, fecha, items, cantidadTotal, entregada }))).toEqual([
      { estado: 'EMITIDA', fecha: '2026-11-03', items: 3, cantidadTotal: '600.5000', entregada: true },
      { estado: 'ANULADA', fecha: '2026-11-04', items: 1, cantidadTotal: '50.0000', entregada: false },
      { estado: 'EMITIDA', fecha: '2026-11-30', items: 1, cantidadTotal: '10.0000', entregada: true },
    ]);
    expect(reporte.resumen.boletas).toMatchObject({ total: 3, entregadas: 2, cantidadEmitidaPorUnidad: { kg: '610.5000' } });
    expect(reporte.resumen.entregas.boletasEntregadas).toBe(2);
  });

  it('filtra por estado de ruta y de boleta, y un período sin datos devuelve ceros', async () => {
    const anuladas = await service.generar(
      { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estadoRuta: 'PLANIFICADA' as never, estadoBoleta: 'ANULADA' as never }, 'Bearer prueba',
    );
    expect(anuladas.rutas).toEqual([]);
    expect(anuladas.boletas.map((b) => b.estado)).toEqual(['ANULADA']);
    const vacio = await service.generar({ fechaDesde: '2027-01-01', fechaHasta: '2027-01-31', estadoRuta: null, estadoBoleta: null }, 'Bearer prueba');
    expect(vacio.rutas).toEqual([]);
    expect(vacio.boletas).toEqual([]);
    expect(vacio.resumen.rutas.total).toBe(0);
  });
});
