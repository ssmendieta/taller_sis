import 'reflect-metadata';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { validarFiltroParadasRiesgo } from './dto/parada-en-riesgo.dto';
import { Ruta } from './entities/ruta.entity';
import { evaluarRiesgo, fechaMaximaEnRiesgo, margenRiesgoHoras } from './riesgo-entrega';
import { RutasController } from './rutas.controller';
import { RutasService } from './rutas.service';
import { ValidacionAsignacionService } from './validaciones/validacion-asignacion.service';

// ABC-458: regla de riesgo, servicio con base simulada (filas en memoria que
// aplican los parámetros del SQL) y HTTP con un simulador de Auth.
const AHORA = new Date('2026-11-26T14:00:00.000Z'); // 10:00 en Bolivia

describe('ABC-458: regla de riesgo de entrega', () => {
  const pendiente = (fechaProgramada: string) => ({ estadoEntrega: 'PENDIENTE', fechaProgramada });

  it('vencida: el fin del día programado ya pasó', () => {
    expect(evaluarRiesgo(pendiente('2026-11-25'), AHORA, 24)).toEqual({
      motivo: 'VENCIDA', limite: new Date('2026-11-26T04:00:00.000Z'), minutosRestantes: -600,
    });
  });

  it('dentro del margen: vence en 14 h con margen de 24 h', () => {
    expect(evaluarRiesgo(pendiente('2026-11-26'), AHORA, 24)).toMatchObject({ motivo: 'POR_VENCER', minutosRestantes: 840 });
  });

  it('fuera del margen: vence en 38 h con margen de 24 h (con 48 h sí entra)', () => {
    expect(evaluarRiesgo(pendiente('2026-11-27'), AHORA, 24)).toBeNull();
    expect(evaluarRiesgo(pendiente('2026-11-27'), AHORA, 48)).toMatchObject({ motivo: 'POR_VENCER' });
  });

  it('ya entregada o anulada: no está en riesgo aunque su fecha haya vencido', () => {
    expect(evaluarRiesgo({ estadoEntrega: 'ENTREGADA', fechaProgramada: '2026-11-20' }, AHORA, 24)).toBeNull();
    expect(evaluarRiesgo({ estadoEntrega: 'ANULADA', fechaProgramada: '2026-11-20' }, AHORA, 24)).toBeNull();
  });

  it('justo en el límite cuenta como vencida; con margen 0 solo cuenta lo vencido', () => {
    expect(evaluarRiesgo(pendiente('2026-11-25'), new Date('2026-11-26T04:00:00.000Z'), 0)).toMatchObject({ motivo: 'VENCIDA' });
    expect(evaluarRiesgo(pendiente('2026-11-26'), AHORA, 0)).toBeNull();
  });

  it('el margen se configura con ENTREGA_MARGEN_RIESGO_HORAS (24 h por defecto)', () => {
    expect(margenRiesgoHoras({})).toBe(24);
    expect(margenRiesgoHoras({ ENTREGA_MARGEN_RIESGO_HORAS: '48' })).toBe(48);
    expect(margenRiesgoHoras({ ENTREGA_MARGEN_RIESGO_HORAS: '0' })).toBe(0);
    expect(margenRiesgoHoras({ ENTREGA_MARGEN_RIESGO_HORAS: '-3' })).toBe(24);
    expect(margenRiesgoHoras({ ENTREGA_MARGEN_RIESGO_HORAS: '9999' })).toBe(24);
  });

  it('la fecha máxima del SQL coincide con la regla en cualquier hora del día', () => {
    for (let h = 0; h < 48; h += 0.5) {
      const ahora = new Date(AHORA.getTime() + h * 3600000);
      for (const margen of [0, 5, 24, 30]) {
        const maxima = fechaMaximaEnRiesgo(ahora, margen);
        const siguiente = new Date(Date.parse(`${maxima}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
        expect(evaluarRiesgo(pendiente(maxima), ahora, margen)).not.toBeNull();
        expect(evaluarRiesgo(pendiente(siguiente), ahora, margen)).toBeNull();
      }
    }
  });

  it('el filtro de fecha valida formato, calendario y orden', () => {
    expect(validarFiltroParadasRiesgo({})).toEqual({ desde: null, hasta: null });
    expect(validarFiltroParadasRiesgo({ desde: '2026-11-01', hasta: '2026-11-30' })).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(() => validarFiltroParadasRiesgo({ desde: '2026-02-30' })).toThrow(BadRequestException);
    expect(() => validarFiltroParadasRiesgo({ hasta: 'ayer' })).toThrow('hasta debe ser una fecha válida YYYY-MM-DD');
    expect(() => validarFiltroParadasRiesgo({ desde: '2026-11-30', hasta: '2026-11-01' })).toThrow('desde no puede ser posterior a hasta');
  });
});

type Fila = {
  ruta_id: string; ruta_estado: string; fecha_programada: string; vehiculo_externo_id: string; chofer_externo_id: string;
  parada_id: string; secuencia: number; destino: string; estado_entrega: string; entregada_en: string | null;
};
const fila = (parada_id: string, fecha_programada: string, extra: Partial<Fila> = {}): Fila => ({
  ruta_id: '1', ruta_estado: 'PLANIFICADA', fecha_programada, vehiculo_externo_id: 'VEH-1', chofer_externo_id: 'CHO-1',
  parada_id, secuencia: 1, destino: `Destino ${parada_id}`, estado_entrega: 'PENDIENTE', entregada_en: null, ...extra,
});

// Base simulada: aplica a las filas en memoria los mismos filtros que el SQL recibe por parámetro.
function baseSimulada(filas: Fila[]) {
  const query = jest.fn(async (sql: string, [estado, estadosRuta, maxima, desde, hasta]: any[]) => {
    expect(sql).toContain('parada.estado_entrega = $1');
    expect(sql).toContain('parada.entregada_en IS NULL');
    return filas
      .filter((f) => f.estado_entrega === estado && f.entregada_en === null && estadosRuta.includes(f.ruta_estado))
      .filter((f) => f.fecha_programada <= maxima && (!desde || f.fecha_programada >= desde) && (!hasta || f.fecha_programada <= hasta))
      .sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada) || Number(a.ruta_id) - Number(b.ruta_id) || a.secuencia - b.secuencia);
  });
  return { query };
}

describe('ABC-458: RutasService.findParadasEnRiesgo', () => {
  const filas = (): Fila[] => [
    fila('10', '2026-11-26', { ruta_id: '2' }),                                  // dentro del margen
    fila('11', '2026-11-25'),                                                    // vencida
    fila('12', '2026-11-29', { ruta_id: '3' }),                                  // fuera del margen
    fila('13', '2026-11-24', { estado_entrega: 'ENTREGADA', entregada_en: '2026-11-24T15:00:00Z' }), // ya entregada
    fila('14', '2026-11-24', { estado_entrega: 'ANULADA' }),
    fila('15', '2026-11-20', { ruta_id: '4', ruta_estado: 'CANCELADA' }),
    fila('16', '2026-11-23', { ruta_id: '5', ruta_estado: 'DESPACHADA', secuencia: 2 }),
  ];
  const servicio = (base: { query: jest.Mock }) => new RutasService({} as any, base as unknown as DataSource, {} as any);

  afterEach(() => { delete process.env.ENTREGA_MARGEN_RIESGO_HORAS; });

  it('devuelve solo las paradas que cumplen la regla, la más atrasada primero', async () => {
    const respuesta = await servicio(baseSimulada(filas())).findParadasEnRiesgo({ desde: null, hasta: null }, AHORA);
    expect(respuesta.paradas.map((p) => [p.paradaId, p.motivo])).toEqual([['16', 'VENCIDA'], ['11', 'VENCIDA'], ['10', 'POR_VENCER']]);
    expect(respuesta).toMatchObject({ margenHoras: 24, total: 3, calculadoEn: AHORA.toISOString() });
  });

  it('cada parada trae ruta, parada, fecha programada, motivo y si se puede reprogramar', async () => {
    const { paradas } = await servicio(baseSimulada(filas())).findParadasEnRiesgo({ desde: null, hasta: null }, AHORA);
    expect(paradas[1]).toEqual({
      rutaId: '1', rutaEstado: 'PLANIFICADA', reprogramable: true, fechaProgramada: '2026-11-25',
      vehiculoExternoId: 'VEH-1', choferExternoId: 'CHO-1', paradaId: '11', secuencia: 1, destino: 'Destino 11',
      limiteEntrega: '2026-11-26T04:00:00.000Z', minutosRestantes: -600, motivo: 'VENCIDA',
      motivoDetalle: 'La fecha programada venció hace 10 h',
    });
    expect(paradas[0]).toMatchObject({ rutaEstado: 'DESPACHADA', reprogramable: false, motivoDetalle: 'La fecha programada venció hace 2 d 10 h' });
    expect(paradas[2].motivoDetalle).toBe('La fecha programada vence en 14 h');
  });

  it('las ya entregadas no aparecen aunque la consulta las devolviera', async () => {
    const base = { query: jest.fn().mockResolvedValue([fila('13', '2026-11-24', { estado_entrega: 'ENTREGADA' })]) };
    expect((await servicio(base).findParadasEnRiesgo({ desde: null, hasta: null }, AHORA)).paradas).toEqual([]);
  });

  it('envía al SQL el estado PENDIENTE, rutas activas, la fecha máxima y el filtro de fechas', async () => {
    const base = baseSimulada(filas());
    const { paradas } = await servicio(base).findParadasEnRiesgo({ desde: '2026-11-25', hasta: '2026-11-30' }, AHORA);
    expect(base.query.mock.calls[0][1]).toEqual(['PENDIENTE', ['PLANIFICADA', 'DESPACHADA'], '2026-11-26', '2026-11-25', '2026-11-30']);
    expect(paradas.map((p) => p.paradaId)).toEqual(['11', '10']);
  });

  it('respeta el margen configurado', async () => {
    process.env.ENTREGA_MARGEN_RIESGO_HORAS = '0';
    const { paradas, margenHoras } = await servicio(baseSimulada(filas())).findParadasEnRiesgo({ desde: null, hasta: null }, AHORA);
    expect(margenHoras).toBe(0);
    expect(paradas.map((p) => p.paradaId)).toEqual(['16', '11']);
  });
});

describe('ABC-458: GET /rutas/paradas-en-riesgo por HTTP', () => {
  let app: INestApplication;
  let auth: Server;
  let base: string;
  let query: jest.Mock;
  const authOriginal = process.env.AUTH_SERVICE_URL;

  beforeAll(async () => {
    auth = createServer((req, res) => {
      const permisos = req.headers.authorization === 'Bearer lector' ? ['logistica.rutas.consultar']
        : req.headers.authorization === 'Bearer otro' ? ['ordenes.consultar'] : null;
      res.writeHead(permisos ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(permisos ? { id: '42', permisos } : { message: 'Sesión inválida' }));
    });
    await new Promise<void>((r) => auth.listen(0, '127.0.0.1', r));
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(auth.address() as AddressInfo).port}`;

    query = jest.fn();
    const modulo = await Test.createTestingModule({
      controllers: [RutasController],
      providers: [
        RutasService,
        { provide: getRepositoryToken(Ruta), useValue: { findOne: jest.fn() } },
        { provide: DataSource, useValue: { query } },
        { provide: ValidacionAsignacionService, useValue: {} },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((r) => auth.close(r));
    if (authOriginal === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = authOriginal;
  });

  const pedir = (ruta: string, token?: string) =>
    fetch(`${base}${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('exige sesión (401) y el permiso de consultar rutas (403)', async () => {
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, RutasController.prototype.findParadasEnRiesgo)).toBe('logistica.rutas.consultar');
    expect((await pedir('/rutas/paradas-en-riesgo')).status).toBe(401);
    expect((await pedir('/rutas/paradas-en-riesgo', 'otro')).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('rechaza un filtro de fecha inválido (400)', async () => {
    const respuesta = await pedir('/rutas/paradas-en-riesgo?desde=2026-13-01', 'lector');
    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).message).toBe('desde debe ser una fecha válida YYYY-MM-DD');
  });

  it('devuelve las paradas en riesgo con el filtro y no se confunde con /rutas/:id', async () => {
    query.mockReset();
    query.mockImplementation(baseSimulada([fila('11', '2020-01-10'), fila('12', '2099-12-31')]).query);
    const respuesta = await pedir('/rutas/paradas-en-riesgo?desde=2020-01-01', 'lector');
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.total).toBe(1);
    expect(cuerpo.paradas[0]).toMatchObject({ paradaId: '11', rutaId: '1', fechaProgramada: '2020-01-10', motivo: 'VENCIDA', reprogramable: true });
    expect(query.mock.calls[0][1].slice(3)).toEqual(['2020-01-01', null]);
  });
});
