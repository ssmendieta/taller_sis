import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';

describe('DashboardService Logística (ABC-328)', () => {
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
        service.obtenerMetricas({ desde: 'invalido' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una fecha "hasta" con formato inválido', async () => {
      await expect(
        service.obtenerMetricas({ hasta: '2026-99-99' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un rango donde "desde" es posterior a "hasta"', async () => {
      await expect(
        service.obtenerMetricas({
          desde: '2026-11-20',
          hasta: '2026-11-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Estado vacío (sin datos)', () => {
    it('devuelve métricas con ceros, sin NaN ni divisiones entre cero cuando la base está vacía', async () => {
      queryMock.mockImplementation(async (sql: string) => {
        if (sql.includes('boletas_envio_items')) {
          return [{ total_items: 0, cantidad_total: 0 }];
        }
        if (sql.includes('boletas_envio')) {
          return [{ total: 0, borrador: 0, emitida: 0, anulada: 0 }];
        }
        if (sql.includes('rutas_paradas')) {
          return [{ total_paradas: 0, entregadas: 0, pendientes: 0, anuladas: 0 }];
        }
        if (sql.includes('rutas')) {
          return [{ total: 0, planificadas: 0, despachadas: 0, completadas: 0, canceladas: 0 }];
        }
        return [];
      });

      const resultado = await service.obtenerMetricas({});

      expect(resultado.periodo.desde).toBeNull();
      expect(resultado.periodo.hasta).toBeNull();

      expect(resultado.resumen).toEqual({
        total_boletas: 0,
        boletas_emitidas: 0,
        rutas_en_curso: 0,
        rutas_planificadas: 0,
        porcentaje_entregas_completadas: 0,
        total_incidencias: 0,
      });

      expect(resultado.boletas_por_estado).toEqual({
        BORRADOR: 0,
        EMITIDA: 0,
        ANULADA: 0,
        total: 0,
      });

      expect(resultado.rutas_por_estado).toEqual({
        PLANIFICADA: 0,
        DESPACHADA: 0,
        COMPLETADA: 0,
        CANCELADA: 0,
        total: 0,
      });

      expect(resultado.entregas).toEqual({
        total_paradas: 0,
        entregadas: 0,
        pendientes: 0,
        anuladas: 0,
        porcentaje_efectividad: 0,
      });

      expect(resultado.incidencias).toEqual({
        boletas_anuladas: 0,
        rutas_canceladas: 0,
        entregas_anuladas: 0,
        total: 0,
      });

      expect(resultado.volumen_carga).toEqual({
        total_items: 0,
        cantidad_total: 0,
      });
    });
  });

  describe('Cálculo de indicadores con datos reales de prueba', () => {
    it('calcula indicadores de boletas, rutas, entregas, incidencias y volumen de carga correctamente', async () => {
      queryMock.mockImplementation(async (sql: string) => {
        if (sql.includes('boletas_envio_items')) {
          return [{ total_items: 15, cantidad_total: 450.5 }];
        }
        if (sql.includes('boletas_envio')) {
          return [{ total: 16, borrador: 3, emitida: 12, anulada: 1 }];
        }
        if (sql.includes('rutas_paradas')) {
          return [{ total_paradas: 20, entregadas: 16, pendientes: 3, anuladas: 1 }];
        }
        if (sql.includes('rutas')) {
          return [{ total: 13, planificadas: 4, despachadas: 3, completadas: 5, canceladas: 1 }];
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

      // Boletas
      expect(resultado.boletas_por_estado).toEqual({
        BORRADOR: 3,
        EMITIDA: 12,
        ANULADA: 1,
        total: 16,
      });

      // Rutas
      expect(resultado.rutas_por_estado).toEqual({
        PLANIFICADA: 4,
        DESPACHADA: 3,
        COMPLETADA: 5,
        CANCELADA: 1,
        total: 13,
      });

      // Entregas: 16 de 20 = 80%
      expect(resultado.entregas).toEqual({
        total_paradas: 20,
        entregadas: 16,
        pendientes: 3,
        anuladas: 1,
        porcentaje_efectividad: 80,
      });

      // Incidencias: 1 boleta anulada + 1 ruta cancelada + 1 entrega anulada = 3
      expect(resultado.incidencias).toEqual({
        boletas_anuladas: 1,
        rutas_canceladas: 1,
        entregas_anuladas: 1,
        total: 3,
      });

      // Volumen de carga
      expect(resultado.volumen_carga).toEqual({
        total_items: 15,
        cantidad_total: 450.5,
      });

      // Resumen ejecutivo
      expect(resultado.resumen).toEqual({
        total_boletas: 16,
        boletas_emitidas: 12,
        rutas_en_curso: 3,
        rutas_planificadas: 4,
        porcentaje_entregas_completadas: 80,
        total_incidencias: 3,
      });
    });

    it('aplica los parámetros de fecha correctamente en las cláusulas SQL', async () => {
      queryMock.mockResolvedValue([]);

      await service.obtenerMetricas({
        desde: '2026-10-01',
        hasta: '2026-10-31',
      });

      expect(queryMock).toHaveBeenCalledTimes(4);
      queryMock.mock.calls.forEach((llamada) => {
        const sql = llamada[0] as string;
        const params = llamada[1] as unknown[];
        expect(sql).toContain('WHERE');
        expect(params).toHaveLength(2);
      });
    });
  });
});
