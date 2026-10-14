import { BadGatewayException, BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export interface OrdenProduccionDto {
  id: string | number;
  codigo: string;
  producto_id: string | number;
  producto?: unknown;
}

export interface LoteProduccionDto {
  id: string;
  codigo: string;
  ordenId: string;
  ordenCodigo: string;
  productoId: string;
  cantidad: string;
  fechaHora: string;
}

@Injectable()
export class LotesProduccionClient {
  async consultarOrdenPorId(ordenId: string, authorization: string): Promise<OrdenProduccionDto> {
    if (!ordenId?.trim() || !/^\d+$/.test(ordenId)) throw new BadRequestException('El identificador de orden es inválido');
    if (!/^Bearer\s+\S+$/i.test(authorization ?? '')) throw new BadRequestException('Se requiere el token de sesión');
    const base = process.env.PRODUCCION_SERVICE_URL || 'http://localhost:3002';
    let response: Response;
    try {
      response = await fetch(new URL(`ordenes/${encodeURIComponent(ordenId)}`, base.replace(/\/?$/, '/')), {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('Producción no está disponible');
    }
    if (response.status === 404) throw new NotFoundException('Orden no encontrada en Producción');
    if (response.status === 401 || response.status === 403) throw new BadGatewayException('Producción rechazó la consulta');
    if (!response.ok) throw new BadGatewayException('Producción no pudo consultar la orden');
    let body: unknown;
    try { body = await response.json(); } catch { throw new BadGatewayException('Producción devolvió una respuesta inválida'); }
    if (!body || typeof body !== 'object' || typeof (body as OrdenProduccionDto).codigo !== 'string') {
      throw new BadGatewayException('Producción devolvió una orden incompleta');
    }
    return body as OrdenProduccionDto;
  }

  async consultarPorOrden(ordenCodigo: string, authorization: string): Promise<LoteProduccionDto[]> {
    if (!ordenCodigo?.trim()) throw new BadRequestException('El código de orden es obligatorio');
    if (!/^Bearer\s+\S+$/i.test(authorization ?? '')) throw new BadRequestException('Se requiere el token de sesión');
    const base = process.env.PRODUCCION_SERVICE_URL || 'http://localhost:3002';
    let response: Response;
    try {
      response = await fetch(new URL(`lotes/orden/${encodeURIComponent(ordenCodigo.trim())}`, base.replace(/\/?$/, '/')), {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('Producción no está disponible');
    }
    if (response.status === 401 || response.status === 403) throw new BadGatewayException('Producción rechazó la consulta');
    if (!response.ok) throw new BadGatewayException('Producción no pudo consultar los lotes');
    let body: unknown;
    try { body = await response.json(); } catch { throw new BadGatewayException('Producción devolvió una respuesta inválida'); }
    if (!Array.isArray(body)) throw new BadGatewayException('Producción devolvió un formato inválido');
    return body as LoteProduccionDto[];
  }
}
