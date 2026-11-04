import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CrearSolicitudSalidaDto } from './dto/crear-solicitud-salida.dto';
import { SolicitudSalida } from './entities/solicitud-salida.entity';
import { SolicitudSalidaItem } from './entities/solicitud-salida-item.entity';

@Injectable()
export class SolicitudesSalidaService {
  constructor(
    @InjectRepository(SolicitudSalida)
    private readonly solicitudes: Repository<SolicitudSalida>,
    private readonly dataSource: DataSource,
  ) {}

  create(dto: CrearSolicitudSalidaDto, usuarioId: string): Promise<SolicitudSalida> {
    return this.dataSource.transaction(async (manager) => {
      const solicitud = await manager.save(SolicitudSalida, {
        ordenId: dto.ordenId,
        destinoDocumental: dto.destinoDocumental,
        motivo: dto.motivo,
        responsableUsuarioId: usuarioId,
        estado: 'BORRADOR',
      });
      const items = dto.items.map((item) => manager.create(SolicitudSalidaItem, {
        solicitudId: solicitud.id,
        referencia: item.referencia,
        cantidad: item.cantidad,
      }));
      solicitud.items = await manager.save(SolicitudSalidaItem, items);
      return solicitud;
    });
  }

  findAll(): Promise<SolicitudSalida[]> {
    return this.solicitudes.find({
      relations: { items: true },
      order: { creadoEn: 'DESC', id: 'DESC' },
    });
  }

  async findOne(id: string): Promise<SolicitudSalida> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Solicitud de salida no encontrada');
    }
    const solicitud = await this.solicitudes.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!solicitud) throw new NotFoundException('Solicitud de salida no encontrada');
    return solicitud;
  }
}
