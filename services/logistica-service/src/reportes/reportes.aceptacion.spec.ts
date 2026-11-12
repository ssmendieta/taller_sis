import { Workbook } from 'exceljs';
import PDFKit = require('pdfkit');
import { PDFDocument } from 'pdf-lib';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { EstadoEntrega } from '../despacho/estado-entrega.enum';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { ReporteLogisticoQuery } from './dto/reporte-logistico.dto';
import { datosExportacion, SeccionReporte } from './exportadores/datos-exportacion';
import { generarExcel } from './exportadores/excel.exportador';
import { generarPdf } from './exportadores/pdf.exportador';
import { armarReporte } from './reporte-logistico';

const FILTROS: ReporteLogisticoQuery = {
  fechaDesde: '2026-11-01',
  fechaHasta: '2026-11-30',
  estadoRuta: EstadoRuta.COMPLETADA,
  estadoBoleta: null,
};
const GENERADO_EN = '2026-11-11T14:30:00.000Z';

function reporteAceptacion() {
  return armarReporte(FILTROS, {
    rutas: [{
      id: 'R-343', fecha_programada: '2026-11-30', estado: EstadoRuta.COMPLETADA,
      vehiculo_externo_id: 'VEH-343', chofer_externo_id: 'CHO-343',
    }],
    paradas: [{ id: 'P-343', ruta_id: 'R-343', estado_entrega: EstadoEntrega.ENTREGADA }],
    documentosRuta: [
      { parada_id: 'P-343', boleta_id: 'B-1', estado: EstadoBoleta.EMITIDA },
      { parada_id: 'P-343', boleta_id: 'B-2', estado: EstadoBoleta.ANULADA },
    ],
    incidencias: [{ ruta_id: 'R-343', tipo: 'RETRASO' as never, total: 2 }],
    reprogramaciones: [{ ruta_id: 'R-343', total: 1 }],
    boletas: [
      { id: 'B-1', numero: 'BOL-LIMITE-DESDE', fecha: '2026-11-01', estado: EstadoBoleta.EMITIDA, orden_id: 'O-1' },
      { id: 'B-2', numero: 'BOL-LIMITE-HASTA', fecha: '2026-11-30', estado: EstadoBoleta.ANULADA, orden_id: 'O-2' },
    ],
    itemsBoleta: [
      { boleta_id: 'B-1', items: 2, cantidad: '12.5000' },
      { boleta_id: 'B-2', items: 3, cantidad: '99.0000' },
    ],
    ubicacionBoletas: [
      { boleta_id: 'B-1', ruta_id: 'R-343', estado_ruta: EstadoRuta.COMPLETADA, estado_entrega: EstadoEntrega.ENTREGADA },
      { boleta_id: 'B-2', ruta_id: 'R-343', estado_ruta: EstadoRuta.COMPLETADA, estado_entrega: EstadoEntrega.ENTREGADA },
    ],
    unidades: new Map([['O-1', 'kg'], ['O-2', 'kg']]),
  }, new Date(GENERADO_EN));
}

function valoresExcel(hoja: ReturnType<Workbook['getWorksheet']>, fila: number, columnas: number) {
  return Array.from({ length: columnas }, (_, indice) => hoja!.getCell(fila, indice + 1).value);
}

async function comprobarExcel(secciones: SeccionReporte[], archivo: Buffer) {
  const libro = new Workbook();
  await libro.xlsx.load(archivo.buffer.slice(archivo.byteOffset, archivo.byteOffset + archivo.byteLength) as ArrayBuffer);
  expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(secciones.map((seccion) => seccion.titulo));
  for (const seccion of secciones) {
    const hoja = libro.getWorksheet(seccion.titulo)!;
    expect(valoresExcel(hoja, 1, seccion.columnas.length)).toEqual(seccion.columnas.map((columna) => columna.titulo));
    seccion.filas.forEach((fila, indice) => {
      expect(valoresExcel(hoja, indice + 2, seccion.columnas.length)).toEqual(fila);
    });
  }
}

describe('ABC-343: criterios de aceptación y regresión de reportes logísticos', () => {
  it('vista previa, PDF y Excel conservan los mismos filtros, límites, totales, estados y unidades (CA-01 a CA-04)', async () => {
    const vistaPrevia = reporteAceptacion();

    expect(vistaPrevia.filtros).toEqual(FILTROS);
    expect(vistaPrevia.boletas.map((boleta) => ({
      numero: boleta.numero, fecha: boleta.fecha, estado: boleta.estado,
      cantidad: boleta.cantidadTotal, unidad: boleta.unidad, entregada: boleta.entregada,
    }))).toEqual([
      { numero: 'BOL-LIMITE-DESDE', fecha: '2026-11-01', estado: 'EMITIDA', cantidad: '12.5000', unidad: 'kg', entregada: true },
      { numero: 'BOL-LIMITE-HASTA', fecha: '2026-11-30', estado: 'ANULADA', cantidad: '99.0000', unidad: 'kg', entregada: false },
    ]);
    expect(vistaPrevia.resumen.boletas).toMatchObject({
      total: 2, entregadas: 1, cantidadEmitidaPorUnidad: { kg: '12.5000' },
    });
    expect(vistaPrevia.rutas[0]).toMatchObject({
      boletas: { total: 2, emitidas: 1, anuladas: 1, entregadas: 1 },
      incidencias: 2, reprogramaciones: 1,
    });

    // Los dos exportadores reciben exactamente la misma proyección de la vista previa.
    const secciones = datosExportacion(vistaPrevia);
    await comprobarExcel(secciones, await generarExcel(secciones, vistaPrevia.generadoEn));

    const textoPdf = jest.spyOn(PDFKit.prototype, 'text');
    try {
      const archivoPdf = await generarPdf(secciones, vistaPrevia.generadoEn);
      const documento = await PDFDocument.load(archivoPdf);
      expect(documento.getTitle()).toBe('Reporte logístico');
      const textosRenderizados = textoPdf.mock.calls.map(([texto]) => String(texto));
      for (const seccion of secciones) {
        expect(textosRenderizados).toContain(seccion.titulo);
        for (const columna of seccion.columnas) expect(textosRenderizados).toContain(columna.titulo);
        for (const fila of seccion.filas) {
          for (const celda of fila) expect(textosRenderizados).toContain(String(celda));
        }
      }
    } finally {
      textoPdf.mockRestore();
    }
  });

  it('el caso vacío genera archivos legibles e informa que no existen registros (CA-05)', async () => {
    const vacio = armarReporte(FILTROS, {
      rutas: [], paradas: [], documentosRuta: [], incidencias: [], reprogramaciones: [],
      boletas: [], itemsBoleta: [], ubicacionBoletas: [], unidades: new Map(),
    }, new Date(GENERADO_EN));
    const secciones = datosExportacion(vacio);
    const excel = new Workbook();
    const archivoExcel = await generarExcel(secciones, vacio.generadoEn);
    await excel.xlsx.load(archivoExcel.buffer.slice(
      archivoExcel.byteOffset, archivoExcel.byteOffset + archivoExcel.byteLength,
    ) as ArrayBuffer);
    expect(excel.getWorksheet('Rutas')!.getCell('A2').value).toBe('Sin registros para los filtros aplicados.');
    expect(excel.getWorksheet('Boletas')!.getCell('A2').value).toBe('Sin registros para los filtros aplicados.');

    const textoPdf = jest.spyOn(PDFKit.prototype, 'text');
    try {
      await expect(generarPdf(secciones, vacio.generadoEn)).resolves.toBeInstanceOf(Buffer);
      expect(textoPdf.mock.calls.map(([texto]) => String(texto)))
        .toContain('Sin registros para los filtros aplicados.');
    } finally {
      textoPdf.mockRestore();
    }
  });
});
