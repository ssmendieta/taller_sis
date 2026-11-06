import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MetricasDashboardLogisticaResponse } from './dashboard.interface';

describe('DashboardController Logística (ABC-328)', () => {
  let controller: DashboardController;
  let serviceMock: { obtenerMetricas: jest.Mock };

  const mockRespuesta: MetricasDashboardLogisticaResponse = {
    periodo: { desde: '2026-10-01', hasta: '2026-10-31' },
    resumen: {
      total_boletas: 10,
      boletas_emitidas: 8,
      rutas_en_curso: 2,
      rutas_planificadas: 3,
      porcentaje_entregas_completadas: 85,
      total_incidencias: 1,
    },
    boletas_por_estado: {
      BORRADOR: 1,
      EMITIDA: 8,
      ANULADA: 1,
      total: 10,
    },
    rutas_por_estado: {
      PLANIFICADA: 3,
      DESPACHADA: 2,
      COMPLETADA: 5,
      CANCELADA: 0,
      total: 10,
    },
    entregas: {
      total_paradas: 20,
      entregadas: 17,
      pendientes: 3,
      anuladas: 0,
      porcentaje_efectividad: 85,
    },
    incidencias: {
      boletas_anuladas: 1,
      rutas_canceladas: 0,
      entregas_anuladas: 0,
      total: 1,
    },
    volumen_carga: {
      total_items: 12,
      cantidad_total: 300,
    },
  };

  beforeEach(() => {
    serviceMock = {
      obtenerMetricas: jest.fn().mockResolvedValue(mockRespuesta),
    };
    controller = new DashboardController(serviceMock as unknown as DashboardService);
  });

  it('GET /dashboard/metricas delega en DashboardService.obtenerMetricas con el query proporcionado', async () => {
    const query = { desde: '2026-10-01', hasta: '2026-10-31' };
    const resultado = await controller.obtenerMetricas(query);

    expect(serviceMock.obtenerMetricas).toHaveBeenCalledWith(query);
    expect(resultado).toEqual(mockRespuesta);
  });

  it('GET /dashboard/indicadores delega en DashboardService.obtenerMetricas con el query proporcionado', async () => {
    const query = { desde: '2026-10-01' };
    const resultado = await controller.obtenerIndicadores(query);

    expect(serviceMock.obtenerMetricas).toHaveBeenCalledWith(query);
    expect(resultado).toEqual(mockRespuesta);
  });

  it('GET /dashboard delega en DashboardService.obtenerMetricas sin parámetros', async () => {
    const resultado = await controller.obtenerGeneral({});

    expect(serviceMock.obtenerMetricas).toHaveBeenCalledWith({});
    expect(resultado).toEqual(mockRespuesta);
  });
});
