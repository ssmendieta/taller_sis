import { BadRequestException, PipeTransform } from '@nestjs/common';
import { esFechaValida } from '../../recursos-externos/dto/recursos-logisticos-v1.validator';

export interface SolicitudParaGrupo {
  solicitudId: string;
  fechaRequerida: string;
  tipoCarga: string;
}

export function idDeGrupoValido(id: unknown): id is string {
  return typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) &&
    BigInt(id) <= BigInt('9223372036854775807');
}

export class ValidarAgruparPipe implements PipeTransform<unknown, SolicitudParaGrupo[]> {
  transform(value: unknown): SolicitudParaGrupo[] {
    const body = value as { solicitudes?: unknown };
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((key) => key !== 'solicitudes') ||
        !Array.isArray(body.solicitudes) || body.solicitudes.length < 2 || body.solicitudes.length > 20) {
      throw new BadRequestException('Selecciona entre dos y veinte solicitudes para agrupar');
    }
    const solicitudes = body.solicitudes.map((solicitud: unknown) => {
      if (!solicitud || typeof solicitud !== 'object' || Array.isArray(solicitud)) {
        throw new BadRequestException('Solicitud inválida');
      }
      const datos = solicitud as Record<string, unknown>;
      const { solicitudId, fechaRequerida, tipoCarga } = datos;
      if (Object.keys(datos).some((key) => !['solicitudId', 'fechaRequerida', 'tipoCarga'].includes(key)) ||
          !idDeGrupoValido(solicitudId) || !esFechaValida(fechaRequerida) ||
          typeof tipoCarga !== 'string' || !tipoCarga.trim() || tipoCarga.trim().length > 80) {
        throw new BadRequestException('Cada solicitud requiere id, fecha válida y tipo de carga de hasta 80 caracteres');
      }
      return { solicitudId, fechaRequerida, tipoCarga: tipoCarga.trim() };
    });
    if (new Set(solicitudes.map(({ solicitudId }) => solicitudId)).size !== solicitudes.length) {
      throw new BadRequestException('La selección contiene solicitudes duplicadas');
    }
    return solicitudes;
  }
}
