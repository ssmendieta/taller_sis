import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ValidarListarHistorialOrdenesPipe } from '../../historial/dto/validar-listar-historial-ordenes.pipe';
import { ReporteProduccionQueryDto } from './reporte-produccion.dto';

@Injectable()
export class ValidarReporteProduccionPipe implements PipeTransform<unknown, ReporteProduccionQueryDto> {
  transform(value: unknown): ReporteProduccionQueryDto {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some((key) => !['fechaDesde', 'fechaHasta', 'producto'].includes(key))) {
      throw new BadRequestException('Solo se admiten fechaDesde, fechaHasta y producto');
    }
    // Mantener las mismas reglas de fechas y texto literal que ABC-332.
    const { fechaDesde, fechaHasta, producto } = new ValidarListarHistorialOrdenesPipe().transform(value);
    return { fechaDesde, fechaHasta, producto };
  }
}
