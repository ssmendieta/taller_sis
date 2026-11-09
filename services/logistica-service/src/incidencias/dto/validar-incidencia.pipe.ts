import { BadRequestException, PipeTransform } from '@nestjs/common';
import { esFechaValida } from '../../recursos-externos/dto/recursos-logisticos-v1.validator';
import { TipoIncidencia } from '../entities/tipo-incidencia.enum';

export interface RegistrarIncidenciaDto {
  tipo: TipoIncidencia;
  motivo: string;
  paradaId: string | null;
  nuevaFecha?: string;
}

export function esIdPositivo(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= BigInt('9223372036854775807');
}

export class ValidarIncidenciaPipe implements PipeTransform<unknown, RegistrarIncidenciaDto> {
  transform(value: unknown): RegistrarIncidenciaDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Se esperaba un objeto con los datos de la incidencia');
    }
    const datos = value as Record<string, unknown>;
    if (Object.keys(datos).some((key) => !['tipo', 'motivo', 'paradaId', 'nuevaFecha'].includes(key))) {
      throw new BadRequestException('La incidencia contiene campos no admitidos');
    }
    const { tipo, motivo, nuevaFecha, paradaId = null } = datos;
    if (!Object.values(TipoIncidencia).includes(tipo as TipoIncidencia)) {
      throw new BadRequestException('El tipo de incidencia no es válido');
    }
    if (typeof motivo !== 'string' || !motivo.trim() || motivo.trim().length > 500) {
      throw new BadRequestException('El motivo es obligatorio y admite hasta 500 caracteres');
    }
    if (paradaId !== null && !esIdPositivo(paradaId)) {
      throw new BadRequestException('La parada debe ser un identificador positivo');
    }
    if (nuevaFecha != null && !esFechaValida(nuevaFecha)) {
      throw new BadRequestException('La nueva fecha debe ser una fecha válida AAAA-MM-DD');
    }
    return {
      tipo: tipo as TipoIncidencia,
      motivo: motivo.trim(),
      paradaId: typeof paradaId === 'string' ? paradaId : null,
      nuevaFecha: typeof nuevaFecha === 'string' ? nuevaFecha : undefined,
    };
  }
}
