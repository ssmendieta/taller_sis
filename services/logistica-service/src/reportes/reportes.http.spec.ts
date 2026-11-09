import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { Workbook } from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { EstadoEntrega } from '../despacho/estado-entrega.enum';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { ReporteLogisticoQuery } from './dto/reporte-logistico.dto';
import { armarReporte } from './reporte-logistico';
import { ReportesModule } from './reportes.module';
import { ReportesService } from './reportes.service';

// PRUEBA SIMULADA: Auth es un servidor HTTP local y el servicio del reporte es un
// doble; el controlador, el pipe de filtros y el guard de permisos son los reales.
describe('ABC-340: GET /reportes/logistica (permisos y filtros)', () => {
  const authOriginal = process.env.AUTH_SERVICE_URL;
  let auth: Server;
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  const generar = jest.fn(async (filtros: unknown) => ({ filtros, rutas: [], boletas: [] }));

  beforeAll(async () => {
    auth = createServer((req, res) => {
      const sesion = req.headers.authorization === 'Bearer sesion-de-prueba';
      res.writeHead(sesion ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sesion ? { id: '42', permisos: permisos.map((codigo) => ({ codigo })) } : { message: 'Sesión inválida' }));
    });
    await new Promise<void>((resolver) => auth.listen(0, '127.0.0.1', resolver));
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(auth.address() as AddressInfo).port}`;
    const modulo = await Test.createTestingModule({ imports: [ReportesModule] })
      .overrideProvider(ReportesService).useValue({ generar })
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    auth.closeAllConnections();
    await new Promise((resolver) => auth.close(resolver));
    if (authOriginal === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = authOriginal;
  });

  beforeEach(() => {
    permisos = ['logistica.rutas.consultar'];
    generar.mockClear();
  });

  async function consultar(parametros: string, sesion = true) {
    const respuesta = await fetch(`${base}/reportes/logistica${parametros}`, {
      headers: sesion ? { Authorization: 'Bearer sesion-de-prueba' } : {},
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }

  it('200 con logistica.rutas.consultar; pasa filtros normalizados y la sesión', async () => {
    const { status, body } = await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-30&estadoRuta=COMPLETADA&estadoBoleta=ANULADA');
    expect(status).toBe(200);
    expect(body.filtros).toEqual({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estadoRuta: 'COMPLETADA', estadoBoleta: 'ANULADA' });
    expect(generar).toHaveBeenCalledWith(body.filtros, 'Bearer sesion-de-prueba');
  });

  it('sin estados devuelve null en esos filtros', async () => {
    const { body } = await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-01');
    expect(body.filtros).toEqual({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-01', estadoRuta: null, estadoBoleta: null });
  });

  it('401 sin sesión y 403 sin el permiso, sin generar el reporte', async () => {
    expect((await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-30', false)).status).toBe(401);
    permisos = ['logistica.boletas.consultar'];
    expect((await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-30')).status).toBe(403);
    expect(generar).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'fechaDesde y fechaHasta son obligatorias'],
    ['?fechaDesde=2026-11-01', 'fechaDesde y fechaHasta son obligatorias'],
    ['?fechaDesde=2026-02-30&fechaHasta=2026-03-01', 'fechaDesde y fechaHasta son obligatorias'],
    ['?fechaDesde=2026-12-01&fechaHasta=2026-11-01', 'fechaDesde no puede ser posterior a fechaHasta'],
    ['?fechaDesde=2025-01-01&fechaHasta=2026-01-02', 'El período no puede superar 366 días'],
    ['?fechaDesde=2026-11-01&fechaHasta=2026-11-30&estadoRuta=EN_CAMINO', 'estadoRuta debe ser uno de: PLANIFICADA, DESPACHADA, COMPLETADA, CANCELADA'],
    ['?fechaDesde=2026-11-01&fechaHasta=2026-11-30&estadoBoleta=PAGADA', 'estadoBoleta debe ser uno de: BORRADOR, EMITIDA, ANULADA'],
    ['?fechaDesde=2026-11-01&fechaHasta=2026-11-30&chofer=CHO-1', 'Parámetro de consulta no permitido: chofer'],
    ['?fechaDesde=2026-11-01&fechaDesde=2026-11-02&fechaHasta=2026-11-30', 'fechaDesde debe enviarse una sola vez'],
  ])('400 %s', async (parametros, mensaje) => {
    const { status, body } = await consultar(parametros);
    expect(status).toBe(400);
    expect(body.message).toContain(mensaje);
    expect(generar).not.toHaveBeenCalled();
  });

  it('acepta exactamente 366 días (año bisiesto completo)', async () => {
    expect((await consultar('?fechaDesde=2028-01-01&fechaHasta=2028-12-31')).status).toBe(200);
  });

  describe('ABC-342: archivos con los filtros y datos del reporte', () => {
    const filtros: ReporteLogisticoQuery = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30',
      estadoRuta: EstadoRuta.COMPLETADA, estadoBoleta: null };
    const parametros = '?fechaDesde=2026-11-01&fechaHasta=2026-11-30&estadoRuta=COMPLETADA';

    function ejemplo(cantidadBoletas: number) {
      const boletas = Array.from({ length: cantidadBoletas }, (_, i) => ({
        id: String(i + 1), numero: `BE-QA-${i + 1}`, fecha: '2026-11-09', orden_id: i === 2 ? '2' : '1',
        estado: i === 1 ? EstadoBoleta.ANULADA : EstadoBoleta.EMITIDA,
      }));
      return armarReporte(filtros, {
        rutas: [{ id: '1', fecha_programada: '2026-11-09', estado: EstadoRuta.COMPLETADA, vehiculo_externo_id: 'VEH-QA', chofer_externo_id: 'CHO-QA' }],
        paradas: [{ id: '1', ruta_id: '1', estado_entrega: EstadoEntrega.ENTREGADA }],
        documentosRuta: boletas.map((b) => ({ parada_id: '1', boleta_id: b.id, estado: b.estado })),
        boletas, itemsBoleta: boletas.map((b) => ({ boleta_id: b.id, items: 2, cantidad: b.orden_id === '2' ? '3.5000' : '2.1250' })),
        ubicacionBoletas: boletas.map((b) => ({ boleta_id: b.id, ruta_id: '1', estado_ruta: EstadoRuta.COMPLETADA, estado_entrega: EstadoEntrega.ENTREGADA })),
        unidades: new Map([['1', 'kg'], ['2', 'l']]), incidencias: [], reprogramaciones: [],
      }, new Date('2026-11-09T19:00:00Z'));
    }

    function exportar(formato: string, query = parametros, token = true) {
      return fetch(`${base}/reportes/logistica/exportar/${formato}${query}`, {
        headers: token ? { Authorization: 'Bearer sesion-de-prueba' } : {},
      });
    }

    it('entrega un XLSX legible con totales, unidades y boleta anulada no entregada', async () => {
      generar.mockResolvedValueOnce(ejemplo(3));
      const respuesta = await exportar('xlsx');
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('content-type')).toContain('spreadsheetml.sheet');
      expect(respuesta.headers.get('content-disposition')).toBe('attachment; filename="reporte-logistico_2026-11-01_a_2026-11-30.xlsx"');
      expect(respuesta.headers.get('cache-control')).toBe('no-store');
      expect(generar).toHaveBeenCalledWith(filtros, 'Bearer sesion-de-prueba');
      const libro = new Workbook();
      await libro.xlsx.load(await respuesta.arrayBuffer());
      expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Resumen', 'Rutas', 'Boletas']);
      const resumen = new Map();
      libro.getWorksheet('Resumen')!.eachRow((fila) => resumen.set(fila.getCell(1).text, fila.getCell(2).value));
      expect(resumen.get('Desde')).toBe(filtros.fechaDesde);
      expect(resumen.get('Hasta')).toBe(filtros.fechaHasta);
      expect(resumen.get('Estado de ruta')).toBe('COMPLETADA');
      expect(resumen.get('Generado en Bolivia')).toBeTruthy();
      expect(resumen.get('Cantidad emitida (kg)')).toBe('2.1250');
      expect(resumen.get('Cantidad emitida (l)')).toBe('3.5000');
      expect(resumen.get('Boletas entregadas del período')).toBe(2);
      const boletas = libro.getWorksheet('Boletas')!;
      expect(boletas.getCell('C3').value).toBe('ANULADA');
      expect(boletas.getCell('I3').value).toBe('No');
    });

    it('genera un PDF multipágina que se puede abrir', async () => {
      generar.mockResolvedValueOnce(ejemplo(80));
      const respuesta = await exportar('pdf');
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get('content-type')).toContain('application/pdf');
      expect(respuesta.headers.get('content-disposition')).toContain('.pdf');
      const datos = await respuesta.arrayBuffer();
      expect(Number(respuesta.headers.get('content-length'))).toBe(datos.byteLength);
      const documento = await PDFDocument.load(datos);
      expect(documento.getTitle()).toBe('Reporte logístico');
      expect(documento.getPageCount()).toBeGreaterThan(2);
    });

    it('protege ambas descargas y rechaza filtros o formato inválidos antes de generar', async () => {
      expect((await exportar('pdf', parametros, false)).status).toBe(401);
      permisos = ['logistica.boletas.consultar'];
      expect((await exportar('xlsx')).status).toBe(403);
      permisos = ['logistica.rutas.consultar'];
      expect((await exportar('pdf', '')).status).toBe(400);
      expect((await exportar('csv')).status).toBe(400);
      expect(generar).not.toHaveBeenCalled();
    });
  });
});
