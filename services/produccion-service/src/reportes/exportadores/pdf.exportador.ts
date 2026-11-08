import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { MaterialReporteDto, OrdenReporteDto, ReporteProduccionDto } from '../dto/reporte-produccion.dto';

const CAMPOS = [
  ['Sol.', 'solicitada'], ['Prod.', 'producida'], ['Conf.', 'conforme'], ['Def.', 'defectuosa'],
  ['Reproc.', 'reprocesada'], ['Recup.', 'recuperada'], ['Desc.', 'descartada'],
] as const;
const MARGEN = 36;

@Injectable()
export class PdfExportador {
  generar(reporte: ReporteProduccionDto): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGEN, compress: false, info: { Title: 'Reporte de produccion' } });
      const partes: Buffer[] = [];
      doc.on('data', (parte) => partes.push(Buffer.from(parte)));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);

      this.encabezadoDocumento(doc, reporte);
      this.tablaOrdenes(doc, reporte);
      this.totales(doc, reporte);
      doc.end();
    });
  }

  private encabezadoDocumento(doc: PDFKit.PDFDocument, reporte: ReporteProduccionDto) {
    doc.font('Helvetica-Bold').fontSize(16).text('Reporte de produccion', { align: 'center' });
    doc.moveDown(0.5).font('Helvetica').fontSize(9);
    const desde = reporte.filtros.fechaDesde ?? 'Todos';
    const hasta = reporte.filtros.fechaHasta ?? 'Todos';
    doc.text(`Periodo: ${desde} a ${hasta}   |   Producto: ${reporte.filtros.producto ?? 'Todos'}   |   Ordenes: ${reporte.totales.ordenes}`);
    doc.moveDown(0.7);
  }

  private tablaOrdenes(doc: PDFKit.PDFDocument, reporte: ReporteProduccionDto) {
    const columnas = [58, 75, 113, 45, 56, 56, 56, 56, 56, 56, 56];
    const titulos = ['Fecha', 'Orden', 'Producto', 'Unidad', ...CAMPOS.map(([titulo]) => titulo)];
    const altoEncabezado = 22;
    const dibujarEncabezado = () => {
      let x = MARGEN;
      const y = doc.y;
      doc.rect(MARGEN, y, columnas.reduce((a, b) => a + b, 0), altoEncabezado).fill('#1F4E78');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
      titulos.forEach((titulo, indice) => { doc.text(titulo, x + 3, y + 7, { width: columnas[indice] - 6, align: indice >= 4 ? 'right' : 'left' }); x += columnas[indice]; });
      doc.fillColor('#000000');
      doc.y = y + altoEncabezado;
    };
    const nuevaPagina = () => {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGEN });
      doc.font('Helvetica-Bold').fontSize(10).text('Reporte de produccion - continuacion');
      doc.moveDown(0.4);
      dibujarEncabezado();
    };
    dibujarEncabezado();
    if (reporte.ordenes.length === 0) {
      doc.font('Helvetica').fontSize(9).text('Sin datos para los filtros seleccionados.', MARGEN + 3, doc.y + 8);
      doc.moveDown(2);
      return;
    }
    reporte.ordenes.forEach((orden, indice) => {
      const materiales = this.resumenMateriales(orden);
      const alto = materiales ? 38 : 25;
      if (doc.y + alto > doc.page.height - MARGEN) nuevaPagina();
      const y = doc.y;
      if (indice % 2 === 1) doc.rect(MARGEN, y, columnas.reduce((a, b) => a + b, 0), alto).fill('#EDF3F8');
      doc.fillColor('#000000').font('Helvetica').fontSize(7);
      const valores = [
        orden.fechaProgramada, orden.codigo,
        `${orden.producto.codigo ?? '-'} - ${orden.producto.nombre ?? 'Sin producto'}`,
        orden.producto.unidad ?? '-', ...CAMPOS.map(([, campo]) => orden.cantidades[campo]),
      ];
      let x = MARGEN;
      valores.forEach((valor, columna) => {
        doc.text(String(valor), x + 3, y + 6, { width: columnas[columna] - 6, align: columna >= 4 ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += columnas[columna];
      });
      if (materiales) doc.fontSize(6.5).fillColor('#3F3F3F').text(materiales, MARGEN + 3, y + 23, { width: 720, lineBreak: false, ellipsis: true });
      doc.fillColor('#000000');
      doc.y = y + alto;
    });
  }

  private totales(doc: PDFKit.PDFDocument, reporte: ReporteProduccionDto) {
    const espacio = (alto: number) => {
      if (doc.y + alto > doc.page.height - MARGEN) doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGEN });
    };
    espacio(60);
    doc.moveDown(0.7).font('Helvetica-Bold').fontSize(11).text('Totales por producto');
    if (reporte.totales.productos.length === 0) doc.font('Helvetica').fontSize(8).text('Sin totales de producto.');
    for (const total of reporte.totales.productos) {
      espacio(18);
      const cantidades = CAMPOS.map(([titulo, campo]) => `${titulo} ${total.cantidades[campo]}`).join(' | ');
      doc.font('Helvetica').fontSize(8).text(`${total.producto.codigo ?? '-'} - ${total.producto.nombre ?? 'Sin producto'} (${total.producto.unidad ?? 'sin unidad'}): ${cantidades}`);
    }
    espacio(55);
    doc.moveDown(0.7).font('Helvetica-Bold').fontSize(11).text('Totales de materiales');
    doc.font('Helvetica').fontSize(8).text(`Consumos: ${this.materiales(reporte.totales.consumos) || 'Sin consumos'}`);
    doc.text(`Perdidas: ${this.materiales(reporte.totales.perdidas) || 'Sin perdidas'}`);
  }

  private resumenMateriales(orden: OrdenReporteDto): string {
    const partes: string[] = [];
    if (orden.consumos.length) partes.push(`Consumos: ${this.materiales(orden.consumos)}`);
    if (orden.perdidas.length) partes.push(`Perdidas: ${this.materiales(orden.perdidas)}`);
    return partes.join('   |   ');
  }

  private materiales(items: MaterialReporteDto[]): string {
    return items.map((item) => `${item.materialId}: ${item.cantidad} ${item.unidad}`).join(', ');
  }
}
