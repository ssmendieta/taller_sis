import { BadGatewayException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoletaEnvio } from '../boletas/entities/boleta-envio.entity';
import { BoletaEnvioItem } from '../boletas/entities/boleta-envio-item.entity';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { LotesProduccionClient } from './lotes-produccion.client';

function escalar(cantidad: string): bigint {
  if (!/^\d+(?:\.\d{1,4})?$/.test(cantidad)) throw new BadGatewayException('Cantidad conforme inválida');
  const [entero, decimales = ''] = cantidad.split('.');
  return BigInt(entero) * BigInt('10000') + BigInt(decimales.padEnd(4, '0'));
}

function formatear(valor: bigint): string {
  const negativo = valor < BigInt('0');
  const absoluto = negativo ? -valor : valor;
  const texto = absoluto.toString().padStart(5, '0');
  const entero = texto.slice(0, -4) || '0';
  const resultado = `${entero}.${texto.slice(-4)}`;
  return negativo ? `-${resultado}` : resultado;
}

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
    const totalConforme = conformes.reduce((total, resultado) => total + escalar(resultado.cantidad), BigInt('0'));
    const emitidas = await this.boletas.createQueryBuilder('boleta')
      .innerJoin(BoletaEnvioItem, 'item', 'item.boleta_id = boleta.id')
      .innerJoin('solicitudes_salida', 'solicitud', 'solicitud.id = boleta.solicitud_salida_id')
      .select("COALESCE(SUM(item.cantidad), 0)::text", 'total')
      .where('solicitud.orden_id = :ordenId', { ordenId: String(orden.id) })
      .andWhere('boleta.estado = :estado', { estado: EstadoBoleta.EMITIDA })
      .getRawOne<{ total: string }>();
    const totalEmitido = escalar(emitidas?.total ?? '0');
    return {
      ordenCodigo: orden.codigo,
      ordenId: String(orden.id),
      totalConforme: formatear(totalConforme),
      totalEmitido: formatear(totalEmitido),
      saldoDocumental: formatear(totalConforme - totalEmitido),
    };
  }
}
