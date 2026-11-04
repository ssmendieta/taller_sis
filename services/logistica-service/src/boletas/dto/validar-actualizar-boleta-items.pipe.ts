import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ActualizarBoletaItemsDto } from './actualizar-boleta-items.dto';

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class ValidarActualizarBoletaItemsPipe implements PipeTransform<unknown, ActualizarBoletaItemsDto> {
  transform(value: unknown): ActualizarBoletaItemsDto {
    if (!objeto(value) || Object.keys(value).some((key) => key !== 'items')) {
      throw new BadRequestException('El cuerpo de la solicitud no es válido');
    }
    if (!Array.isArray(value.items) || value.items.length === 0) {
      throw new BadRequestException('La boleta debe incluir al menos un ítem');
    }
    const items = value.items.map((item) => {
      if (
        !objeto(item) ||
        typeof item.referencia === 'undefined' ||
        typeof item.cantidad === 'undefined' ||
        Object.keys(item).some((key) => !['referencia', 'cantidad'].includes(key))
      ) {
        throw new BadRequestException('Cada ítem debe incluir referencia y cantidad');
      }
      if (typeof item.referencia !== 'string' || !item.referencia.trim() || item.referencia.trim().length > 160) {
        throw new BadRequestException('La referencia del ítem es obligatoria y admite hasta 160 caracteres');
      }
      if (
        typeof item.cantidad !== 'string' ||
        !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(item.cantidad) ||
        /^0(?:\.0{1,4})?$/.test(item.cantidad)
      ) {
        throw new BadRequestException('La cantidad debe ser positiva y admitir hasta cuatro decimales');
      }
      const [entero, decimales = ''] = item.cantidad.split('.');
      return { referencia: item.referencia.trim(), cantidad: `${entero}.${decimales.padEnd(4, '0')}` };
    });
    return { items };
  }
}
