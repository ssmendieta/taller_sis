import { Workbook } from 'exceljs';
import { SeccionReporte } from './datos-exportacion';

export async function generarExcel(secciones: SeccionReporte[], generadoEn: string): Promise<Buffer> {
  const libro = new Workbook();
  libro.creator = 'Taller de Sistemas - Logística';
  libro.created = new Date(generadoEn);
  for (const { titulo, columnas, filas } of secciones) {
    const hoja = libro.addWorksheet(titulo, { views: [{ state: 'frozen', ySplit: 1 }] });
    const encabezado = hoja.addRow(columnas.map((c) => c.titulo));
    encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    if (!filas.length) hoja.addRow(['Sin registros para los filtros aplicados.']);
    for (const valores of filas) hoja.addRow(valores);
    hoja.columns.forEach((columna, indice) => {
      let ancho = Math.max(12, columnas[indice].titulo.length + 2);
      columna.eachCell({ includeEmpty: false }, (celda) => {
        const lineas = String(celda.value ?? '').split('\n');
        for (const linea of lineas) ancho = Math.max(ancho, linea.length + 2);
      });
      columna.width = Math.min(titulo === 'Resumen' ? 72 : 32, ancho);
    });
    hoja.eachRow((fila) => {
      fila.alignment = { vertical: 'top', wrapText: true };
      let lineas = 1;
      fila.eachCell((celda, indice) => {
        const ancho = Math.max(1, (hoja.getColumn(indice).width ?? 12) - 2);
        lineas = Math.max(lineas, String(celda.value ?? '').split('\n').reduce((total, linea) => total + Math.max(1, Math.ceil(linea.length / ancho)), 0));
      });
      fila.height = 16 * lineas + 4;
    });
    if (titulo !== 'Resumen' && filas.length) {
      hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    }
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}
