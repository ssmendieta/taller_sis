import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { AnularBoletaDto } from './anular-boleta.dto';

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class ValidarAnularBoletaPipe implements PipeTransform<unknown, AnularBoletaDto> {
  transform(value: unknown): AnularBoletaDto {
    if (!objeto(value) || Object.keys(value).some((key) => key !== 'motivo')) {
      throw new BadRequestException('El cuerpo de la anulación no es válido');
    }
    if (typeof value.motivo !== 'string' || !value.motivo.trim()) {
      throw new BadRequestException('El motivo de anulación es obligatorio y no puede estar vacío');
    }
    if (value.motivo.trim().length > 500) {
      throw new BadRequestException('El motivo no puede exceder los 500 caracteres');
    }
    return { motivo: value.motivo.trim() };
  }
}
