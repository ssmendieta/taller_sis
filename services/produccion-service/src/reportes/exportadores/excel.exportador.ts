import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReporteProduccionDto } from '../dto/reporte-produccion.dto';

const CAMPOS_CANTIDAD = [
  'solicitada', 'producida', 'conforme', 'defectuosa', 'reprocesada', 'recuperada', 'descartada',
] as const;

@Injectable()
export class ExcelExportador {
  async generar(reporte: ReporteProduccionDto): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Taller de Sistemas - Produccion';
    libro.created = new Date(0);
    libro.modified = new Date(0);

    this.crearResumen(libro, reporte);
    this.crearOrdenes(libro, reporte);
    this.crearMateriales(libro, reporte);

    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  private crearResumen(libro: ExcelJS.Workbook, reporte: ReporteProduccionDto) {
    const hoja = libro.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 6 }] });
    hoja.addRow(['Reporte de produccion']);
    hoja.addRow(['Fecha desde', reporte.filtros.fechaDesde ?? 'Todos']);
    hoja.addRow(['Fecha hasta', reporte.filtros.fechaHasta ?? 'Todos']);
    hoja.addRow(['Producto', reporte.filtros.producto ?? 'Todos']);
    hoja.addRow(['Campo de fecha', reporte.filtros.campoFecha]);
    hoja.addRow(['Total de ordenes', reporte.totales.ordenes]);
    hoja.addRow([]);
    hoja.addRow(['Totales por producto']);
    hoja.addRow(['Codigo', 'Producto', 'Unidad', ...CAMPOS_CANTIDAD]);
    for (const total of reporte.totales.productos) {
      hoja.addRow([
        total.producto.codigo ?? '', total.producto.nombre ?? '', total.producto.unidad ?? '',
        ...CAMPOS_CANTIDAD.map((campo) => total.cantidades[campo]),
      ]);
    }
    hoja.addRow([]);
    hoja.addRow(['Totales de materiales']);
    hoja.addRow(['Tipo', 'Material ID', 'Unidad', 'Cantidad']);
    for (const item of reporte.totales.consumos) hoja.addRow(['Consumo', item.materialId, item.unidad, item.cantidad]);
    for (const item of reporte.totales.perdidas) hoja.addRow(['Perdida', item.materialId, item.unidad, item.cantidad]);
    this.estilizar(hoja, [1, 8, 9, 12, 13]);
  }

  private crearOrdenes(libro: ExcelJS.Workbook, reporte: ReporteProduccionDto) {
    const hoja = libro.addWorksheet('Ordenes', { views: [{ state: 'frozen', ySplit: 1 }] });
    hoja.addRow([
      'Orden ID', 'Codigo', 'Fecha programada', 'Producto codigo', 'Producto', 'Unidad', 'Fuente',
      'Cierre ID', 'Cierre version', ...CAMPOS_CANTIDAD,
    ]);
    for (const orden of reporte.ordenes) {
      hoja.addRow([
        orden.ordenId, orden.codigo, orden.fechaProgramada, orden.producto.codigo ?? '',
        orden.producto.nombre ?? '', orden.producto.unidad ?? '', orden.fuente,
        orden.cierre?.id ?? '', orden.cierre?.version ?? '',
        ...CAMPOS_CANTIDAD.map((campo) => orden.cantidades[campo]),
      ]);
    }
    this.estilizar(hoja, [1]);
  }

  private crearMateriales(libro: ExcelJS.Workbook, reporte: ReporteProduccionDto) {
    const hoja = libro.addWorksheet('Materiales por orden', { views: [{ state: 'frozen', ySplit: 1 }] });
    hoja.addRow(['Orden ID', 'Codigo orden', 'Tipo', 'Material ID', 'Unidad', 'Cantidad']);
    for (const orden of reporte.ordenes) {
      for (const item of orden.consumos) hoja.addRow([orden.ordenId, orden.codigo, 'Consumo', item.materialId, item.unidad, item.cantidad]);
      for (const item of orden.perdidas) hoja.addRow([orden.ordenId, orden.codigo, 'Perdida', item.materialId, item.unidad, item.cantidad]);
    }
    this.estilizar(hoja, [1]);
  }

  private estilizar(hoja: ExcelJS.Worksheet, encabezados: number[]) {
    hoja.columns.forEach((columna) => {
      let ancho = 12;
      columna.eachCell({ includeEmpty: true }, (celda) => { ancho = Math.min(35, Math.max(ancho, String(celda.value ?? '').length + 2)); });
      columna.width = ancho;
    });
    for (const fila of encabezados) {
      hoja.getRow(fila).eachCell((celda) => {
        celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      });
    }
    hoja.eachRow((fila) => { fila.alignment = { vertical: 'middle' }; });
    hoja.autoFilter = hoja.name === 'Ordenes' || hoja.name === 'Materiales por orden'
      ? { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } }
      : undefined;
  }
}
