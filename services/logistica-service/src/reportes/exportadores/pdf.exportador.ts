import PDFDocument = require('pdfkit');
import { CeldaReporte, SeccionReporte } from './datos-exportacion';

const MARGEN = 36;
const SEPARACION = 4;

export function generarPdf(secciones: SeccionReporte[], generadoEn: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGEN, bufferPages: true,
      info: { Title: 'Reporte logístico', CreationDate: new Date(generadoEn) } });
    const partes: Buffer[] = [];
    doc.on('data', (parte) => partes.push(Buffer.from(parte)));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const ancho = doc.page.width - 2 * MARGEN;
    const limite = () => doc.page.height - MARGEN - 18;
    const encabezadoDocumento = () => {
      doc.fillColor('#1F4E78').font('Helvetica-Bold').fontSize(16).text('Reporte logístico', MARGEN, MARGEN);
      doc.moveDown(0.5);
    };
    const nuevaPagina = () => { doc.addPage(); encabezadoDocumento(); };
    encabezadoDocumento();

    for (const seccion of secciones) {
      const pesos = seccion.columnas.reduce((suma, c) => suma + c.peso, 0);
      const anchos = seccion.columnas.map((c) => ancho * c.peso / pesos);
      const titulos = seccion.columnas.map((c) => c.titulo);
      const estilo = (encabezado: boolean) => doc.font(encabezado ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      const altoFila = (valores: CeldaReporte[], encabezado = false) => {
        estilo(encabezado);
        return Math.max(...valores.map((valor, i) => doc.heightOfString(String(valor), { width: anchos[i] - 2 * SEPARACION }))) + 2 * SEPARACION;
      };
      const fila = (valores: CeldaReporte[], fondo: string, encabezado = false) => {
        const y = doc.y;
        const alto = altoFila(valores, encabezado);
        doc.rect(MARGEN, y, ancho, alto).fill(fondo);
        doc.fillColor(encabezado ? '#FFFFFF' : '#17212B');
        let x = MARGEN;
        valores.forEach((valor, i) => {
          doc.text(String(valor), x + SEPARACION, y + SEPARACION, { width: anchos[i] - 2 * SEPARACION });
          x += anchos[i];
        });
        doc.x = MARGEN;
        doc.y = y + alto;
      };
      const encabezadoTabla = () => {
        doc.fillColor('#17212B').font('Helvetica-Bold').fontSize(11).text(seccion.titulo, MARGEN, doc.y);
        doc.moveDown(0.3);
        fila(titulos, '#1F4E78', true);
      };
      const altoInicial = 26 + altoFila(titulos, true) + (seccion.filas.length ? altoFila(seccion.filas[0]) : 18);
      if (doc.y + altoInicial > limite()) nuevaPagina();
      encabezadoTabla();
      if (!seccion.filas.length) {
        doc.fillColor('#17212B').font('Helvetica').fontSize(9).text('Sin registros para los filtros aplicados.', MARGEN, doc.y + 5);
      }
      seccion.filas.forEach((valores, i) => {
        if (doc.y + altoFila(valores) > limite()) { nuevaPagina(); encabezadoTabla(); }
        fila(valores, i % 2 ? '#EDF3F8' : '#FFFFFF');
      });
      doc.moveDown(1);
    }

    const paginas = doc.bufferedPageRange();
    for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#495765').text(`Página ${i + 1} de ${paginas.count}`, MARGEN,
        doc.page.height - MARGEN - 10, { width: ancho, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
