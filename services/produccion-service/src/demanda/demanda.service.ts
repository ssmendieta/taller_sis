import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Demanda, ESTADO_DEMANDA_CONFIRMADA } from './entities/demanda.entity';
import { ListarDemandasDto, PaginatedDemandasDto } from './dto/listar-demandas.dto';
import { ListarDemandasPlanificablesDto } from './dto/listar-demandas-planificables.dto';

@Injectable()
export class DemandaService {
  constructor(
    @InjectRepository(Demanda)
    private readonly demandaRepository: Repository<Demanda>,
  ) {}

  async listar(dto: ListarDemandasDto): Promise<PaginatedDemandasDto> {
    return this.consultar(dto);
  }

  async listarPlanificables(
    dto: ListarDemandasPlanificablesDto,
  ): Promise<PaginatedDemandasDto> {
    return this.consultar({ ...dto, estado: ESTADO_DEMANDA_CONFIRMADA }, true);
  }

  private async consultar(
    dto: ListarDemandasDto,
    soloPlanificables = false,
  ): Promise<PaginatedDemandasDto> {
    const page = Math.max(1, Number(dto.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(dto.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.demandaRepository
      .createQueryBuilder('demanda')
      .leftJoinAndSelect('demanda.items', 'item')
      // Un JOIN por cada producto no debe duplicar demandas ni alterar el total.
      .distinct(true);

    if (dto.origen) {
      qb.andWhere('demanda.origen = :origen', { origen: dto.origen });
    }

    if (dto.estado) {
      qb.andWhere('demanda.estado = :estado', { estado: dto.estado });
    }

    qb.orderBy(
      soloPlanificables ? 'demanda.confirmadaEn' : 'demanda.recibidaEn',
      'DESC',
    )
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
