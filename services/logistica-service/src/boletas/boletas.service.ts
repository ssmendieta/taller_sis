import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CrearBoletaDto } from './dto/crear-boleta.dto';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';

@Injectable()
export class BoletasService {
  constructor(
    @InjectRepository(BoletaEnvio) private readonly boletas: Repository<BoletaEnvio>,
    @InjectRepository(SolicitudSalida) private readonly solicitudes: Repository<SolicitudSalida>,
    private readonly dataSource: DataSource,
    private readonly produccion: LotesProduccionClient,
  ) {}

  async create(dto: CrearBoletaDto, usuarioId: string, authorization: string): Promise<BoletaEnvio> {
    const solicitud = await this.solicitudes.findOne({
      where: { id: dto.solicitudSalidaId },
      relations: { items: true },
    });
    if (!solicitud) throw new NotFoundException('Solicitud de salida no encontrada');

    const orden = await this.produccion.consultarOrdenPorId(solicitud.ordenId, authorization);
    if (String(orden.id) !== String(solicitud.ordenId) || !orden.codigo.trim() ||
        !Number.isSafeInteger(Number(orden.producto_id)) || Number(orden.producto_id) < 1 ||
        !orden.producto || typeof orden.producto !== 'object') {
      throw new BadGatewayException('Producción devolvió una relación orden-producto incompleta');
    }
    const lotes = await this.produccion.consultarPorOrden(orden.codigo, authorization);
    const lotesDeOrden = lotes.filter((lote) => String(lote.ordenId) === String(solicitud.ordenId));
    if (lotesDeOrden.length !== lotes.length) {
      throw new BadGatewayException('Producción devolvió un lote de otra orden');
    }
    const referencias = new Set(lotesDeOrden.map((lote) => lote.codigo));
    if (dto.items.some((item) => !referencias.has(item.referencia))) {
      throw new NotFoundException('Uno o más ítems no pertenecen a la orden solicitada');
    }

    return this.dataSource.transaction(async (manager) => {
      const boleta = await manager.save(BoletaEnvio, manager.create(BoletaEnvio, {
        solicitudSalidaId: solicitud.id,
        responsableUsuarioId: usuarioId,
        estado: EstadoBoleta.BORRADOR,
      }));
      const items = dto.items.map((item) => manager.create(BoletaEnvioItem, {
        boletaId: boleta.id,
        referencia: item.referencia,
        cantidad: item.cantidad,
      }));
      boleta.items = await manager.save(BoletaEnvioItem, items);
      return boleta;
    });
  }

  findAll(): Promise<BoletaEnvio[]> {
    return this.boletas.find({ relations: { items: true }, order: { creadoEn: 'DESC', id: 'DESC' } });
  }

  async findOne(id: string): Promise<BoletaEnvio> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Boleta no encontrada');
    }
    const boleta = await this.boletas.findOne({ where: { id }, relations: { items: true } });
    if (!boleta) throw new NotFoundException('Boleta no encontrada');
    return boleta;
  }
}
