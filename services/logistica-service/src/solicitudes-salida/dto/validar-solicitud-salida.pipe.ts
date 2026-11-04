import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { CrearSolicitudSalidaDto } from './crear-solicitud-salida.dto';

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class ValidarSolicitudSalidaPipe implements PipeTransform<unknown, CrearSolicitudSalidaDto> {
  transform(value: unknown): CrearSolicitudSalidaDto {
    if (!objeto(value)) throw new BadRequestException('El cuerpo debe ser un objeto');
    const allowed = ['ordenId', 'destinoDocumental', 'motivo', 'items'];
    if (Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new BadRequestException('El cuerpo contiene campos no permitidos');
    }

    if (typeof value.ordenId !== 'string') {
      throw new BadRequestException('ordenId debe enviarse como texto entero para conservar su precisión');
    }
    const ordenId = value.ordenId;
    if (!/^\d+$/.test(ordenId) || BigInt(ordenId) < BigInt('1') || BigInt(ordenId) > BigInt('9223372036854775807')) {
      throw new BadRequestException('ordenId debe ser un entero positivo válido');
    }
    if (typeof value.destinoDocumental !== 'string' || !value.destinoDocumental.trim() ||
        value.destinoDocumental.trim().length > 250) {
      throw new BadRequestException('El destino documental es obligatorio y admite hasta 250 caracteres');
    }
    if (typeof value.motivo !== 'string' || !value.motivo.trim() || value.motivo.trim().length > 500) {
      throw new BadRequestException('El motivo es obligatorio y admite hasta 500 caracteres');
    }
    if (!Array.isArray(value.items) || value.items.length === 0) {
      throw new BadRequestException('La solicitud debe incluir al menos un ítem');
    }
    const items = value.items.map((item) => {
      if (!objeto(item) || Object.keys(item).some((key) => !['referencia', 'cantidad'].includes(key))) {
        throw new BadRequestException('Cada ítem debe incluir solo referencia y cantidad');
      }
      if (typeof item.referencia !== 'string' || !item.referencia.trim() || item.referencia.trim().length > 160) {
        throw new BadRequestException('La referencia del ítem es obligatoria y admite hasta 160 caracteres');
      }
      if (typeof item.cantidad !== 'string') {
        throw new BadRequestException('La cantidad debe enviarse como texto decimal para conservar su precisión');
      }
      const cantidad = item.cantidad;
      if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(cantidad) || /^0(?:\.0{1,4})?$/.test(cantidad)) {
        throw new BadRequestException('La cantidad debe ser positiva y admitir hasta cuatro decimales');
      }
      const [entero, decimales = ''] = cantidad.split('.');
      return { referencia: item.referencia.trim(), cantidad: `${entero}.${decimales.padEnd(4, '0')}` };
    });

    return {
      ordenId,
      destinoDocumental: value.destinoDocumental.trim(),
      motivo: value.motivo.trim(),
      items,
    };
  }
}
