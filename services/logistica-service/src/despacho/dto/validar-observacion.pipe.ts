import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export const MAX_OBSERVACION = 500;

export interface RegistrarObservacionDto {
  observacion: string | null;
}

// ABC-376: el cliente solo envía la observación. Fecha, autor y estado los fija
// el servidor, por eso cualquier otro campo se rechaza.
@Injectable()
export class ValidarObservacionPipe implements PipeTransform<unknown, RegistrarObservacionDto> {
  transform(value: unknown): RegistrarObservacionDto {
    if (value === undefined || value === null) return { observacion: null };
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo debe ser un objeto con observacion opcional');
    }
    const extras = Object.keys(value).filter((clave) => clave !== 'observacion');
    if (extras.length > 0) {
      throw new BadRequestException(`Campos no permitidos: ${extras.join(', ')}. Fecha, autor y estado los registra el servidor`);
    }
    const observacion = (value as { observacion?: unknown }).observacion ?? null;
    if (observacion === null) return { observacion: null };
    if (typeof observacion !== 'string' || observacion.trim().length > MAX_OBSERVACION) {
      throw new BadRequestException(`observacion debe ser texto de hasta ${MAX_OBSERVACION} caracteres`);
    }
    return { observacion: observacion.trim() || null };
  }
}
