import * as ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { ReporteProduccionDto } from '../dto/reporte-produccion.dto';
import { ExcelExportador } from './excel.exportador';
import { PdfExportador } from './pdf.exportador';

function reporte(cantidadOrdenes = 1): ReporteProduccionDto {
  const cantidad = (valor: number) => valor.toFixed(4);
  const ordenes = Array.from({ length: cantidadOrdenes }, (_, indice) => ({
    ordenId: indice + 1,
    codigo: `ORD-${String(indice + 1).padStart(4, '0')}`,
    fechaProgramada: '2026-11-07',
    producto: { recetaId: 3, codigo: 'PAN-01', nombre: 'Pan integral', unidad: 'kg' },
    fuente: 'REGISTROS' as const,
    cierre: null,
    cantidades: {
      solicitada: '10.0000', producida: '8.0000', conforme: '6.0000', defectuosa: '2.0000',
      reprocesada: '1.0000', recuperada: '0.8000', descartada: '0.2000',
    },
    consumos: [{ materialId: '12', unidad: 'kg', cantidad: '3.0000' }],
    perdidas: [{ materialId: '12', unidad: 'kg', cantidad: '0.5000' }],
  }));
  return {
    filtros: { fechaDesde: '2026-11-01', fechaHasta: '2026-11-07', producto: 'pan', campoFecha: 'fecha_programada' },
    ordenes,
    totales: {
      ordenes: cantidadOrdenes,
      productos: [{ producto: ordenes[0]?.producto ?? { recetaId: 3, codigo: 'PAN-01', nombre: 'Pan integral', unidad: 'kg' },
        cantidades: { solicitada: cantidad(cantidadOrdenes * 10), producida: cantidad(cantidadOrdenes * 8),
          conforme: cantidad(cantidadOrdenes * 6), defectuosa: cantidad(cantidadOrdenes * 2),
          reprocesada: cantidad(cantidadOrdenes), recuperada: cantidad(cantidadOrdenes * 0.8),
          descartada: cantidad(cantidadOrdenes * 0.2) } }],
      consumos: [{ materialId: '12', unidad: 'kg', cantidad: cantidad(cantidadOrdenes * 3) }],
      perdidas: [{ materialId: '12', unidad: 'kg', cantidad: cantidad(cantidadOrdenes * 0.5) }],
    },
  };
}

describe('ABC-338: exportadores reales', () => {
  it('crea un XLSX que se abre y conserva filtros, unidades, detalle y totales', async () => {
    const contenido = await new ExcelExportador().generar(reporte());
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(contenido as any);

    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Resumen', 'Ordenes', 'Materiales por orden']);
    expect(libro.getWorksheet('Resumen')?.getCell('B2').value).toBe('2026-11-01');
    expect(libro.getWorksheet('Ordenes')?.getCell('F2').value).toBe('kg');
    expect(libro.getWorksheet('Ordenes')?.getCell('J2').value).toBe('10.0000');
    expect(libro.getWorksheet('Materiales por orden')?.getCell('F2').value).toBe('3.0000');
    expect(libro.getWorksheet('Resumen')?.getCell('D10').value).toBe('10.0000');
  });

  it('crea un PDF válido y pagina un reporte extenso', async () => {
    const contenido = await new PdfExportador().generar(reporte(45));
    expect(contenido.subarray(0, 5).toString()).toBe('%PDF-');
    const documento = await PDFDocument.load(contenido);
    expect(documento.getPageCount()).toBeGreaterThan(1);
  });

  it.each([0, 1])('ambos formatos se abren con %s ordenes', async (cantidadOrdenes) => {
    const datos = reporte(cantidadOrdenes);
    const [pdf, xlsx] = await Promise.all([new PdfExportador().generar(datos), new ExcelExportador().generar(datos)]);
    await expect(PDFDocument.load(pdf)).resolves.toBeDefined();
    const libro = new ExcelJS.Workbook();
    await expect(libro.xlsx.load(xlsx as any)).resolves.toBeDefined();
  });
});
