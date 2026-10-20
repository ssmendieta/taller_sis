import { BadGatewayException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoletaEnvio } from '../boletas/entities/boleta-envio.entity';
import { BoletaEnvioItem } from '../boletas/entities/boleta-envio-item.entity';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { LotesProduccionClient } from './lotes-produccion.client';
import { escalarCantidad, formatearCantidad } from './cantidad-documental';

@Injectable()
export class DisponibilidadDocumentalService {
  constructor(
    @InjectRepository(BoletaEnvio) private readonly boletas: Repository<BoletaEnvio>,
    private readonly produccion: LotesProduccionClient,
  ) {}

  async consultar(ordenCodigo: string, authorization: string) {
    const orden = await this.produccion.consultarOrdenPorCodigo(ordenCodigo, authorization);
    if (!orden.id || !orden.codigo || !orden.producto_id) {
      throw new BadGatewayException('Producción devolvió una orden incompleta');
    }
    const conformes = await this.produccion.consultarConformesPorOrden(String(orden.id), authorization);
    const totalConforme = conformes.reduce(
      (total, resultado) => total + escalarCantidad(resultado.cantidad, 'Cantidad conforme inválida'),
      BigInt('0'),
    );
    const emitidas = await this.boletas.createQueryBuilder('boleta')
      .innerJoin(BoletaEnvioItem, 'item', 'item.boleta_id = boleta.id')
      .innerJoin('solicitudes_salida', 'solicitud', 'solicitud.id = boleta.solicitud_salida_id')
      .select("COALESCE(SUM(item.cantidad), 0)::text", 'total')
      .where('solicitud.orden_id = :ordenId', { ordenId: String(orden.id) })
      .andWhere('boleta.estado = :estado', { estado: EstadoBoleta.EMITIDA })
      .getRawOne<{ total: string }>();
    const totalEmitido = escalarCantidad(emitidas?.total ?? '0', 'Cantidad conforme inválida');
    return {
      ordenCodigo: orden.codigo,
      ordenId: String(orden.id),
      totalConforme: formatearCantidad(totalConforme),
      totalEmitido: formatearCantidad(totalEmitido),
      saldoDocumental: formatearCantidad(totalConforme - totalEmitido),
    };
  }

  /**
   * Saldo documental por lote de la orden: cantidad original del lote menos lo
   * comprometido en boletas EMITIDAS. Los borradores no descuentan y las boletas
   * anuladas dejan de descontar porque el cálculo solo mira el estado EMITIDA.
   */
  async consultarLotes(ordenCodigo: string, authorization: string) {
    const orden = await this.produccion.consultarOrdenPorCodigo(ordenCodigo, authorization);
    if (!orden.id || !orden.codigo || !orden.producto_id) {
      throw new BadGatewayException('Producción devolvió una orden incompleta');
    }
    const ordenId = String(orden.id);
    const lotes = await this.produccion.consultarPorOrden(orden.codigo, authorization);
    const lotesDeOrden = lotes.filter((lote) => String(lote.ordenId) === ordenId);
    if (lotesDeOrden.length !== lotes.length) {
      throw new BadGatewayException('Producción devolvió un lote de otra orden');
    }
    if (lotesDeOrden.some((lote) => String(lote.productoId) !== String(orden.producto_id))) {
      throw new BadGatewayException('Producción devolvió un lote de otro producto');
    }

    const comprometidos = await this.comprometidosPorLote(ordenId);
    return {
      ordenCodigo: orden.codigo,
      ordenId,
      lotes: lotesDeOrden.map((lote) => {
        const original = escalarCantidad(lote.cantidad, 'Producción devolvió un lote con cantidad inválida');
        const comprometido = comprometidos.get(lote.codigo) ?? BigInt('0');
        return {
          referencia: lote.codigo,
          loteId: String(lote.id),
          cantidadOriginal: formatearCantidad(original),
          cantidadComprometida: formatearCantidad(comprometido),
          cantidadDisponible: formatearCantidad(original - comprometido),
        };
      }),
    };
  }

  /** Cantidad comprometida en boletas EMITIDAS por cada lote (referencia) de la orden. */
  private async comprometidosPorLote(ordenId: string): Promise<Map<string, bigint>> {
    const filas = await this.boletas.createQueryBuilder('boleta')
      .innerJoin(BoletaEnvioItem, 'item', 'item.boleta_id = boleta.id')
      .innerJoin('solicitudes_salida', 'solicitud', 'solicitud.id = boleta.solicitud_salida_id')
      .select('item.referencia', 'referencia')
      .addSelect('COALESCE(SUM(item.cantidad), 0)::text', 'total')
      .where('solicitud.orden_id = :ordenId', { ordenId })
      .andWhere('boleta.estado = :estado', { estado: EstadoBoleta.EMITIDA })
      .groupBy('item.referencia')
      .getRawMany<{ referencia: string; total: string }>();

    const comprometidos = new Map<string, bigint>();
    for (const fila of filas ?? []) {
      const referencia = String(fila?.referencia ?? '').trim();
      const total = escalarCantidad(fila?.total ?? '0', 'Cantidad conforme inválida');
      comprometidos.set(referencia, (comprometidos.get(referencia) ?? BigInt('0')) + total);
    }
    return comprometidos;
  }
}
