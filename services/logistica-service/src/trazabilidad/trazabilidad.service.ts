import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoletaEnvio } from '../boletas/entities/boleta-envio.entity';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { TrazabilidadQueryDto } from './dto/trazabilidad-query.dto';
import { TrazabilidadItemDto } from './dto/trazabilidad-item.dto';

@Injectable()
export class TrazabilidadService {
  constructor(
    @InjectRepository(BoletaEnvio)
    private readonly boletasRepo: Repository<BoletaEnvio>,
    @Optional()
    private readonly produccion?: LotesProduccionClient,
  ) {}

  async consultar(
    query: TrazabilidadQueryDto = {},
    authorization = '',
  ): Promise<TrazabilidadItemDto[]> {
    const ordenParam = query.ordenId?.trim();
    const loteParam = query.loteId?.trim();
    const boletaParam = query.boletaId?.trim();
    const qParam = query.q?.trim();

    // Requisito funcional: evitar volcado indiscriminado cuando no existe ningún criterio de búsqueda
    if (!ordenParam && !loteParam && !boletaParam && !qParam) {
      return [];
    }

    let filtroOrdenId: string | undefined = ordenParam;

    if (filtroOrdenId) {
      if (/^\d+$/.test(filtroOrdenId)) {
        // ID numérico directo
      } else if (this.produccion && authorization) {
        try {
          const ordenDto = await this.produccion.consultarOrdenPorCodigo(filtroOrdenId, authorization);
          filtroOrdenId = String(ordenDto.id);
        } catch (error) {
          if (error instanceof NotFoundException) {
            return [];
          }
          throw error;
        }
      }
    }

    const qb = this.boletasRepo
      .createQueryBuilder('boleta')
      .innerJoinAndSelect('boleta.solicitudSalida', 'solicitud')
      .leftJoinAndSelect('boleta.items', 'item')
      .leftJoinAndSelect('boleta.historial', 'historial');

    if (filtroOrdenId) {
      qb.andWhere('solicitud.orden_id = :ordenId', { ordenId: filtroOrdenId });
    }

    if (boletaParam) {
      qb.andWhere('boleta.id = :boletaId', { boletaId: boletaParam });
    }

    if (loteParam) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM boletas_envio_items bei WHERE bei.boleta_id = boleta.id AND (bei.referencia = :loteId OR LOWER(TRIM(bei.referencia)) = LOWER(TRIM(:loteId))))',
        { loteId: loteParam },
      );
    }

    if (qParam) {
      const isNum = /^\d+$/.test(qParam);
      const conditions: string[] = [
        'boleta.numero ILIKE :qLike',
        'solicitud.destino_documental ILIKE :qLike',
        'EXISTS (SELECT 1 FROM boletas_envio_items bei WHERE bei.boleta_id = boleta.id AND bei.referencia ILIKE :qLike)',
      ];
      const params: Record<string, unknown> = { qLike: `%${qParam}%` };

      if (isNum) {
        conditions.push('boleta.id = :qNum');
        conditions.push('solicitud.id = :qNum');
        conditions.push('solicitud.orden_id = :qNum');
        params.qNum = qParam;
      }

      qb.andWhere(`(${conditions.join(' OR ')})`, params);
    }

    qb.orderBy('boleta.creadoEn', 'DESC')
      .addOrderBy('boleta.id', 'DESC')
      .take(50);

    const boletas = await qb.getMany();

    // Cache de ordenes resueltas desde Producción para enriquecer con código legible
    const ordenCodigoMap = new Map<string, string>();
    if (this.produccion && authorization) {
      const distinctOrdenIds = Array.from(
        new Set(
          boletas
            .map((b) => b.solicitudSalida?.ordenId)
            .filter((id): id is string => Boolean(id) && /^\d+$/.test(String(id))),
        ),
      );

      await Promise.all(
        distinctOrdenIds.map(async (ordenId) => {
          try {
            const ordenDto = await this.produccion!.consultarOrdenPorId(ordenId, authorization);
            if (ordenDto?.codigo) {
              ordenCodigoMap.set(String(ordenId), ordenDto.codigo);
            }
          } catch {
            // Si Producción falla o no tiene la orden, se mantiene el ID
          }
        }),
      );
    }

    return boletas.map((boleta) => {
      const items = (boleta.items ?? []).map((it) => ({
        id: String(it.id),
        referencia: it.referencia,
        lote: it.referencia,
        cantidad: it.cantidad,
      }));

      const totalCantidadNum = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
      const totalCantidad = totalCantidadNum.toFixed(4);

      const lotePrincipal = items[0]?.referencia ?? '';

      const ordenId = String(boleta.solicitudSalida?.ordenId ?? '');
      const ordenCodigo = ordenCodigoMap.get(ordenId) || ordenId;

      const historialOrdenado = [...(boleta.historial ?? [])].sort(
        (a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime(),
      );

      const historial = historialOrdenado.map((h) => {
        let evento = 'Cambio de estado';
        if (h.estadoNuevo === EstadoBoleta.ANULADA) {
          evento = 'Anulación de boleta';
        } else if (h.estadoNuevo === EstadoBoleta.EMITIDA) {
          evento = 'Emisión de boleta';
        }

        const fechaIso =
          h.fechaHora instanceof Date ? h.fechaHora.toISOString() : String(h.fechaHora);

        return {
          id: String(h.id),
          evento,
          estadoAnterior: h.estadoAnterior,
          estadoNuevo: h.estadoNuevo,
          estado: h.estadoNuevo,
          usuarioActorId: String(h.usuarioActorId),
          motivo: h.motivo,
          fecha: fechaIso,
          fechaHora: fechaIso,
        };
      });

      const fechaBoleta =
        boleta.creadoEn instanceof Date ? boleta.creadoEn.toISOString() : String(boleta.creadoEn);

      return {
        id: String(boleta.id),
        boletaId: String(boleta.id),
        numero: boleta.numero,
        fecha: fechaBoleta,
        naturaleza: 'Documento de salida / logística',
        ordenId,
        orden: ordenCodigo,
        solicitudId: String(boleta.solicitudSalidaId),
        destino: boleta.solicitudSalida?.destinoDocumental ?? '',
        cantidad: totalCantidad,
        unidad: 'unidades',
        lote: lotePrincipal,
        loteCodigo: lotePrincipal,
        loteId: lotePrincipal,
        estado: boleta.estado,
        items,
        historial,
      };
    });
  }
}
