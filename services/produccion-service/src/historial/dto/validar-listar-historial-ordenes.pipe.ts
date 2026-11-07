import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { EstadoOrden } from '../../ordenes/estado-orden.enum';
import { ListarHistorialOrdenesDto } from './listar-historial-ordenes.dto';

@Injectable()
export class ValidarListarHistorialOrdenesPipe implements PipeTransform<unknown, ListarHistorialOrdenesDto> {
  transform(value: unknown): ListarHistorialOrdenesDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('La consulta debe ser un objeto');
    }
    const query = value as Record<string, unknown>;
    const permitidos = ['fechaDesde', 'fechaHasta', 'estado', 'producto', 'page', 'limit'];
    for (const [campo, valor] of Object.entries(query)) {
      if (!permitidos.includes(campo) || typeof valor !== 'string' || !valor.trim()) {
        throw new BadRequestException(`Parametro invalido: ${campo}`);
      }
    }
    const entero = (campo: string, defecto: number, maximo: number) => {
      if (query[campo] === undefined) return defecto;
      const texto = query[campo] as string;
      const numero = Number(texto);
      if (!/^[1-9]\d*$/.test(texto) || !Number.isSafeInteger(numero) || numero > maximo) {
        throw new BadRequestException(`${campo} debe ser entero entre 1 y ${maximo}`);
      }
      return numero;
    };
    const resultado: ListarHistorialOrdenesDto = {
      page: entero('page', 1, Number.MAX_SAFE_INTEGER),
      limit: entero('limit', 10, 100),
    };
    if (!Number.isSafeInteger((resultado.page - 1) * resultado.limit)) {
      throw new BadRequestException('La paginacion excede el rango permitido');
    }
    for (const campo of ['fechaDesde', 'fechaHasta'] as const) {
      if (query[campo] === undefined) continue;
      const texto = query[campo] as string;
      const fecha = new Date(`${texto}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || texto < '0001-01-01' ||
          !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
        throw new BadRequestException(`${campo} debe ser una fecha real YYYY-MM-DD`);
      }
      resultado[campo] = texto;
    }
    if (resultado.fechaDesde && resultado.fechaHasta && resultado.fechaDesde > resultado.fechaHasta) {
      throw new BadRequestException('fechaDesde no puede ser posterior a fechaHasta');
    }
    if (query.estado !== undefined) {
      if (!Object.values(EstadoOrden).includes(query.estado as EstadoOrden)) {
        throw new BadRequestException(`estado debe ser uno de: ${Object.values(EstadoOrden).join(', ')}`);
      }
      resultado.estado = query.estado as EstadoOrden;
    }
    if (query.producto !== undefined) {
      const producto = (query.producto as string).trim();
      if (producto.length > 150) throw new BadRequestException('producto admite hasta 150 caracteres');
      resultado.producto = producto;
    }
    return resultado;
  }
}
