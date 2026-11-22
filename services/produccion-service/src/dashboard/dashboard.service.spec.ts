import { BadRequestException, NotFoundException } from '@nestjs/common';
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
        fpy: null,
        unidades_conformes_primera: 0,
        unidades_recuperadas: 0,
        porcentaje_conformes_final: null,
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

describe('DashboardService: FPY excluyendo reprocesos (ABC-470)', () => {
  const crear = (fila: Record<string, number>) => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('FROM reprocesos p') ? [fila] : [],
    );
    return { service: new DashboardService({ query } as unknown as DataSource), query };
  };

  it('sin reprocesos: FPY y % final coinciden', async () => {
    const { service } = crear({ conformes_primera: 90, evaluadas: 100, recuperadas: 0 });
    const { calidad } = await service.obtenerMetricas();
    expect(calidad.fpy).toBe(90);
    expect(calidad.porcentaje_conformes_final).toBe(90);
  });

  it('con reprocesos: el FPY no cuenta las recuperadas y difiere del % final', async () => {
    const { service } = crear({ conformes_primera: 80, evaluadas: 100, recuperadas: 10 });
    const { calidad } = await service.obtenerMetricas();
    expect(calidad.fpy).toBe(80);
    expect(calidad.unidades_recuperadas).toBe(10);
    expect(calidad.porcentaje_conformes_final).toBe(90);
    expect(calidad.fpy).not.toBe(calidad.porcentaje_conformes_final);
  });

  it('sin datos: FPY null sin dividir entre cero', async () => {
    const { service } = crear({ conformes_primera: 0, evaluadas: 0, recuperadas: 0 });
    const { calidad } = await service.obtenerMetricas();
    expect(calidad.fpy).toBeNull();
    expect(calidad.porcentaje_conformes_final).toBeNull();
  });

  it('filtro de periodo: pasa las fechas a la consulta del FPY', async () => {
    const { service, query } = crear({ conformes_primera: 5, evaluadas: 10, recuperadas: 0 });
    await service.obtenerMetricas({ desde: '2026-10-01', hasta: '2026-10-31' });
    const llamada = query.mock.calls.find((c) => (c[0] as string).includes('FROM reprocesos p'))!;
    expect(llamada[0]).toContain('r.fecha_hora >= $1');
    expect(llamada[0]).toContain('r.fecha_hora <= $2');
    expect(llamada[1]).toHaveLength(2);
    expect(llamada[1][0]).toBeInstanceOf(Date);
  });
});

describe('DashboardService: metas de KPI y semáforo (ABC-495)', () => {
  let service: DashboardService;
  let queryMock: jest.Mock;

  const filaMeta = (kpi: string, extra: Record<string, unknown> = {}) => ({
    kpi,
    meta: '95.0000',
    unidad: '%',
    umbral_amarillo_pct: '10.00',
    umbral_rojo_pct: '20.00',
    sentido: 'MAYOR_ES_MEJOR',
    actualizado_por: null,
    actualizado_en: new Date('2026-11-20T10:00:00Z'),
    ...extra,
  });

  beforeEach(() => {
    queryMock = jest.fn();
    service = new DashboardService({ query: queryMock } as unknown as DataSource);
  });

  it('lista las metas y convierte los números', async () => {
    queryMock.mockResolvedValueOnce([filaMeta('FPY')]);
    const metas = await service.listarMetas();
    expect(metas).toEqual([
      expect.objectContaining({ kpi: 'FPY', meta: 95, umbralAmarilloPct: 10, umbralRojoPct: 20 }),
    ]);
  });

  it('responde 404 si el KPI no existe', async () => {
    queryMock.mockResolvedValueOnce([filaMeta('FPY')]);
    await expect(service.obtenerMeta('NO_EXISTE')).rejects.toThrow(NotFoundException);
  });

  it('rechaza guardar un KPI que no es de este servicio', async () => {
    await expect(
      service.guardarMeta('TIEMPO_ATENCION', { meta: 1, umbralAmarilloPct: 1, umbralRojoPct: 2 }, 7),
    ).rejects.toThrow(NotFoundException);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rechaza umbral rojo menor o igual al amarillo', async () => {
    await expect(
      service.guardarMeta('FPY', { meta: 95, umbralAmarilloPct: 20, umbralRojoPct: 20 }, 7),
    ).rejects.toThrow(BadRequestException);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('guarda la meta con el usuario que edita', async () => {
    queryMock
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([filaMeta('FPY', { meta: '90.0000', actualizado_por: '7' })]);
    const res = await service.guardarMeta(
      'FPY',
      { meta: 90, umbralAmarilloPct: 10, umbralRojoPct: 20 },
      7,
    );
    expect(queryMock.mock.calls[0][1]).toEqual(['FPY', 90, 10, 20, 7]);
    expect(res.meta).toBe(90);
    expect(res.actualizadoPor).toBe(7);
  });

  it('permite borrar la meta con null', async () => {
    queryMock
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([filaMeta('FPY', { meta: null })]);
    const res = await service.guardarMeta(
      'FPY',
      { meta: null, umbralAmarilloPct: 10, umbralRojoPct: 20 },
      7,
    );
    expect(res.meta).toBeNull();
  });

  it('devuelve los KPIs sin color mientras no haya valor calculado', async () => {
    queryMock
      .mockResolvedValueOnce([filaMeta('MERMA')])
    const res = await service.obtenerKpisConSemaforo();
    expect(res.kpis[0]).toMatchObject({ kpi: 'MERMA', valor: null, color: null });
  });

  it('calcula el valor del FPY y su color (ABC-470)', async () => {
    queryMock
      .mockResolvedValueOnce([filaMeta('FPY')])
      .mockResolvedValueOnce([{ conformes_primera: 96, evaluadas: 100, recuperadas: 2 }]);
    const res = await service.obtenerKpisConSemaforo();
    expect(res.kpis[0]).toMatchObject({ kpi: 'FPY', valor: 96, color: 'VERDE' });
  });

  it('FPY sin evaluadas queda sin valor ni color', async () => {
    queryMock
      .mockResolvedValueOnce([filaMeta('FPY')])
      .mockResolvedValueOnce([{ conformes_primera: 0, evaluadas: 0, recuperadas: 0 }]);
    const res = await service.obtenerKpisConSemaforo();
    expect(res.kpis[0]).toMatchObject({ kpi: 'FPY', valor: null, color: null });
  });

  it.each([
    [96, 'VERDE'],
    [80, 'AMARILLO'],
    [70, 'ROJO'],
  ])('devuelve el color con valor %p → %s', async (valor, color) => {
    class ServicioConValor extends DashboardService {
      protected async obtenerValorKpi(): Promise<number | null> {
        return valor;
      }
    }
    const s = new ServicioConValor({ query: queryMock } as unknown as DataSource);
    queryMock.mockResolvedValueOnce([filaMeta('FPY')]);
    const res = await s.obtenerKpisConSemaforo();
    expect(res.kpis[0].color).toBe(color);
  });

  it('devuelve sin color un KPI sin meta aunque tenga valor', async () => {
    class ServicioConValor extends DashboardService {
      protected async obtenerValorKpi(): Promise<number | null> {
        return 50;
      }
    }
    const s = new ServicioConValor({ query: queryMock } as unknown as DataSource);
    queryMock.mockResolvedValueOnce([filaMeta('FPY', { meta: null })]);
    const res = await s.obtenerKpisConSemaforo();
    expect(res.kpis[0]).toMatchObject({ meta: null, valor: 50, color: null });
  });
});

const KPI = 'FPY';

describe('DashboardService: avisos de KPI en rojo (ABC-500)', () => {
  let ultimoColor: string | null;
  let avisos: { id: number; kpi: string; valor: number; meta: number | null; fecha: Date; leido: boolean }[];
  let valorActual: number | null;
  let queryMock: jest.Mock;
  let service: DashboardService;

  const filaMeta = () => ({
    kpi: KPI,
    meta: '95.0000',
    unidad: '%',
    umbral_amarillo_pct: '10.00',
    umbral_rojo_pct: '20.00',
    sentido: 'MAYOR_ES_MEJOR',
    actualizado_por: null,
    actualizado_en: new Date('2026-11-20T10:00:00Z'),
  });

  beforeEach(() => {
    ultimoColor = null;
    avisos = [];
    valorActual = 96;
    queryMock = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('WITH cambio')) {
        const [kpi, color, valor, meta] = params as [string, string, number, number | null];
        if (ultimoColor !== color) {
          ultimoColor = color;
          if (color === 'ROJO') {
            avisos.push({ id: avisos.length + 1, kpi, valor, meta, fecha: new Date(), leido: false });
          }
        }
        return [];
      }
      if (sql.includes('FROM avisos_kpi')) {
        const [, leido] = params as [string[], boolean | null];
        return avisos.filter((a) => leido === null || a.leido === leido);
      }
      if (sql.includes('UPDATE avisos_kpi')) {
        const aviso = avisos.find((a) => a.id === (params as number[])[0]);
        if (aviso) aviso.leido = true;
        return aviso ? [aviso] : [];
      }
      return [filaMeta()];
    });
    class ServicioConValor extends DashboardService {
      protected async obtenerValorKpi(): Promise<number | null> {
        return valorActual;
      }
    }
    service = new ServicioConValor({ query: queryMock } as unknown as DataSource);
  });

  it('verde a rojo: registra un aviso con KPI, valor, meta y sin leer', async () => {
    await service.obtenerKpisConSemaforo();
    valorActual = 70;
    await service.obtenerKpisConSemaforo();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ kpi: KPI, valor: 70, meta: 95, leido: false });
  });

  it('rojo sostenido: no genera avisos nuevos', async () => {
    valorActual = 70;
    await service.obtenerKpisConSemaforo();
    await service.obtenerKpisConSemaforo();
    valorActual = 65;
    await service.obtenerKpisConSemaforo();
    expect(avisos).toHaveLength(1);
  });

  it('rojo, verde y rojo: avisa de nuevo al volver a rojo', async () => {
    valorActual = 70;
    await service.obtenerKpisConSemaforo();
    valorActual = 96;
    await service.obtenerKpisConSemaforo();
    valorActual = 60;
    await service.obtenerKpisConSemaforo();
    expect(avisos).toHaveLength(2);
  });

  it('amarillo no genera aviso', async () => {
    valorActual = 80;
    await service.obtenerKpisConSemaforo();
    expect(avisos).toHaveLength(0);
  });

  it('un KPI sin valor/color no toca el estado ni avisa', async () => {
    valorActual = null;
    await service.obtenerKpisConSemaforo();
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('WITH cambio'))).toBe(false);
  });

  it('lista avisos y filtra por leído', async () => {
    valorActual = 70;
    await service.obtenerKpisConSemaforo();
    expect(await service.listarAvisos(false)).toHaveLength(1);
    await service.marcarAvisoLeido(1);
    expect(await service.listarAvisos(false)).toHaveLength(0);
    expect(await service.listarAvisos(true)).toHaveLength(1);
    expect((await service.listarAvisos())[0]).toMatchObject({ id: 1, kpi: KPI, leido: true });
  });

  it('marcar como leído un aviso inexistente da NotFound', async () => {
    await expect(service.marcarAvisoLeido(99)).rejects.toThrow(NotFoundException);
  });
});
