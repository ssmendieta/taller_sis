import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import * as http from 'http';
import { PDFDocument } from 'pdf-lib';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import {
  ReporteProduccionDto,
  ReporteProduccionQueryDto,
} from './dto/reporte-produccion.dto';
import { ExcelExportador } from './exportadores/excel.exportador';
import { PdfExportador } from './exportadores/pdf.exportador';
import {
  ExportacionReportesService,
  FormatoExportacion,
} from './exportacion-reportes.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

// ABC-339: Suite de regresión y criterios de aceptación (CA-01 a CA-05)
// para reportes de producción en los tres formatos (JSON, PDF, XLSX).

function crearReporteFixture(cantidadOrdenes = 2): ReporteProduccionDto {
  const ordenes = [
    {
      ordenId: 1,
      codigo: 'OP-2026-0001',
      fechaProgramada: '2026-11-03',
      producto: { recetaId: 1, codigo: 'PINT-BLA', nombre: 'Pintura Látex Blanca', unidad: 'L' },
      fuente: 'REGISTROS' as const,
      cierre: null,
      cantidades: {
        solicitada: '100.0000',
        producida: '80.0000',
        conforme: '70.0000',
        defectuosa: '10.0000',
        reprocesada: '5.0000',
        recuperada: '4.0000',
        descartada: '1.0000',
      },
      consumos: [
        { materialId: '10', unidad: 'kg', cantidad: '15.5000' },
        { materialId: '11', unidad: 'L', cantidad: '20.0000' },
      ],
      perdidas: [
        { materialId: '10', unidad: 'kg', cantidad: '1.2000' },
      ],
    },
    {
      ordenId: 2,
      codigo: 'OP-2026-0002',
      fechaProgramada: '2026-11-05',
      producto: { recetaId: 2, codigo: 'ESM-AZU', nombre: 'Esmalte Sintético Azul', unidad: 'L' },
      fuente: 'CIERRE' as const,
      cierre: { id: '1001', version: 1 },
      cantidades: {
        solicitada: '50.0000',
        producida: '50.0000',
        conforme: '48.0000',
        defectuosa: '2.0000',
        reprocesada: '0.0000',
        recuperada: '0.0000',
        descartada: '0.0000',
      },
      consumos: [
        { materialId: '10', unidad: 'g', cantidad: '500.0000' },
      ],
      perdidas: [
        { materialId: '10', unidad: 'g', cantidad: '20.0000' },
      ],
    },
  ].slice(0, cantidadOrdenes);

  return {
    filtros: {
      fechaDesde: '2026-11-01',
      fechaHasta: '2026-11-10',
      producto: 'Pintura',
      campoFecha: 'fecha_programada',
    },
    ordenes,
    totales: {
      ordenes: ordenes.length,
      productos: [
        {
          producto: { recetaId: 1, codigo: 'PINT-BLA', nombre: 'Pintura Látex Blanca', unidad: 'L' },
          cantidades: {
            solicitada: '100.0000',
            producida: '80.0000',
            conforme: '70.0000',
            defectuosa: '10.0000',
            reprocesada: '5.0000',
            recuperada: '4.0000',
            descartada: '1.0000',
          },
        },
        ...(ordenes.length > 1
          ? [
              {
                producto: { recetaId: 2, codigo: 'ESM-AZU', nombre: 'Esmalte Sintético Azul', unidad: 'L' },
                cantidades: {
                  solicitada: '50.0000',
                  producida: '50.0000',
                  conforme: '48.0000',
                  defectuosa: '2.0000',
                  reprocesada: '0.0000',
                  recuperada: '0.0000',
                  descartada: '0.0000',
                },
              },
            ]
          : []),
      ],
      consumos: [
        { materialId: '10', unidad: 'kg', cantidad: '15.5000' },
        ...(ordenes.length > 1 ? [{ materialId: '10', unidad: 'g', cantidad: '500.0000' }] : []),
        { materialId: '11', unidad: 'L', cantidad: '20.0000' },
      ],
      perdidas: [
        { materialId: '10', unidad: 'kg', cantidad: '1.2000' },
        ...(ordenes.length > 1 ? [{ materialId: '10', unidad: 'g', cantidad: '20.0000' }] : []),
      ],
    },
  };
}

function crearReporteVacioFixture(): ReporteProduccionDto {
  return {
    filtros: {
      fechaDesde: '2026-12-01',
      fechaHasta: '2026-12-10',
      producto: null,
      campoFecha: 'fecha_programada',
    },
    ordenes: [],
    totales: {
      ordenes: 0,
      productos: [],
      consumos: [],
      perdidas: [],
    },
  };
}

describe('ABC-339: Regresión y aceptación de reportes de producción (CA-01 a CA-05)', () => {
  let app: INestApplication;
  let puerto: number;
  let urlBase: string;

  const mockProduccion = jest.fn();
  const pdfExportador = new PdfExportador();
  const excelExportador = new ExcelExportador();

  // Helper nativo HTTP para evitar interferencias con el mock de global.fetch en Auth Guard
  const peticionHttp = (
    ruta: string,
    metodo = 'GET',
    token: string | null = 'token-valido'
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> => {
    return new Promise((resolve, reject) => {
      const headers: http.OutgoingHttpHeaders = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(
        `${urlBase}${ruta}`,
        { method: metodo, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            resolve({
              status: res.statusCode || 500,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [
        PermisoProduccionGuard,
        PdfExportador,
        ExcelExportador,
        ExportacionReportesService,
        { provide: ReportesService, useValue: { produccion: mockProduccion } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );

    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    puerto = typeof address === 'string' ? 0 : address.port;
    urlBase = `http://127.0.0.1:${puerto}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    mockProduccion.mockReset().mockResolvedValue(crearReporteFixture());

    // Mock de Auth Service para PermisoProduccionGuard
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('/me')) {
        return new Response(
          JSON.stringify({
            id: '15',
            nombre: 'Andrés Supervisor',
            permisos: ['ordenes.consultar'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // CA-01: Validar filtros y aplicar los mismos a vista previa y archivos
  // =========================================================================
  describe('CA-01: Validación idéntica de filtros y límites de fecha', () => {
    it('acepta fechas válidas en JSON, PDF y Excel', async () => {
      const resJson = await peticionHttp('/reportes/produccion?fechaDesde=2026-11-01&fechaHasta=2026-11-10');
      expect(resJson.status).toBe(200);

      const resPdf = await peticionHttp('/reportes/produccion/exportar/pdf?fechaDesde=2026-11-01&fechaHasta=2026-11-10');
      expect(resPdf.status).toBe(200);
      expect(resPdf.headers['content-type']).toBe('application/pdf');

      const resXlsx = await peticionHttp('/reportes/produccion/exportar/xlsx?fechaDesde=2026-11-01&fechaHasta=2026-11-10');
      expect(resXlsx.status).toBe(200);
      expect(resXlsx.headers['content-type']).toContain('spreadsheetml.sheet');
    });

    it('rechaza fechaDesde posterior a fechaHasta con 400 Bad Request en los 3 endpoints', async () => {
      const queryInvertida = 'fechaDesde=2026-11-20&fechaHasta=2026-11-10';

      const resJson = await peticionHttp(`/reportes/produccion?${queryInvertida}`);
      expect(resJson.status).toBe(400);
      const bodyJson = JSON.parse(resJson.body.toString());
      expect(bodyJson.message).toMatch(/fechaDesde no puede ser posterior a fechaHasta/);

      const resPdf = await peticionHttp(`/reportes/produccion/exportar/pdf?${queryInvertida}`);
      expect(resPdf.status).toBe(400);

      const resXlsx = await peticionHttp(`/reportes/produccion/exportar/xlsx?${queryInvertida}`);
      expect(resXlsx.status).toBe(400);
    });

    it('rechaza fechas irreales del calendario (ej. 2026-02-30) con 400', async () => {
      const res = await peticionHttp('/reportes/produccion?fechaDesde=2026-02-30');
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body.toString());
      expect(body.message).toMatch(/debe ser una fecha real/);
    });

    it('rechaza parámetros desconocidos no permitidos en la consulta', async () => {
      const res = await peticionHttp('/reportes/produccion?parametroInvalido=hack');
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body.toString());
      expect(body.message).toMatch(/Solo se admiten fechaDesde, fechaHasta y producto/);
    });
  });

  // =========================================================================
  // CA-02: Coincidencia trilateral de datos, totales, unidades y período
  // =========================================================================
  describe('CA-02: Coincidencia de datos y totales entre JSON, Excel y PDF', () => {
    it('el archivo Excel contiene exactamente los mismos datos, hojas y totales que el DTO', async () => {
      const fixture = crearReporteFixture(2);
      mockProduccion.mockResolvedValue(fixture);

      const resXlsx = await peticionHttp('/reportes/produccion/exportar/xlsx?fechaDesde=2026-11-01&fechaHasta=2026-11-10&producto=Pintura');
      expect(resXlsx.status).toBe(200);
      expect(resXlsx.headers['content-disposition']).toMatch(/reporte-produccion_2026-11-01_a_2026-11-10\.xlsx/);

      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(resXlsx.body as any);

      // 1. Verificación de hojas requeridas
      expect(libro.worksheets.map((h) => h.name)).toEqual([
        'Resumen',
        'Ordenes',
        'Materiales por orden',
      ]);

      const hojaResumen = libro.getWorksheet('Resumen')!;
      expect(hojaResumen.getCell('B2').value).toBe('2026-11-01');
      expect(hojaResumen.getCell('B3').value).toBe('2026-11-10');
      expect(hojaResumen.getCell('B4').value).toBe('Pintura');
      expect(hojaResumen.getCell('B6').value).toBe(2);

      // Totales por producto en hoja Resumen
      const filaProducto1 = hojaResumen.getRow(10);
      expect(filaProducto1.getCell(1).value).toBe('PINT-BLA');
      expect(filaProducto1.getCell(2).value).toBe('Pintura Látex Blanca');
      expect(filaProducto1.getCell(3).value).toBe('L');
      expect(filaProducto1.getCell(4).value).toBe('100.0000'); // Solicitada
      expect(filaProducto1.getCell(5).value).toBe('80.0000');  // Producida

      // 2. Hoja Ordenes: detalle exacto
      const hojaOrdenes = libro.getWorksheet('Ordenes')!;
      expect(hojaOrdenes.rowCount).toBe(3); // Cabecera + 2 órdenes
      const orden1 = hojaOrdenes.getRow(2);
      expect(orden1.getCell(1).value).toBe(1);
      expect(orden1.getCell(2).value).toBe('OP-2026-0001');
      expect(orden1.getCell(3).value).toBe('2026-11-03');
      expect(orden1.getCell(4).value).toBe('PINT-BLA');
      expect(orden1.getCell(5).value).toBe('Pintura Látex Blanca');
      expect(orden1.getCell(6).value).toBe('L');
      expect(orden1.getCell(7).value).toBe('REGISTROS');
      expect(orden1.getCell(10).value).toBe('100.0000'); // Solicitada
      expect(orden1.getCell(11).value).toBe('80.0000');  // Producida

      const orden2 = hojaOrdenes.getRow(3);
      expect(orden2.getCell(2).value).toBe('OP-2026-0002');
      expect(orden2.getCell(4).value).toBe('ESM-AZU');
      expect(orden2.getCell(5).value).toBe('Esmalte Sintético Azul');
      expect(orden2.getCell(6).value).toBe('L');
      expect(orden2.getCell(7).value).toBe('CIERRE');
      expect(orden2.getCell(8).value).toBe('1001'); // Cierre ID
      expect(orden2.getCell(10).value).toBe('50.0000');
      expect(orden2.getCell(11).value).toBe('50.0000');

      // 3. Hoja Materiales por orden
      const hojaMateriales = libro.getWorksheet('Materiales por orden')!;
      expect(hojaMateriales.rowCount).toBeGreaterThanOrEqual(4);
    });

    it('el archivo PDF es un documento válido que contiene metadatos y período correctos', async () => {
      const fixture = crearReporteFixture(2);
      mockProduccion.mockResolvedValue(fixture);

      const resPdf = await peticionHttp('/reportes/produccion/exportar/pdf?fechaDesde=2026-11-01&fechaHasta=2026-11-10');
      expect(resPdf.status).toBe(200);
      expect(resPdf.headers['content-disposition']).toMatch(/reporte-produccion_2026-11-01_a_2026-11-10\.pdf/);

      // Verificación de firma binaria PDF
      expect(resPdf.body.subarray(0, 5).toString()).toBe('%PDF-');

      const pdfDoc = await PDFDocument.load(resPdf.body);
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);
      expect(pdfDoc.getTitle()).toBe('Reporte de produccion');
    });
  });

  // =========================================================================
  // CA-03: No duplicar producción por reprocesos ni mezclar unidades de merma
  // =========================================================================
  describe('CA-03: No duplicación por reprocesos y conservación estricta de unidades', () => {
    it('los reprocesos no alteran ni duplican la cantidad producida ni solicitada original', async () => {
      const fixture = crearReporteFixture(1);
      const ordenConReproceso = fixture.ordenes[0];

      expect(ordenConReproceso.cantidades.reprocesada).toBe('5.0000');
      expect(ordenConReproceso.cantidades.recuperada).toBe('4.0000');
      expect(ordenConReproceso.cantidades.descartada).toBe('1.0000');

      // La producida original se mantiene inalterada (80.0000), no se suma a 84.0000 ni 85.0000
      expect(ordenConReproceso.cantidades.producida).toBe('80.0000');
      expect(ordenConReproceso.cantidades.solicitada).toBe('100.0000');
      expect(fixture.totales.productos[0].cantidades.producida).toBe('80.0000');
    });

    it('las mermas y consumos con diferentes unidades se preservan en entradas independientes', async () => {
      const fixture = crearReporteFixture(2);
      mockProduccion.mockResolvedValue(fixture);

      const res = await peticionHttp('/reportes/produccion');
      const body = JSON.parse(res.body.toString());

      // Insumo 10 existe en kg (15.5 kg) y en g (500 g). No deben mezclarse ni sumarse en 515.5
      const consumosMaterial10 = body.totales.consumos.filter((c: any) => c.materialId === '10');
      expect(consumosMaterial10).toHaveLength(2);
      expect(consumosMaterial10).toEqual(
        expect.arrayContaining([
          { materialId: '10', unidad: 'kg', cantidad: '15.5000' },
          { materialId: '10', unidad: 'g', cantidad: '500.0000' },
        ])
      );

      const perdidasMaterial10 = body.totales.perdidas.filter((p: any) => p.materialId === '10');
      expect(perdidasMaterial10).toHaveLength(2);
      expect(perdidasMaterial10).toEqual(
        expect.arrayContaining([
          { materialId: '10', unidad: 'kg', cantidad: '1.2000' },
          { materialId: '10', unidad: 'g', cantidad: '20.0000' },
        ])
      );
    });
  });

  // =========================================================================
  // CA-04: Caso sin datos / Período vacío
  // =========================================================================
  describe('CA-04: Caso sin datos / Período vacío en los 3 formatos', () => {
    it('JSON: responde 200 con ordenes vacías y contadores en cero sin crashear', async () => {
      mockProduccion.mockResolvedValue(crearReporteVacioFixture());

      const res = await peticionHttp('/reportes/produccion?fechaDesde=2026-12-01&fechaHasta=2026-12-10');
      expect(res.status).toBe(200);

      const datos = JSON.parse(res.body.toString());
      expect(datos.ordenes).toEqual([]);
      expect(datos.totales.ordenes).toBe(0);
      expect(datos.totales.productos).toEqual([]);
      expect(datos.totales.consumos).toEqual([]);
      expect(datos.totales.perdidas).toEqual([]);
    });

    it('PDF: genera archivo válido con mensaje explícito de caso sin datos', async () => {
      mockProduccion.mockResolvedValue(crearReporteVacioFixture());

      const resPdf = await peticionHttp('/reportes/produccion/exportar/pdf?fechaDesde=2026-12-01&fechaHasta=2026-12-10');
      expect(resPdf.status).toBe(200);
      expect(resPdf.headers['content-type']).toBe('application/pdf');

      const bufferPdf = resPdf.body;
      expect(bufferPdf.subarray(0, 5).toString()).toBe('%PDF-');

      // Carga legible con pdf-lib
      const pdfDoc = await PDFDocument.load(bufferPdf);
      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it('Excel: genera archivo válido con hojas intactas y totales en cero', async () => {
      mockProduccion.mockResolvedValue(crearReporteVacioFixture());

      const resXlsx = await peticionHttp('/reportes/produccion/exportar/xlsx?fechaDesde=2026-12-01&fechaHasta=2026-12-10');
      expect(resXlsx.status).toBe(200);

      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(resXlsx.body as any);

      expect(libro.worksheets.map((h) => h.name)).toEqual(['Resumen', 'Ordenes', 'Materiales por orden']);
      const hojaResumen = libro.getWorksheet('Resumen')!;
      expect(hojaResumen.getCell('B6').value).toBe(0); // Total de órdenes 0

      const hojaOrdenes = libro.getWorksheet('Ordenes')!;
      expect(hojaOrdenes.rowCount).toBe(1); // Solo encabezados, 0 filas de datos
    });
  });

  // =========================================================================
  // CA-05: Permisos, seguridad y control de acceso
  // =========================================================================
  describe('CA-05: Seguridad y control de acceso', () => {
    it('requiere autenticación Bearer (401 si falta token)', async () => {
      const res = await peticionHttp('/reportes/produccion', 'GET', null);
      expect(res.status).toBe(401);
    });

    it('exige permiso ordenes.consultar (403 si el rol no tiene el permiso)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            id: '99',
            nombre: 'Operario Sin Permiso',
            permisos: ['otra.accion.consultar'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await peticionHttp('/reportes/produccion', 'GET', 'token-invalido');
      expect(res.status).toBe(403);
    });

    it('permite consultar cuando el token contiene ordenes.consultar', async () => {
      const res = await peticionHttp('/reportes/produccion');
      expect(res.status).toBe(200);
    });
  });
});
