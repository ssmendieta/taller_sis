import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { EstadoBoleta } from '../entities/estado-boleta.enum';
import { ListarBoletasDto } from './listar-boletas.dto';

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validarFecha(campo: string, valor: string): string {
  const trimmed = valor.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z?)?$/.exec(trimmed);
  if (!match) {
    throw new BadRequestException(`${campo} debe ser una fecha válida (formato YYYY-MM-DD o ISO-8601)`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new BadRequestException(`${campo} debe ser una fecha válida en el calendario`);
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${campo} debe ser una fecha válida en el calendario`);
  }

  if (match[4] !== undefined) {
    const hours = parseInt(match[4], 10);
    const minutes = parseInt(match[5], 10);
    const seconds = parseInt(match[6], 10);
    if (hours > 23 || minutes > 59 || seconds > 59) {
      throw new BadRequestException(`${campo} debe ser una fecha válida en el calendario`);
    }
  }

  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    throw new BadRequestException(`${campo} debe ser una fecha válida en el calendario`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return campo.toLowerCase().includes('hasta')
      ? `${trimmed}T23:59:59.999Z`
      : `${trimmed}T00:00:00.000Z`;
  }
  return trimmed;
}

@Injectable()
export class ValidarListarBoletasPipe implements PipeTransform<unknown, ListarBoletasDto> {
  transform(value: unknown): ListarBoletasDto {
    if (value === undefined || value === null) {
      return { page: 1, limit: 10 };
    }
    if (!objeto(value)) {
      throw new BadRequestException('Los parámetros de consulta deben ser un objeto');
    }

    const permitidos = ['page', 'limit', 'ordenId', 'orden', 'estado', 'fechaDesde', 'fechaHasta', 'desde', 'hasta'];
    for (const key of Object.keys(value)) {
      if (!permitidos.includes(key)) {
        throw new BadRequestException(`Parámetro de consulta no permitido: ${key}`);
      }
    }

    let page = 1;
    if (value.page !== undefined && value.page !== '') {
      const pageStr = String(value.page).trim();
      if (!/^[1-9]\d*$/.test(pageStr)) {
        throw new BadRequestException('page debe ser un número entero mayor o igual a 1');
      }
      page = Number(pageStr);
      if (!Number.isSafeInteger(page) || page < 1) {
        throw new BadRequestException('page debe ser un número entero mayor o igual a 1');
      }
    }

    let limit = 10;
    if (value.limit !== undefined && value.limit !== '') {
      const limitStr = String(value.limit).trim();
      if (!/^[1-9]\d*$/.test(limitStr)) {
        throw new BadRequestException('limit debe ser un número entero entre 1 y 100');
      }
      limit = Number(limitStr);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new BadRequestException('limit debe ser un número entero entre 1 y 100');
      }
    }

    let estado: EstadoBoleta | undefined;
    if (value.estado !== undefined && value.estado !== '') {
      const estadoStr = String(value.estado).trim().toUpperCase();
      if (!Object.values(EstadoBoleta).includes(estadoStr as EstadoBoleta)) {
        throw new BadRequestException(
          `El estado debe ser uno de: ${Object.values(EstadoBoleta).map((e) => `'${e}'`).join(', ')}`,
        );
      }
      estado = estadoStr as EstadoBoleta;
    }

    let ordenId: string | undefined;
    if (value.ordenId !== undefined && value.ordenId !== '') {
      const idStr = String(value.ordenId).trim();
      if (!idStr || idStr.length > 100) {
        throw new BadRequestException('El identificador de orden no es válido');
      }
      ordenId = idStr;
    }

    let orden: string | undefined;
    if (value.orden !== undefined && value.orden !== '') {
      const ordStr = String(value.orden).trim();
      if (!ordStr || ordStr.length > 100) {
        throw new BadRequestException('El código o identificador de orden no es válido');
      }
      orden = ordStr;
    }

    const rawDesde = value.fechaDesde ?? value.desde;
    let fechaDesde: string | undefined;
    if (rawDesde !== undefined && rawDesde !== '') {
      fechaDesde = validarFecha('fechaDesde', String(rawDesde));
    }

    const rawHasta = value.fechaHasta ?? value.hasta;
    let fechaHasta: string | undefined;
    if (rawHasta !== undefined && rawHasta !== '') {
      fechaHasta = validarFecha('fechaHasta', String(rawHasta));
    }

    if (fechaDesde && fechaHasta) {
      if (new Date(fechaDesde).getTime() > new Date(fechaHasta).getTime()) {
        throw new BadRequestException('fechaDesde no puede ser posterior a fechaHasta');
      }
    }

    return {
      page,
      limit,
      ...(ordenId ? { ordenId } : {}),
      ...(orden ? { orden } : {}),
      ...(estado ? { estado } : {}),
      ...(fechaDesde ? { fechaDesde } : {}),
      ...(fechaHasta ? { fechaHasta } : {}),
    };
  }
}
