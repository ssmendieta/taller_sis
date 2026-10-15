import { BadGatewayException, BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export interface OrdenProduccionDto {
  id: string | number;
  codigo: string;
  producto_id: string | number;
  producto?: unknown;
}

export interface ResultadoConformeProduccionDto {
  cantidad: string;
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
  private async respuestaProduccion(path: string, authorization: string): Promise<Response> {
    if (!/^Bearer\s+\S+$/i.test(authorization ?? '')) throw new BadRequestException('Se requiere el token de sesión');
    const base = process.env.PRODUCCION_SERVICE_URL || 'http://localhost:3002';
    try {
      return await fetch(new URL(path, base.replace(/\/?$/, '/')), {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('Producción no está disponible');
    }
  }

  private async jsonProduccion(response: Response): Promise<unknown> {
    try { return await response.json(); } catch { throw new BadGatewayException('Producción devolvió una respuesta inválida'); }
  }

  async consultarOrdenPorCodigo(ordenCodigo: string, authorization: string): Promise<OrdenProduccionDto> {
    if (!ordenCodigo?.trim()) throw new BadRequestException('El código de orden es obligatorio');
    const response = await this.respuestaProduccion(`ordenes/codigo/${encodeURIComponent(ordenCodigo.trim())}`, authorization);
    if (response.status === 404) throw new NotFoundException('Orden no encontrada en Producción');
    if (response.status === 401 || response.status === 403) throw new BadGatewayException('Producción rechazó la consulta');
    if (!response.ok) throw new BadGatewayException('Producción no pudo consultar la orden');
    const body = await this.jsonProduccion(response);
    if (!body || typeof body !== 'object' || typeof (body as OrdenProduccionDto).codigo !== 'string') {
      throw new BadGatewayException('Producción devolvió una orden incompleta');
    }
    return body as OrdenProduccionDto;
  }

  async consultarConformesPorOrden(ordenId: string, authorization: string): Promise<ResultadoConformeProduccionDto[]> {
    if (!ordenId?.trim() || !/^\d+$/.test(ordenId)) throw new BadRequestException('El identificador de orden es inválido');
    const response = await this.respuestaProduccion(`calidad/conformes/orden/${encodeURIComponent(ordenId)}?tipo=CONFORME`, authorization);
    if (response.status === 404) throw new NotFoundException('Orden no encontrada en Producción');
    if (response.status === 401 || response.status === 403) throw new BadGatewayException('Producción rechazó la consulta');
    if (!response.ok) throw new BadGatewayException('Producción no pudo consultar los conformes');
    const body = await this.jsonProduccion(response);
    if (!Array.isArray(body) || body.some((item) => !item || typeof item !== 'object' ||
        typeof (item as ResultadoConformeProduccionDto).cantidad !== 'string' ||
        !/^\d+(?:\.\d{1,4})?$/.test((item as ResultadoConformeProduccionDto).cantidad))) {
      throw new BadGatewayException('Producción devolvió conformes con formato inválido');
    }
    return body as ResultadoConformeProduccionDto[];
  }

  async consultarOrdenPorId(ordenId: string, authorization: string): Promise<OrdenProduccionDto> {
    if (!ordenId?.trim() || !/^\d+$/.test(ordenId)) throw new BadRequestException('El identificador de orden es inválido');
    if (!/^Bearer\s+\S+$/i.test(authorization ?? '')) throw new BadRequestException('Se requiere el token de sesión');
    const response = await this.respuestaProduccion(`ordenes/${encodeURIComponent(ordenId)}`, authorization);
    if (response.status === 404) throw new NotFoundException('Orden no encontrada en Producción');
    if (response.status === 401 || response.status === 403) throw new BadGatewayException('Producción rechazó la consulta');
    if (!response.ok) throw new BadGatewayException('Producción no pudo consultar la orden');
    const body = await this.jsonProduccion(response);
    if (!body || typeof body !== 'object' || typeof (body as OrdenProduccionDto).codigo !== 'string') {
      throw new BadGatewayException('Producción devolvió una orden incompleta');
    }
    return body as OrdenProduccionDto;
  }

  async consultarPorOrden(ordenCodigo: string, authorization: string): Promise<LoteProduccionDto[]> {
    if (!ordenCodigo?.trim()) throw new BadRequestException('El código de orden es obligatorio');
    if (!/^Bearer\s+\S+$/i.test(authorization ?? '')) throw new BadRequestException('Se requiere el token de sesión');
    const response = await this.respuestaProduccion(`lotes/orden/${encodeURIComponent(ordenCodigo.trim())}`, authorization);
    if (response.status === 401 || response.status === 403) throw new BadGatewayException('Producción rechazó la consulta');
    if (!response.ok) throw new BadGatewayException('Producción no pudo consultar los lotes');
    const body = await this.jsonProduccion(response);
    if (!Array.isArray(body)) throw new BadGatewayException('Producción devolvió un formato inválido');
    return body as LoteProduccionDto[];
  }
}
