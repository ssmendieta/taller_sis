import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
import { HistorialController } from './historial.controller';
import { HistorialService, resumirLotes } from './historial.service';

describe('ABC-393: detalle de ruta (unitario)', () => {
  it('el controlador expone el detalle con permiso de consulta de rutas', () => {
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, HistorialController.prototype.detalleRuta)).toBe('logistica.rutas.consultar');
  });

  it('un id inválido responde 404 sin consultar la base', async () => {
    const transaction = jest.fn();
    const service = new HistorialService({ transaction } as any);
    await expect(service.detalleRuta('abc')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detalleRuta('0')).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('todas las consultas filtran por la ruta pedida y se leen en una sola instantánea', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('FROM rutas ruta') ? [{
      id: '9', fecha_programada: '2026-11-12', estado: 'PLANIFICADA', vehiculo_externo_id: 'V', chofer_externo_id: 'C',
      despachada_en: null, completada_en: null, fecha_original: '2026-11-10',
    }] : []));
    const transaction = jest.fn(async (_nivel: string, trabajo: any) => trabajo({ query }));
    await new HistorialService({ transaction } as any).detalleRuta('9');
    expect(transaction.mock.calls[0][0]).toBe('REPEATABLE READ');
    expect(query).toHaveBeenCalledTimes(5);
    for (const [sql, params] of query.mock.calls as unknown as Array<[string, unknown[]]>) {
      expect(sql).toMatch(/ruta_id = \$1|ruta\.id = \$1/);
      expect(params).toEqual(['9']);
    }
  });

  it('suma lotes solo de boletas no anuladas, sin perder decimales', () => {
    expect(resumirLotes([
      { id: '1', numero: 'BOL-1', estado: 'EMITIDA' as any, ordenId: '2', items: [{ referencia: 'LOT-B', cantidad: '6.2500' }] },
      { id: '2', numero: 'BOL-2', estado: 'ANULADA' as any, ordenId: '2', items: [{ referencia: 'LOT-B', cantidad: '3.0000' }] },
      { id: '3', numero: 'BOL-3', estado: 'EMITIDA' as any, ordenId: '2', items: [
        { referencia: 'LOT-B', cantidad: '0.7500' }, { referencia: 'LOT-A', cantidad: '9999999999.9999' },
      ] },
    ])).toEqual([
      { referencia: 'LOT-A', cantidadVigente: '9999999999.9999', boletas: ['BOL-3'] },
      { referencia: 'LOT-B', cantidadVigente: '7.0000', boletas: ['BOL-1', 'BOL-2', 'BOL-3'] },
    ]);
  });
});

// PostgreSQL real (como Docker). Se activa con LOGISTICA_DB_REAL=1 y usa un esquema temporal.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-393: detalle de ruta en PostgreSQL', () => {
  const schema = `historial393_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let service: HistorialService;
  let creado = false;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
      extra: { options: `-c search_path=${schema}` },
    });
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
    service = new HistorialService(source);
  }, 30000);

  afterAll(async () => {
    if (!source?.isInitialized) return;
    try {
      if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await source.destroy();
    }
  });

  let secuenciaBoleta = 0;
  async function boleta(ordenId: string, estado: string, items: Array<[string, string]>) {
    const [solicitud] = await source.query(
      `INSERT INTO solicitudes_salida (orden_id, destino_documental, motivo, responsable_usuario_id)
       VALUES ($1, 'Tienda', 'Envío', 4) RETURNING id::text AS id`, [ordenId]);
    const [creada] = await source.query(
      `INSERT INTO boletas_envio (solicitud_salida_id, numero, estado, responsable_usuario_id)
       VALUES ($1, $2, $3, 4) RETURNING id::text AS id`, [solicitud.id, `BOL-T-${++secuenciaBoleta}`, estado]);
    for (const [referencia, cantidad] of items) {
      await source.query('INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES ($1, $2, $3)',
        [creada.id, referencia, cantidad]);
    }
    return creada.id as string;
  }

  async function ruta(fecha: string, paradas: Array<{ destino: string; boletas: string[] }>) {
    const [creada] = await source.query(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, responsable_usuario_id)
       VALUES ($1, 'VEH-01', 'CHO-07', 4) RETURNING id::text AS id`, [fecha]);
    const paradaIds: string[] = [];
    for (const [indice, parada] of paradas.entries()) {
      const [p] = await source.query(
        'INSERT INTO rutas_paradas (ruta_id, secuencia, destino) VALUES ($1, $2, $3) RETURNING id::text AS id',
        [creada.id, indice + 1, parada.destino]);
      paradaIds.push(p.id);
      for (const boletaId of parada.boletas) {
        await source.query('INSERT INTO rutas_paradas_boletas (parada_id, boleta_id) VALUES ($1, $2)', [p.id, boletaId]);
      }
    }
    return { id: creada.id as string, paradaIds };
  }

  it('incluye exclusivamente boletas, lotes, entregas e incidencias de la ruta pedida', async () => {
    const b1 = await boleta('2', 'EMITIDA', [['LOT-GAL-001', '6'], ['LOT-GAL-002', '2.5']]);
    const b2 = await boleta('2', 'ANULADA', [['LOT-GAL-001', '3']]);
    const b3 = await boleta('7', 'EMITIDA', [['LOT-OTRA', '9']]);
    const a = await ruta('2026-11-10', [{ destino: 'Tienda Central', boletas: [b1] }, { destino: 'Sucursal', boletas: [b2] }]);
    const b = await ruta('2026-11-10', [{ destino: 'Otra ciudad', boletas: [b3] }]);
    await source.query(
      `UPDATE rutas_paradas SET estado_entrega = 'ENTREGADA', entrega_actualizada_en = NOW(), entrega_usuario_id = 4
        WHERE id = $1`, [a.paradaIds[0]]);
    await source.query(
      `INSERT INTO incidencias_transporte (ruta_id, parada_id, tipo, motivo, registrada_por_usuario_id)
       VALUES ($1, $2, 'CLIENTE_AUSENTE', 'Local cerrado', 4), ($3, NULL, 'RETRASO', 'De la otra ruta', 4)`,
      [a.id, a.paradaIds[1], b.id]);

    const detalle = await service.detalleRuta(a.id);

    expect(detalle.ruta).toMatchObject({ id: a.id, fechaProgramada: '2026-11-10', fechaOriginal: '2026-11-10', estado: 'PLANIFICADA' });
    expect(detalle.paradas.map((p) => [p.secuencia, p.destino, p.estadoEntrega])).toEqual([
      [1, 'Tienda Central', 'ENTREGADA'], [2, 'Sucursal', 'PENDIENTE'],
    ]);
    expect(detalle.paradas[0].boletas).toEqual([{
      id: b1, numero: expect.stringMatching(/^BOL-T-/), estado: 'EMITIDA', ordenId: '2',
      items: [{ referencia: 'LOT-GAL-001', cantidad: '6.0000' }, { referencia: 'LOT-GAL-002', cantidad: '2.5000' }],
    }]);
    expect(detalle.paradas[1].boletas[0]).toMatchObject({ id: b2, estado: 'ANULADA' });
    expect(detalle.lotes).toEqual([
      { referencia: 'LOT-GAL-001', cantidadVigente: '6.0000', boletas: expect.arrayContaining([expect.any(String)]) },
      { referencia: 'LOT-GAL-002', cantidadVigente: '2.5000', boletas: [expect.any(String)] },
    ]);
    expect(detalle.incidencias.map((i) => i.motivo)).toEqual(['Local cerrado']);
    const texto = JSON.stringify(detalle);
    expect(texto).not.toContain('LOT-OTRA');
    expect(texto).not.toContain('De la otra ruta');
    expect(texto).not.toContain('Otra ciudad');
  });

  it('muestra la fecha original y las fechas antes y después de reprogramar', async () => {
    const r = await ruta('2026-11-10', [{ destino: 'Tienda', boletas: [] }]);
    const [incidencia] = await source.query(
      `INSERT INTO incidencias_transporte (ruta_id, tipo, motivo, registrada_por_usuario_id)
       VALUES ($1, 'AVERIA_VEHICULO', 'Falla de frenos', 4) RETURNING id::text AS id`, [r.id]);
    await source.query(
      `INSERT INTO rutas_reprogramaciones (ruta_id, incidencia_id, fecha_anterior, fecha_nueva, motivo, registrada_por_usuario_id)
       VALUES ($1, $2, '2026-11-10', '2026-11-12', 'Vehículo en taller', 4)`, [r.id, incidencia.id]);
    await source.query("UPDATE rutas SET fecha_programada = '2026-11-12' WHERE id = $1", [r.id]);

    const detalle = await service.detalleRuta(r.id);
    expect(detalle.ruta).toMatchObject({ fechaOriginal: '2026-11-10', fechaProgramada: '2026-11-12' });
    expect(detalle.reprogramaciones).toEqual([expect.objectContaining({
      incidenciaId: incidencia.id, fechaAnterior: '2026-11-10', fechaNueva: '2026-11-12', motivo: 'Vehículo en taller',
    })]);
  });

  it('una ruta inexistente devuelve un error controlado', async () => {
    await expect(service.detalleRuta('999999')).rejects.toBeInstanceOf(NotFoundException);
  });
});
