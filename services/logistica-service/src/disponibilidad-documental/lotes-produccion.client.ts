import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface LoteProduccionDto {
  id: string;
  codigo: string;
  ordenId: string;
  ordenCodigo: string;
  cantidad: string;
  fechaHora: string;
}

@Injectable()
export class LotesProduccionClient {
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
