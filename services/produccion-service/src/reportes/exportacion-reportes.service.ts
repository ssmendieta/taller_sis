import { Injectable } from '@nestjs/common';
import { ReporteProduccionQueryDto } from './dto/reporte-produccion.dto';
import { ExcelExportador } from './exportadores/excel.exportador';
import { PdfExportador } from './exportadores/pdf.exportador';
import { ReportesService } from './reportes.service';

export enum FormatoExportacion {
  PDF = 'pdf',
  EXCEL = 'xlsx',
}

export interface ArchivoReporte {
  contenido: Buffer;
  nombre: string;
  mime: string;
}

@Injectable()
export class ExportacionReportesService {
  constructor(
    private readonly reportes: ReportesService,
    private readonly pdf: PdfExportador,
    private readonly excel: ExcelExportador,
  ) {}

  async exportar(query: ReporteProduccionQueryDto, formato: FormatoExportacion): Promise<ArchivoReporte> {
    const reporte = await this.reportes.produccion(query);
    const periodo = `${reporte.filtros.fechaDesde ?? 'todos'}_a_${reporte.filtros.fechaHasta ?? 'todos'}`;
    if (formato === FormatoExportacion.PDF) {
      return { contenido: await this.pdf.generar(reporte), nombre: `reporte-produccion_${periodo}.pdf`, mime: 'application/pdf' };
    }
    return {
      contenido: await this.excel.generar(reporte), nombre: `reporte-produccion_${periodo}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
