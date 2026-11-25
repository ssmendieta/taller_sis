import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lote } from '../lotes/entities/lote.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Demanda, ESTADO_DEMANDA_CONFIRMADA } from './entities/demanda.entity';
import { CumplimientoDemandaDto } from './dto/cumplimiento-demanda.dto';
import { ListarDemandasDto, PaginatedDemandasDto } from './dto/listar-demandas.dto';
import { ListarDemandasPlanificablesDto } from './dto/listar-demandas-planificables.dto';

@Injectable()
export class DemandaService {
  constructor(
    @InjectRepository(Demanda)
    private readonly demandaRepository: Repository<Demanda>,
    @Optional()
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository?: Repository<OrdenProduccion>,
    @Optional()
    @InjectRepository(Lote)
    private readonly loteRepository?: Repository<Lote>,
  ) {}

  // ABC-449 (ABC-413): devuelve las órdenes de una demanda y su porcentaje de cumplimiento.
  async obtenerCumplimiento(demandaId: string): Promise<CumplimientoDemandaDto> {
    if (!/^\d+$/.test(demandaId)) {
      throw new NotFoundException(`Demanda con id ${demandaId} no encontrada`);
    }

    const demanda = await this.demandaRepository.findOne({
      where: { id: demandaId },
      relations: { items: true },
    });
    if (!demanda) {
      throw new NotFoundException(`Demanda con id ${demandaId} no encontrada`);
    }

    const cantidadPedida = Number(
      (demanda.items || [])
        .reduce((acc, item) => acc + Number(item.cantidad || 0), 0)
        .toFixed(4),
    );

    const ordenRepo =
      this.ordenRepository ?? this.demandaRepository.manager.getRepository(OrdenProduccion);
    const ordenesDb = await ordenRepo.find({
      where: { demanda_id: demanda.id },
      order: { id: 'ASC' },
    });

    const producidoPorOrden = new Map<string, number>();
    if (ordenesDb.length > 0) {
      const loteRepo =
        this.loteRepository ?? this.demandaRepository.manager.getRepository(Lote);
      const ordenIds = ordenesDb.map((o) => String(o.id));
      const filasLotes = await loteRepo
        .createQueryBuilder('lote')
        .select('lote.ordenId', 'ordenId')
        .addSelect('COALESCE(SUM(lote.cantidad), 0)', 'totalProducido')
        .where('lote.ordenId IN (:...ordenIds)', { ordenIds })
        .groupBy('lote.ordenId')
        .getRawMany<{ ordenId: string; totalProducido: string }>();

      for (const fila of filasLotes) {
        producidoPorOrden.set(String(fila.ordenId), Number(fila.totalProducido || 0));
      }
    }

    const ordenes = ordenesDb.map((o) => ({
      id: o.id,
      codigo: o.codigo,
      productoId: o.producto_id,
      estado: o.estado,
      cantidadSolicitada: Number(o.cantidad || 0),
      cantidadProducida: Number((producidoPorOrden.get(String(o.id)) ?? 0).toFixed(4)),
      fechaProgramada: typeof o.fecha_programada === 'string' ? o.fecha_programada : String(o.fecha_programada),
      creadoEn: o.creado_en instanceof Date ? o.creado_en.toISOString() : String(o.creado_en),
    }));

    const cantidadProducida = Number(
      ordenes.reduce((acc, o) => acc + o.cantidadProducida, 0).toFixed(4),
    );

    const porcentajeRaw =
      ordenes.length > 0 && cantidadPedida > 0 && cantidadProducida > 0
        ? (cantidadProducida / cantidadPedida) * 100
        : 0;
    const porcentajeCumplido = Math.min(100, Number(porcentajeRaw.toFixed(2)));

    return {
      demandaId: demanda.id,
      origen: demanda.origen,
      demandaExternaId: demanda.demandaExternaId,
      estado: demanda.estado,
      fechaRequerida:
        typeof demanda.fechaRequerida === 'string'
          ? demanda.fechaRequerida
          : String(demanda.fechaRequerida),
      cantidadPedida,
      cantidadProducida,
      porcentajeCumplido,
      ordenes,
    };
  }

  // ABC-444: obtiene una demanda confirmada con sus ítems para crear una orden.
  async obtenerParaOrden(demandaId: string): Promise<Demanda> {
    const demanda = await this.demandaRepository.findOne({
      where: { id: demandaId },
      relations: { items: true },
    });
    if (!demanda) {
      throw new NotFoundException(`Demanda con id ${demandaId} no encontrada`);
    }
    if (demanda.estado !== ESTADO_DEMANDA_CONFIRMADA) {
      throw new ConflictException('Solo se pueden crear órdenes desde demandas confirmadas');
    }
    return demanda;
  }

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
