import { BadGatewayException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { ReporteLogisticoQuery } from './dto/reporte-logistico.dto';
import { ReportesService } from './reportes.service';

// PRUEBA SIMULADA: la base es un manager en memoria que responde a cada consulta
// del servicio y Producción es un doble. Se verifican filtros, parámetros,
// transacción y unidades; el armado de totales tiene su propia prueba.
const FILTROS: ReporteLogisticoQuery = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estadoRuta: null, estadoBoleta: null };

describe('ABC-340: ReportesService', () => {
  let consultas: Array<{ sql: string; params: unknown[] }>;
  let filas: Record<string, unknown[]>;
  let produccion: { consultarOrdenPorId: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: ReportesService;

  const clave = (sql: string) => Object.keys(filas).find((texto) => sql.includes(texto));

  beforeEach(() => {
    consultas = [];
    filas = {
      'FROM rutas\n': [{ id: '1', fecha_programada: '2026-11-10', estado: 'DESPACHADA', vehiculo_externo_id: 'VEH-01', chofer_externo_id: 'CHO-12' }],
      'FROM rutas_paradas WHERE ruta_id': [{ id: '10', ruta_id: '1', estado_entrega: 'ENTREGADA' }],
      'FROM rutas_paradas_boletas documento\n         INNER JOIN rutas_paradas parada ON parada.id = documento.parada_id\n         INNER JOIN boletas_envio': [
        { parada_id: '10', boleta_id: '5', estado: 'EMITIDA' },
      ],
      'FROM incidencias_transporte': [{ ruta_id: '1', tipo: 'RETRASO', total: 2 }],
      'FROM rutas_reprogramaciones': [{ ruta_id: '1', total: 1 }],
      'FROM boletas_envio boleta': [
        { id: '5', numero: 'BOL-2026-00005', fecha: '2026-11-04', estado: 'EMITIDA', orden_id: '7' },
        { id: '6', numero: 'BOL-2026-00006', fecha: '2026-11-05', estado: 'EMITIDA', orden_id: '8' },
      ],
      'FROM boletas_envio_items': [{ boleta_id: '5', items: 2, cantidad: '30.0000' }, { boleta_id: '6', items: 1, cantidad: '4.0000' }],
      'INNER JOIN rutas ruta ON ruta.id = parada.ruta_id': [
        { boleta_id: '5', ruta_id: '1', estado_ruta: 'DESPACHADA', estado_entrega: 'ENTREGADA' },
      ],
    };
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        consultas.push({ sql, params });
        const encontrada = clave(sql);
        if (!encontrada) throw new Error(`Consulta inesperada: ${sql}`);
        return filas[encontrada];
      }),
    };
    dataSource = { transaction: jest.fn(async (_nivel: string, trabajo: (m: unknown) => unknown) => trabajo(manager)) };
    produccion = {
      consultarOrdenPorId: jest.fn(async (id: string) => ({ id, codigo: `ORD-${id}`, producto: { unidad_producto: id === '7' ? 'kg' : 'caja' } })),
    };
    service = new ReportesService(dataSource as unknown as DataSource, produccion as unknown as LotesProduccionClient);
  });

  it('lee todo en una transacción REPEATABLE READ y aplica período y estados', async () => {
    await service.generar({ ...FILTROS, estadoRuta: 'DESPACHADA' as never, estadoBoleta: 'EMITIDA' as never }, 'Bearer s');
    expect(dataSource.transaction).toHaveBeenCalledWith('REPEATABLE READ', expect.any(Function));
    const rutas = consultas.find((c) => c.sql.includes('FROM rutas\n'))!;
    expect(rutas.sql).toContain('WHERE fecha_programada BETWEEN $1::date AND $2::date');
    expect(rutas.params).toEqual(['2026-11-01', '2026-11-30', 'DESPACHADA']);
    const boletas = consultas.find((c) => c.sql.includes('FROM boletas_envio boleta'))!;
    expect(boletas.sql).toContain("(boleta.creado_en AT TIME ZONE 'America/La_Paz')::date BETWEEN $1::date AND $2::date");
    expect(boletas.params).toEqual(['2026-11-01', '2026-11-30', 'EMITIDA']);
  });

  it('las consultas de detalle usan los ids de las rutas y boletas del período', async () => {
    await service.generar(FILTROS, 'Bearer s');
    for (const texto of ['FROM rutas_paradas WHERE ruta_id', 'FROM incidencias_transporte', 'FROM rutas_reprogramaciones']) {
      expect(consultas.find((c) => c.sql.includes(texto))!.params).toEqual([['1']]);
    }
    expect(consultas.find((c) => c.sql.includes('FROM boletas_envio_items'))!.params).toEqual([['5', '6']]);
    // Los ítems se agrupan por boleta en SQL: nunca se unen con paradas o incidencias.
    expect(consultas.find((c) => c.sql.includes('FROM boletas_envio_items'))!.sql).toContain('GROUP BY boleta_id');
  });

  it('arma el reporte con unidades de Producción usando la sesión', async () => {
    const reporte = await service.generar(FILTROS, 'Bearer s');
    expect(produccion.consultarOrdenPorId.mock.calls).toEqual([['7', 'Bearer s'], ['8', 'Bearer s']]);
    expect(reporte.rutas[0]).toMatchObject({ id: '1', boletas: { total: 1, entregadas: 1 }, incidencias: 2, reprogramaciones: 1 });
    expect(reporte.boletas.map(({ id, unidad, cantidadTotal, entregada }) => ({ id, unidad, cantidadTotal, entregada }))).toEqual([
      { id: '5', unidad: 'kg', cantidadTotal: '30.0000', entregada: true },
      { id: '6', unidad: 'caja', cantidadTotal: '4.0000', entregada: false },
    ]);
    expect(reporte.resumen.boletas.cantidadEmitidaPorUnidad).toEqual({ caja: '4.0000', kg: '30.0000' });
    expect(reporte.avisos).toEqual([]);
    expect(Date.parse(reporte.generadoEn)).not.toBeNaN();
  });

  it('una orden inexistente en Producción deja la unidad como desconocida sin aviso', async () => {
    produccion.consultarOrdenPorId.mockImplementation(async (id: string) => {
      if (id === '7') throw new NotFoundException('Orden no encontrada en Producción');
      return { producto: null };
    });
    const reporte = await service.generar(FILTROS, 'Bearer s');
    expect(reporte.boletas.map((b) => b.unidad)).toEqual([null, null]);
    expect(reporte.resumen.boletas.cantidadEmitidaPorUnidad).toEqual({ desconocida: '34.0000' });
    expect(reporte.avisos).toEqual([]);
  });

  it.each([new ServiceUnavailableException('Producción no está disponible'), new BadGatewayException('Producción rechazó la consulta')])(
    'si Producción falla (%s) el reporte se entrega igual con aviso y sin seguir consultando',
    async (error) => {
      produccion.consultarOrdenPorId.mockRejectedValue(error);
      const reporte = await service.generar(FILTROS, 'Bearer s');
      expect(produccion.consultarOrdenPorId).toHaveBeenCalledTimes(1);
      expect(reporte.boletas.every((b) => b.unidad === null)).toBe(true);
      expect(reporte.avisos).toEqual(['No se pudo consultar la unidad de 2 órdenes en Producción; se muestran como desconocidas.']);
    },
  );

  it('período vacío: no consulta detalles ni Producción', async () => {
    filas['FROM rutas\n'] = [];
    filas['FROM boletas_envio boleta'] = [];
    const reporte = await service.generar(FILTROS, 'Bearer s');
    expect(consultas.map((c) => c.sql.includes('FROM rutas\n') || c.sql.includes('FROM boletas_envio boleta'))).toEqual([true, true]);
    expect(produccion.consultarOrdenPorId).not.toHaveBeenCalled();
    expect(reporte.rutas).toEqual([]);
    expect(reporte.boletas).toEqual([]);
    expect(reporte.resumen.rutas.total).toBe(0);
  });
});
