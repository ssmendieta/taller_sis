import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { EstadoRuta } from '../../rutas/entities/estado-ruta.enum';
import { ListarHistorialRutasDto } from './listar-historial-rutas.dto';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function vacio(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

// fecha_programada es DATE: los filtros se comparan como días completos.
function validarFecha(campo: string, valor: unknown): string {
  const texto = String(valor).trim();
  if (!FECHA_ISO.test(texto) || new Date(`${texto}T00:00:00Z`).toISOString().slice(0, 10) !== texto) {
    throw new BadRequestException(`${campo} debe ser una fecha válida YYYY-MM-DD`);
  }
  return texto;
}

function entero(campo: string, valor: unknown, maximo: number): number {
  const texto = String(valor).trim();
  const numero = Number(texto);
  if (!/^[1-9]\d*$/.test(texto) || !Number.isSafeInteger(numero) || numero > maximo) {
    throw new BadRequestException(`${campo} debe ser un número entero entre 1 y ${maximo}`);
  }
  return numero;
}

@Injectable()
export class ValidarListarHistorialRutasPipe implements PipeTransform<unknown, ListarHistorialRutasDto> {
  transform(value: unknown): ListarHistorialRutasDto {
    if (vacio(value)) return { page: 1, limit: 10 };
    if (!objeto(value)) throw new BadRequestException('Los parámetros de consulta deben ser un objeto');

    const permitidos = ['page', 'limit', 'fechaDesde', 'fechaHasta', 'estado', 'chofer'];
    const extra = Object.keys(value).find((key) => !permitidos.includes(key));
    if (extra) throw new BadRequestException(`Parámetro de consulta no permitido: ${extra}`);

    const resultado: ListarHistorialRutasDto = {
      page: vacio(value.page) ? 1 : entero('page', value.page, Number.MAX_SAFE_INTEGER),
      limit: vacio(value.limit) ? 10 : entero('limit', value.limit, 100),
    };
    if (!vacio(value.fechaDesde)) resultado.fechaDesde = validarFecha('fechaDesde', value.fechaDesde);
    if (!vacio(value.fechaHasta)) resultado.fechaHasta = validarFecha('fechaHasta', value.fechaHasta);
    if (resultado.fechaDesde && resultado.fechaHasta && resultado.fechaDesde > resultado.fechaHasta) {
      throw new BadRequestException('fechaDesde no puede ser posterior a fechaHasta');
    }
    if (!vacio(value.estado)) {
      const estado = String(value.estado).trim().toUpperCase();
      if (!Object.values(EstadoRuta).includes(estado as EstadoRuta)) {
        throw new BadRequestException(`El estado debe ser uno de: ${Object.values(EstadoRuta).join(', ')}`);
      }
      resultado.estado = estado as EstadoRuta;
    }
    if (!vacio(value.chofer)) {
      const chofer = String(value.chofer).trim();
      if (!chofer || chofer.length > 80) {
        throw new BadRequestException('chofer admite hasta 80 caracteres');
      }
      resultado.chofer = chofer;
    }
    return resultado;
  }
}
