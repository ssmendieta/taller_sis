import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CrearBoletaDto } from './dto/crear-boleta.dto';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';

@Injectable()
export class BoletasService {
  constructor(
    @InjectRepository(BoletaEnvio) private readonly boletas: Repository<BoletaEnvio>,
    private readonly dataSource: DataSource,
  ) {}

  create(dto: CrearBoletaDto, usuarioId: string): Promise<BoletaEnvio> {
    return this.dataSource.transaction(async (manager) => {
      const solicitud = await manager.findOne(SolicitudSalida, { where: { id: dto.solicitudSalidaId } });
      if (!solicitud) throw new NotFoundException('Solicitud de salida no encontrada');

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
