import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ConsultaRecursosQuery } from './consulta-recursos.dto';
import { UNIDADES_CAPACIDAD_V1, UnidadCapacidadV1 } from './recursos-logisticos-v1';
import { diezmilesimas, esFechaValida } from './recursos-logisticos-v1.validator';

const PERMITIDOS = ['fecha', 'disponible', 'capacidadMinima', 'unidad'];
// Mismo formato que la capacidad del contrato: hasta 10 enteros y 4 decimales.
const DECIMAL = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;

@Injectable()
export class ValidarConsultaRecursosPipe implements PipeTransform<unknown, ConsultaRecursosQuery> {
  transform(value: unknown): ConsultaRecursosQuery {
    const query = typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
    for (const clave of Object.keys(query)) {
      if (!PERMITIDOS.includes(clave)) throw new BadRequestException(`Parámetro de consulta no permitido: ${clave}`);
    }
    const texto = (clave: string): string => {
      const valor = query[clave];
      if (valor === undefined) return '';
      if (typeof valor !== 'string') throw new BadRequestException(`${clave} debe enviarse una sola vez`);
      return valor.trim();
    };

    const fecha = texto('fecha');
    if (!esFechaValida(fecha)) throw new BadRequestException('fecha es obligatoria y debe ser una fecha AAAA-MM-DD válida');

    const disponibleTexto = texto('disponible');
    if (!['', 'true', 'false'].includes(disponibleTexto)) throw new BadRequestException('disponible debe ser true o false');
    const disponible = disponibleTexto === '' ? null : disponibleTexto === 'true';

    const capacidad = texto('capacidadMinima');
    const unidad = texto('unidad');
    if (!capacidad && !unidad) return { fecha, disponible, capacidadMinima: null };
    if (!capacidad || !unidad) throw new BadRequestException('capacidadMinima y unidad deben enviarse juntas');
    if (!DECIMAL.test(capacidad) || diezmilesimas(capacidad) === BigInt(0)) {
      throw new BadRequestException('capacidadMinima debe ser mayor que 0, con hasta 10 enteros y 4 decimales');
    }
    if (!(UNIDADES_CAPACIDAD_V1 as readonly string[]).includes(unidad)) {
      throw new BadRequestException(`unidad debe ser una de: ${UNIDADES_CAPACIDAD_V1.join(', ')}`);
    }
    const [entero, decimales = ''] = capacidad.split('.');
    return {
      fecha,
      disponible,
      capacidadMinima: { valor: `${entero}.${decimales.padEnd(4, '0')}`, unidad: unidad as UnidadCapacidadV1 },
    };
  }
}
