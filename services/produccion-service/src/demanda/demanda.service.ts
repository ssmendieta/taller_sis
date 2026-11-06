import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Demanda } from './entities/demanda.entity';
import { ListarDemandasDto, PaginatedDemandasDto } from './dto/listar-demandas.dto';

@Injectable()
export class DemandaService {
  constructor(
    @InjectRepository(Demanda)
    private readonly demandaRepository: Repository<Demanda>,
  ) {}

  async listar(dto: ListarDemandasDto): Promise<PaginatedDemandasDto> {
    const page = Math.max(1, Number(dto.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(dto.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.demandaRepository
      .createQueryBuilder('demanda')
      .leftJoinAndSelect('demanda.items', 'item');

    if (dto.origen) {
      qb.andWhere('demanda.origen = :origen', { origen: dto.origen });
    }

    if (dto.estado) {
      qb.andWhere('demanda.estado = :estado', { estado: dto.estado });
    }

    qb.orderBy('demanda.recibidaEn', 'DESC')
      .addOrderBy('demanda.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [demandas, total] = await qb.getManyAndCount();

    const items = demandas.map((d) => ({
      id: d.id,
      origen: d.origen,
      demandaExternaId: d.demandaExternaId,
      fechaRequerida: typeof d.fechaRequerida === 'string' ? d.fechaRequerida : String(d.fechaRequerida),
      estado: d.estado,
      recibidaEn: d.recibidaEn instanceof Date ? d.recibidaEn.toISOString() : String(d.recibidaEn),
      confirmadaEn: d.confirmadaEn ? (d.confirmadaEn instanceof Date ? d.confirmadaEn.toISOString() : String(d.confirmadaEn)) : null,
      items: (d.items || []).map((it) => ({
        id: it.id,
        productoCodigo: it.productoCodigo,
        cantidad: it.cantidad,
        unidad: it.unidad,
      })),
      totalItems: (d.items || []).length,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }
}
