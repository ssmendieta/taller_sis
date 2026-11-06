import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MetricasDashboardResponse } from './dashboard.interface';

describe('DashboardController (ABC-324)', () => {
  let controller: DashboardController;
  let serviceMock: { obtenerMetricas: jest.Mock };

  const mockRespuesta: MetricasDashboardResponse = {
    periodo: { desde: '2026-10-01', hasta: '2026-10-31' },
    resumen: {
      total_ordenes: 5,
      porcentaje_conformes: 95,
      porcentaje_avance_global: 70,
      total_incidencias: 1,
      total_perdidas: 10,
    },
    ordenes_por_estado: {
      PENDIENTE: 1,
      PLANIFICADA: 0,
      EN_PRODUCCION: 3,
      FINALIZADA: 1,
      CANCELADA: 0,
      total: 5,
    },
    calidad: {
      unidades_conformes: 190,
      unidades_defectuosas: 10,
      total_evaluado: 200,
      porcentaje_conformes: 95,
      porcentaje_defectuosas: 5,
    },
    avance_global: {
      cantidad_solicitada_total: 500,
      cantidad_producida_total: 350,
      cantidad_pendiente_total: 150,
      porcentaje_avance_global: 70,
      total_registros_avance: 4,
    },
    perdidas_materia_prima: {
      total_registros: 1,
      cantidad_total: 10,
      desglose_por_material: [],
    },
    incidencias: {
      total_observaciones: 2,
      total_incidencias: 1,
      total: 3,
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
