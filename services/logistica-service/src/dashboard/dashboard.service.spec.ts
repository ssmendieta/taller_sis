import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';

describe('ABC-478: contrato del tiempo de atención', () => {
  const query = jest.fn();
  const service = new DashboardService({ query } as unknown as DataSource);

  beforeEach(() => query.mockReset());

  it.each([
    ['12.50', 2, 12.5],
    ['0.00', 1, 0],
    [null, 0, null],
  ])('mapea promedio %s y %s solicitudes sin sustituir null por cero', async (promedio, cantidad, esperado) => {
    query.mockImplementation(async (sql: string) => sql.includes('WITH entregas_por_boleta')
      ? [{ promedio_horas: promedio, solicitudes_entregadas: cantidad }] : []);
    expect((await service.obtenerMetricas()).tiempo_atencion).toEqual({
      promedio_horas: esperado, solicitudes_entregadas: cantidad, unidad: 'horas',
    });
  });

  it('envía los límites UTC de la entrega real, incluidos los filtros abiertos', async () => {
    query.mockResolvedValue([]);
    for (const [filtro, esperado] of [
      [{ desde: '2026-11-01', hasta: '2026-11-02' }, [new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T23:59:59.999Z')]],
      [{ desde: '2026-11-01' }, [new Date('2026-11-01T00:00:00Z'), null]],
      [{ hasta: '2026-11-02' }, [null, new Date('2026-11-02T23:59:59.999Z')]],
    ] as const) {
      query.mockClear();
      await service.obtenerMetricas(filtro);
      const llamada = query.mock.calls.find(([sql]) => sql.includes('WITH entregas_por_boleta'));
      expect(llamada?.[1]).toEqual(esperado);
    }
  });

  it('usa el mismo promedio en el semáforo TIEMPO_ATENCION', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM metas_kpi')) return [{ kpi: 'TIEMPO_ATENCION', meta: '24', unidad: 'horas',
        sentido: 'MENOR_ES_MEJOR', umbral_amarillo_pct: 10, umbral_rojo_pct: 20,
        actualizado_en: '2026-11-01T00:00:00Z', actualizado_por: null }];
      if (sql.includes('WITH entregas_por_boleta')) return [{ promedio_horas: '12.50', solicitudes_entregadas: 2 }];
      return [];
    });
    expect((await service.obtenerKpisConSemaforo()).kpis[0]).toMatchObject({
      kpi: 'TIEMPO_ATENCION', valor: 12.5, unidad: 'horas', color: 'VERDE',
    });
  });
});

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
        if (sql.includes('recursos_externos_vehiculos')) return [];
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
        if (sql.includes('recursos_externos_vehiculos')) return [];
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

      expect(queryMock).toHaveBeenCalledTimes(8);
      queryMock.mock.calls.forEach((llamada) => {
        const sql = llamada[0] as string;
        const params = llamada[1] as unknown[];
        expect(sql).toContain('WHERE');
        expect(params).toHaveLength(2);
      });
    });
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
    queryMock.mockResolvedValueOnce([filaMeta('ENTREGAS_A_TIEMPO')]);
    const metas = await service.listarMetas();
    expect(metas).toEqual([
      expect.objectContaining({ kpi: 'ENTREGAS_A_TIEMPO', meta: 95, umbralAmarilloPct: 10, umbralRojoPct: 20 }),
    ]);
  });

  it('responde 404 si el KPI no existe', async () => {
    queryMock.mockResolvedValueOnce([filaMeta('ENTREGAS_A_TIEMPO')]);
    await expect(service.obtenerMeta('NO_EXISTE')).rejects.toThrow(NotFoundException);
  });

  it('rechaza guardar un KPI que no es de este servicio', async () => {
    await expect(
      service.guardarMeta('FPY', { meta: 1, umbralAmarilloPct: 1, umbralRojoPct: 2 }, 7),
    ).rejects.toThrow(NotFoundException);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rechaza umbral rojo menor o igual al amarillo', async () => {
    await expect(
      service.guardarMeta('ENTREGAS_A_TIEMPO', { meta: 95, umbralAmarilloPct: 20, umbralRojoPct: 20 }, 7),
    ).rejects.toThrow(BadRequestException);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('guarda la meta con el usuario que edita', async () => {
    queryMock
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([filaMeta('ENTREGAS_A_TIEMPO', { meta: '90.0000', actualizado_por: '7' })]);
    const res = await service.guardarMeta(
      'ENTREGAS_A_TIEMPO',
      { meta: 90, umbralAmarilloPct: 10, umbralRojoPct: 20 },
      7,
    );
    expect(queryMock.mock.calls[0][1]).toEqual(['ENTREGAS_A_TIEMPO', 90, 10, 20, 7]);
    expect(res.meta).toBe(90);
    expect(res.actualizadoPor).toBe(7);
  });

  it('permite borrar la meta con null', async () => {
    queryMock
      .mockResolvedValueOnce([[], 1])
      .mockResolvedValueOnce([filaMeta('ENTREGAS_A_TIEMPO', { meta: null })]);
    const res = await service.guardarMeta(
      'ENTREGAS_A_TIEMPO',
      { meta: null, umbralAmarilloPct: 10, umbralRojoPct: 20 },
      7,
    );
    expect(res.meta).toBeNull();
  });

  it('devuelve los KPIs sin color mientras no haya valor calculado', async () => {
    queryMock.mockResolvedValueOnce([filaMeta('ENTREGAS_A_TIEMPO')]);
    const res = await service.obtenerKpisConSemaforo();
    expect(res.kpis[0]).toMatchObject({ kpi: 'ENTREGAS_A_TIEMPO', valor: null, color: null });
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
    queryMock.mockResolvedValueOnce([filaMeta('ENTREGAS_A_TIEMPO')]);
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
    queryMock.mockResolvedValueOnce([filaMeta('ENTREGAS_A_TIEMPO', { meta: null })]);
    const res = await s.obtenerKpisConSemaforo();
    expect(res.kpis[0]).toMatchObject({ meta: null, valor: 50, color: null });
  });
});

const KPI = 'ENTREGAS_A_TIEMPO';

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
      if (sql.includes('COUNT(*)')) {
        return [{ total: avisos.filter((a) => !a.leido).length }];
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

  it('no repetición (ABC-526): un KPI en rojo en varios cálculos registra un solo aviso', async () => {
    for (const v of [70, 65, 60, 68, 55]) {
      valorActual = v;
      await service.obtenerKpisConSemaforo();
    }
    expect(avisos).toHaveLength(1);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 1 });
  });

  it('marcar como leído baja el contador y no se re-avisa mientras siga en rojo (ABC-526)', async () => {
    valorActual = 70;
    await service.obtenerKpisConSemaforo();
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 1 });
    await service.marcarAvisoLeido(1);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 0 });
    valorActual = 62;
    await service.obtenerKpisConSemaforo();
    await service.obtenerKpisConSemaforo();
    expect(avisos).toHaveLength(1);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 0 });
  });

  it('volver a rojo tras verde crea otro aviso y suma al contador (ABC-526)', async () => {
    valorActual = 70;
    await service.obtenerKpisConSemaforo();
    await service.marcarAvisoLeido(1);
    valorActual = 96;
    await service.obtenerKpisConSemaforo();
    valorActual = 60;
    await service.obtenerKpisConSemaforo();
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 1 });
  });
});

describe('DashboardService: uso de capacidad (ABC-490)', () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    ruta_id: '1', fecha: '2026-11-10', estado: 'DESPACHADA', vehiculo_externo_id: 'VEH-01', placa: '2345-ABC',
    capacidad_valor: '1500.0000', capacidad_unidad: 'kg', boleta_id: '10', unidad: 'kg', cantidad: '300.0000', ...extra,
  });
  let filas: Record<string, unknown>[];
  let queryMock: jest.Mock;
  let service: DashboardService;
  const uso = async (filtro = {}) => (await service.obtenerMetricas(filtro)).uso_capacidad;

  beforeEach(() => {
    queryMock = jest.fn(async (sql: string) => (sql.includes('recursos_externos_vehiculos') ? filas : []));
    service = new DashboardService({ query: queryMock } as unknown as DataSource);
  });

  it('unidades compatibles: suma la carga de la ruta y la divide entre la capacidad', async () => {
    filas = [fila(), fila({ boleta_id: '11', cantidad: '450.5000' })];
    const res = await uso();
    expect(res).toMatchObject({ porcentaje: 50.03, rutas_calculables: 1, rutas_no_calculables: 0 });
    expect(res.por_ruta[0]).toMatchObject({
      calculable: true, porcentaje: 50.03, motivo: null,
      carga: { valor: '750.5000', unidad: 'kg' }, capacidad: { valor: '1500.0000', unidad: 'kg' },
    });
  });

  it('agrupa por vehículo y promedia las rutas calculables', async () => {
    filas = [
      fila(), // 20 %
      fila({ ruta_id: '2', cantidad: '900.0000' }), // 60 %
      fila({ ruta_id: '3', vehiculo_externo_id: 'VEH-02', placa: 'X', capacidad_valor: '100.0000', capacidad_unidad: 'caja', unidad: 'caja', cantidad: '100.0000' }),
      fila({ ruta_id: '4', unidad: 'l' }), // no calculable: no entra en el promedio
    ];
    const res = await uso();
    expect(res).toMatchObject({ porcentaje: 60, rutas_calculables: 3, rutas_no_calculables: 1 });
    expect(res.por_vehiculo).toEqual([
      { vehiculo_externo_id: 'VEH-01', placa: '2345-ABC', porcentaje: 40, rutas_calculables: 2, rutas_no_calculables: 1 },
      { vehiculo_externo_id: 'VEH-02', placa: 'X', porcentaje: 100, rutas_calculables: 1, rutas_no_calculables: 0 },
    ]);
  });

  it.each([
    ['incompatible con la capacidad', { unidad: 'l' }, 'UNIDAD_INCOMPATIBLE'],
    ['g contra kg tampoco se convierte', { unidad: 'g' }, 'CARGA_NO_CALCULABLE'],
    ['unidad desconocida', { unidad: null }, 'CARGA_NO_CALCULABLE'],
    ['boleta sin ítems', { cantidad: null }, 'CARGA_NO_CALCULABLE'],
    ['ruta sin boletas', { boleta_id: null, unidad: null, cantidad: null }, 'CARGA_NO_CALCULABLE'],
    ['capacidad faltante', { placa: null, capacidad_valor: null, capacidad_unidad: null }, 'CAPACIDAD_FALTANTE'],
    ['capacidad en cero', { capacidad_valor: '0.0000' }, 'CAPACIDAD_FALTANTE'],
  ])('no calculable: %s', async (_caso, extra, motivo) => {
    filas = [fila(extra)];
    const res = await uso();
    expect(res).toMatchObject({ porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 1 });
    expect(res.por_ruta[0]).toMatchObject({ calculable: false, porcentaje: null, motivo });
    expect(res.por_ruta[0].detalle).toBeTruthy();
  });

  it('no calculable: la carga mezcla unidades', async () => {
    filas = [fila(), fila({ boleta_id: '11', unidad: 'caja' })];
    expect((await uso()).por_ruta[0]).toMatchObject({ calculable: false, carga: null, motivo: 'CARGA_NO_CALCULABLE' });
  });

  it('sin rutas despachadas: sin datos', async () => {
    filas = [];
    expect(await uso()).toEqual({ porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 0, por_vehiculo: [], por_ruta: [] });
  });

  it('filtra por período y solo toma rutas que salieron', async () => {
    filas = [];
    await uso({ desde: '2026-11-01', hasta: '2026-11-10' });
    const [sql, params] = queryMock.mock.calls.find(([q]) => q.includes('recursos_externos_vehiculos'))!;
    expect(params).toEqual(['2026-11-01', '2026-11-10']);
    expect(sql).toContain("r.estado IN ('DESPACHADA','COMPLETADA')");
  });

  it('el semáforo usa el valor calculado de USO_CAPACIDAD', async () => {
    filas = [fila({ cantidad: '1200.0000' })];
    const meta = {
      kpi: 'USO_CAPACIDAD', meta: '80.0000', unidad: '%', umbral_amarillo_pct: '10.00', umbral_rojo_pct: '20.00',
      sentido: 'MAYOR_ES_MEJOR', actualizado_por: null, actualizado_en: new Date('2026-11-20T10:00:00Z'),
    };
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('recursos_externos_vehiculos') ? filas : sql.includes('WITH cambio') ? [] : [meta]);
    expect((await service.obtenerKpisConSemaforo()).kpis[0]).toMatchObject({ valor: 80, color: 'VERDE' });
  });
});

describe('DashboardService: detalle de KPI (ABC-512)', () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    ruta_id: '1', fecha: '2026-11-10', estado: 'DESPACHADA', vehiculo_externo_id: 'VEH-01', placa: 'AAA',
    capacidad_valor: '100.0000', capacidad_unidad: 'kg', boleta_id: '10', unidad: 'kg', cantidad: '30.0000', ...extra,
  });
  const crear = (filas: unknown[]) => {
    const query = jest.fn(async (sql: string) => (sql.includes('recursos_externos_vehiculos') ? filas : []));
    return { service: new DashboardService({ query } as unknown as DataSource), query };
  };

  it('USO_CAPACIDAD: el valor coincide con el del dashboard y con la media de sus registros', async () => {
    const { service } = crear([fila(), fila({ ruta_id: '2', cantidad: '70.0000' }), fila({ ruta_id: '3', unidad: 'l' })]);
    const filtro = { desde: '2026-11-01', hasta: '2026-11-30' };
    const res = await service.obtenerDetalleKpi('USO_CAPACIDAD', filtro);
    expect(res.valor).toBe((await service.obtenerMetricas(filtro)).uso_capacidad.porcentaje);
    expect(res).toMatchObject({ disponible: true, valor: 50, periodo: filtro });
    expect(res.registros.map((r) => [r.tipo, r.id, r.estado, r.valor, 'motivo' in r ? r.motivo : undefined])).toEqual([
      ['RUTA', '1', 'DESPACHADA', 30, null],
      ['RUTA', '2', 'DESPACHADA', 70, null],
      ['RUTA', '3', 'DESPACHADA', null, 'UNIDAD_INCOMPATIBLE'],
    ]);
  });

  it('sin registros: detalle vacío', async () => {
    expect(await crear([]).service.obtenerDetalleKpi('USO_CAPACIDAD')).toMatchObject({ disponible: true, valor: null, registros: [] });
  });

  it('los cuatro KPIs de Logística tienen detalle (ABC-420 y ABC-422 incluidos)', async () => {
    const { service } = crear([]);
    for (const kpi of ['TIEMPO_ATENCION', 'ENTREGAS_A_TIEMPO', 'INCIDENCIAS_RUTA', 'USO_CAPACIDAD']) {
      expect(await service.obtenerDetalleKpi(kpi)).toMatchObject({ disponible: true, valor: null, registros: [] });
    }
  });

  it('filtrar por chofer o vehículo solo se admite en los KPIs del ranking', async () => {
    const { service } = crear([]);
    await expect(service.obtenerDetalleKpi('TIEMPO_ATENCION', { chofer: 'CHO-1' })).rejects.toThrow(BadRequestException);
    expect(await service.obtenerDetalleKpi('USO_CAPACIDAD', { vehiculo: 'VEH-01' })).toMatchObject({ recurso: { chofer: null, vehiculo: 'VEH-01' } });
  });

  it('KPI inválido da 404 y rango invertido da 400', async () => {
    const { service } = crear([]);
    await expect(service.obtenerDetalleKpi('FPY')).rejects.toThrow(NotFoundException);
    await expect(service.obtenerDetalleKpi('USO_CAPACIDAD', { desde: '2026-02-01', hasta: '2026-01-01' })).rejects.toThrow(BadRequestException);
  });
});
