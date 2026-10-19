import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { TrazabilidadQueryDto } from './trazabilidad-query.dto';

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class ValidarTrazabilidadQueryPipe implements PipeTransform<unknown, TrazabilidadQueryDto> {
  transform(value: unknown): TrazabilidadQueryDto {
    if (value === undefined || value === null) {
      return {};
    }

    if (!objeto(value)) {
      throw new BadRequestException('Los parámetros de consulta deben ser un objeto');
    }

    const permitidos = ['ordenId', 'loteId', 'boletaId', 'q'];
    for (const key of Object.keys(value)) {
      if (!permitidos.includes(key)) {
        throw new BadRequestException(`Parámetro de consulta no permitido: ${key}`);
      }
    }

    const sanitized: TrazabilidadQueryDto = {};

    if (value.ordenId !== undefined && value.ordenId !== null) {
      const ordenIdStr = String(value.ordenId).trim();
      if (ordenIdStr.length > 0) {
        if (ordenIdStr.length > 100) {
          throw new BadRequestException('El identificador de orden no puede superar los 100 caracteres');
        }
        sanitized.ordenId = ordenIdStr;
      }
    }

    if (value.loteId !== undefined && value.loteId !== null) {
      const loteIdStr = String(value.loteId).trim();
      if (loteIdStr.length > 0) {
        if (loteIdStr.length > 160) {
          throw new BadRequestException('El código de lote no puede superar los 160 caracteres');
        }
        sanitized.loteId = loteIdStr;
      }
    }

    if (value.boletaId !== undefined && value.boletaId !== null) {
      const boletaIdStr = String(value.boletaId).trim();
      if (boletaIdStr.length > 0) {
        if (
          !/^\d+$/.test(boletaIdStr) ||
          BigInt(boletaIdStr) < BigInt('1') ||
          BigInt(boletaIdStr) > BigInt('9223372036854775807')
        ) {
          throw new BadRequestException('El identificador de boleta debe ser un número entero positivo válido');
        }
        sanitized.boletaId = boletaIdStr;
      }
    }

    if (value.q !== undefined && value.q !== null) {
      const qStr = String(value.q).trim();
      if (qStr.length > 0) {
        if (qStr.length > 200) {
          throw new BadRequestException('El término de búsqueda no puede superar los 200 caracteres');
        }
        sanitized.q = qStr;
      }
    }

    return sanitized;
  }
}
