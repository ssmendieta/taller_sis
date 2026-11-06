import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';

describe('DashboardService (ABC-324)', () => {
  let service: DashboardService;
  let queryMock: jest.Mock;
  let dataSourceMock: Partial<DataSource>;

  beforeEach(() => {
    queryMock = jest.fn();
    dataSourceMock = {
      query: queryMock,
    };
    service = new DashboardService(dataSourceMock as DataSource);
  });

  describe('Validación de filtros de fechas', () => {
    it('rechaza una fecha "desde" con formato inválido', async () => {
      await expect(
        service.obtenerMetricas({ desde: 'fecha-invalida' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una fecha "hasta" con formato inválido', async () => {
      await expect(
        service.obtenerMetricas({ hasta: 'no-es-fecha' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un rango donde "desde" es posterior a "hasta"', async () => {
      await expect(
        service.obtenerMetricas({
          desde: '2026-11-10',
          hasta: '2026-11-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Estado vacío (sin datos)', () => {
    it('devuelve métricas con ceros, sin NaN ni divisiones entre cero cuando la base está vacía', async () => {
      queryMock.mockImplementation(async (sql: string) => {
        if (sql.includes('ordenes_produccion')) {
          return [{
            total: 0,
            pendientes: 0,
            planificadas: 0,
            en_produccion: 0,
            finalizadas: 0,
            canceladas: 0,
            cantidad_solicitada_total: 0,
          }];
        }
        if (sql.includes('resultados_conformes')) {
          return [{ conformes: 0, defectuosos: 0, total: 0 }];
        }
        if (sql.includes('avances_produccion')) {
          return [{ cantidad_producida_total: 0, total_avances: 0 }];
        }
        if (sql.includes('perdidas_materia_prima') && sql.includes('GROUP BY')) {
          return [];
        }
        if (sql.includes('perdidas_materia_prima')) {
          return [{ total_registros: 0, cantidad_total: 0 }];
        }
        if (sql.includes('observaciones_orden')) {
          return [{ observaciones: 0, incidencias: 0, total: 0 }];
        }
        return [];
      });

      const resultado = await service.obtenerMetricas({});

      expect(resultado.periodo.desde).toBeNull();
      expect(resultado.periodo.hasta).toBeNull();

      expect(resultado.resumen).toEqual({
        total_ordenes: 0,
        porcentaje_conformes: 0,
        porcentaje_avance_global: 0,
        total_incidencias: 0,
        total_perdidas: 0,
      });

      expect(resultado.ordenes_por_estado).toEqual({
        PENDIENTE: 0,
        PLANIFICADA: 0,
        EN_PRODUCCION: 0,
        FINALIZADA: 0,
        CANCELADA: 0,
        total: 0,
      });

      expect(resultado.calidad).toEqual({
        unidades_conformes: 0,
        unidades_defectuosas: 0,
        total_evaluado: 0,
        porcentaje_conformes: 0,
        porcentaje_defectuosas: 0,
      });

      expect(resultado.avance_global).toEqual({
        cantidad_solicitada_total: 0,
        cantidad_producida_total: 0,
        cantidad_pendiente_total: 0,
        porcentaje_avance_global: 0,
        total_registros_avance: 0,
      });

      expect(resultado.perdidas_materia_prima).toEqual({
        total_registros: 0,
        cantidad_total: 0,
        desglose_por_material: [],
      });

      expect(resultado.incidencias).toEqual({
        total_observaciones: 0,
        total_incidencias: 0,
        total: 0,
      });
    });
  });

  describe('Cálculo de indicadores con datos reales de prueba', () => {
    it('calcula los indicadores de órdenes, calidad, avance, pérdidas e incidencias correctamente', async () => {
      queryMock.mockImplementation(async (sql: string) => {
        if (sql.includes('ordenes_produccion')) {
          return [{
            total: 10,
            pendientes: 2,
            planificadas: 1,
            en_produccion: 4,
            finalizadas: 2,
            canceladas: 1,
            cantidad_solicitada_total: 1000,
          }];
        }
        if (sql.includes('resultados_conformes')) {
          return [{ conformes: 920, defectuosos: 80, total: 1000 }];
        }
        if (sql.includes('avances_produccion')) {
          return [{ cantidad_producida_total: 650, total_avances: 8 }];
        }
        if (sql.includes('perdidas_materia_prima') && sql.includes('GROUP BY')) {
          return [
            {
              material_id: '1',
              material_codigo: 'HAR-001',
              material_nombre: 'Harina de Trigo',
              unidad: 'kg',
              cantidad: 15.5,
            },
            {
              material_id: '2',
              material_codigo: 'AZU-001',
              material_nombre: 'Azúcar Refinada',
              unidad: 'kg',
              cantidad: 4.5,
            },
          ];
        }
        if (sql.includes('perdidas_materia_prima')) {
          return [{ total_registros: 3, cantidad_total: 20 }];
        }
        if (sql.includes('observaciones_orden')) {
          return [{ observaciones: 5, incidencias: 3, total: 8 }];
        }
        return [];
      });

      const resultado = await service.obtenerMetricas({
        desde: '2026-10-01',
        hasta: '2026-10-31',
      });

      expect(resultado.periodo).toEqual({
        desde: '2026-10-01',
        hasta: '2026-10-31',
      });

      // Resumen
      expect(resultado.resumen.total_ordenes).toBe(10);
      expect(resultado.resumen.porcentaje_conformes).toBe(92);
      expect(resultado.resumen.porcentaje_avance_global).toBe(65);
      expect(resultado.resumen.total_incidencias).toBe(3);
      expect(resultado.resumen.total_perdidas).toBe(20);

      // Órdenes
      expect(resultado.ordenes_por_estado).toEqual({
        PENDIENTE: 2,
        PLANIFICADA: 1,
        EN_PRODUCCION: 4,
        FINALIZADA: 2,
        CANCELADA: 1,
        total: 10,
      });

      // Calidad: 920 conformes de 1000 = 92%
      expect(resultado.calidad.unidades_conformes).toBe(920);
      expect(resultado.calidad.unidades_defectuosas).toBe(80);
      expect(resultado.calidad.porcentaje_conformes).toBe(92);
      expect(resultado.calidad.porcentaje_defectuosas).toBe(8);

      // Avance: 650 de 1000 = 65%
      expect(resultado.avance_global.cantidad_solicitada_total).toBe(1000);
      expect(resultado.avance_global.cantidad_producida_total).toBe(650);
      expect(resultado.avance_global.cantidad_pendiente_total).toBe(350);
      expect(resultado.avance_global.porcentaje_avance_global).toBe(65);
      expect(resultado.avance_global.total_registros_avance).toBe(8);

      // Pérdidas
      expect(resultado.perdidas_materia_prima.total_registros).toBe(3);
      expect(resultado.perdidas_materia_prima.cantidad_total).toBe(20);
      expect(resultado.perdidas_materia_prima.desglose_por_material).toHaveLength(2);
      expect(resultado.perdidas_materia_prima.desglose_por_material[0].material_codigo).toBe('HAR-001');

      // Incidencias
      expect(resultado.incidencias.total_observaciones).toBe(5);
      expect(resultado.incidencias.total_incidencias).toBe(3);
      expect(resultado.incidencias.total).toBe(8);
    });

    it('aplica los parámetros de fecha correctamente en las consultas SQL', async () => {
      queryMock.mockResolvedValue([]);

      await service.obtenerMetricas({
        desde: '2026-10-01',
        hasta: '2026-10-31',
      });

      expect(queryMock).toHaveBeenCalled();
      const llamadas = queryMock.mock.calls;
      llamadas.forEach((llamada) => {
        const sql = llamada[0] as string;
        const params = llamada[1] as unknown[];
        expect(sql).toContain('WHERE');
        expect(params).toHaveLength(2);
        expect(params[0]).toBeInstanceOf(Date);
        expect(params[1]).toBeInstanceOf(Date);
      });
    });
  });
});
