import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { EstadoBoleta } from '../../boletas/entities/estado-boleta.enum';
import { esFechaValida } from '../../recursos-externos/dto/recursos-logisticos-v1.validator';
import { EstadoRuta } from '../../rutas/entities/estado-ruta.enum';
import { ReporteLogisticoQuery } from './reporte-logistico.dto';

const PERMITIDOS = ['fechaDesde', 'fechaHasta', 'estadoRuta', 'estadoBoleta'];
export const MAX_DIAS_REPORTE = 366;

@Injectable()
export class ValidarReporteLogisticoPipe implements PipeTransform<unknown, ReporteLogisticoQuery> {
  transform(value: unknown): ReporteLogisticoQuery {
    const query = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
    for (const clave of Object.keys(query)) {
      if (!PERMITIDOS.includes(clave)) throw new BadRequestException(`Parámetro de consulta no permitido: ${clave}`);
    }
    const texto = (clave: string): string => {
      const valor = query[clave];
      if (valor === undefined) return '';
      if (typeof valor !== 'string') throw new BadRequestException(`${clave} debe enviarse una sola vez`);
      return valor.trim();
    };

    const fechaDesde = texto('fechaDesde');
    const fechaHasta = texto('fechaHasta');
    if (!esFechaValida(fechaDesde) || !esFechaValida(fechaHasta)) {
      throw new BadRequestException('fechaDesde y fechaHasta son obligatorias con formato AAAA-MM-DD válido');
    }
    if (fechaDesde > fechaHasta) throw new BadRequestException('fechaDesde no puede ser posterior a fechaHasta');
    const dias = (Date.parse(`${fechaHasta}T00:00:00Z`) - Date.parse(`${fechaDesde}T00:00:00Z`)) / 86400000 + 1;
    if (dias > MAX_DIAS_REPORTE) throw new BadRequestException(`El período no puede superar ${MAX_DIAS_REPORTE} días`);

    const estadoRuta = texto('estadoRuta') || null;
    if (estadoRuta && !(Object.values(EstadoRuta) as string[]).includes(estadoRuta)) {
      throw new BadRequestException(`estadoRuta debe ser uno de: ${Object.values(EstadoRuta).join(', ')}`);
    }
    const estadoBoleta = texto('estadoBoleta') || null;
    if (estadoBoleta && !(Object.values(EstadoBoleta) as string[]).includes(estadoBoleta)) {
      throw new BadRequestException(`estadoBoleta debe ser uno de: ${Object.values(EstadoBoleta).join(', ')}`);
    }
    return { fechaDesde, fechaHasta, estadoRuta: estadoRuta as EstadoRuta | null, estadoBoleta: estadoBoleta as EstadoBoleta | null };
  }
}
