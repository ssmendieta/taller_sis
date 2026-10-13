import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { CrearBoletaDto } from './crear-boleta.dto';

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function idPositivo(value: unknown, campo: string): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) < BigInt('1') || BigInt(value) > BigInt('9223372036854775807')) {
    throw new BadRequestException(`${campo} debe ser un entero positivo enviado como texto`);
  }
  return value;
}

@Injectable()
export class ValidarBoletaPipe implements PipeTransform<unknown, CrearBoletaDto> {
  transform(value: unknown): CrearBoletaDto {
    if (!objeto(value) || Object.keys(value).some((key) => !['solicitudSalidaId', 'items'].includes(key))) {
      throw new BadRequestException('El cuerpo de la boleta no es válido');
    }
    const solicitudSalidaId = idPositivo(value.solicitudSalidaId, 'solicitudSalidaId');
    if (!Array.isArray(value.items) || value.items.length === 0) {
      throw new BadRequestException('La boleta debe incluir al menos un ítem');
    }
    const items = value.items.map((item) => {
      if (!objeto(item) || Object.keys(item).some((key) => !['referencia', 'cantidad'].includes(key))) {
        throw new BadRequestException('Cada ítem debe incluir referencia y cantidad');
      }
      if (typeof item.referencia !== 'string' || !item.referencia.trim() || item.referencia.trim().length > 160) {
        throw new BadRequestException('La referencia del ítem es obligatoria y admite hasta 160 caracteres');
      }
      if (typeof item.cantidad !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(item.cantidad) || /^0(?:\.0{1,4})?$/.test(item.cantidad)) {
        throw new BadRequestException('La cantidad debe ser positiva y admitir hasta cuatro decimales');
      }
      const [entero, decimales = ''] = item.cantidad.split('.');
      return { referencia: item.referencia.trim(), cantidad: `${entero}.${decimales.padEnd(4, '0')}` };
    });
    return { solicitudSalidaId, items };
  }
}
