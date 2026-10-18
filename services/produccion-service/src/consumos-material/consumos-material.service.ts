import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { ConsumoMaterial } from './entities/consumo-material.entity';
import { CreateConsumoMaterialDto } from './dto/create-consumo-material.dto';

@Injectable()
export class ConsumosMaterialService {
  constructor(
    @InjectRepository(ConsumoMaterial)
    private readonly consumosRepository: Repository<ConsumoMaterial>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateConsumoMaterialDto, usuarioId: number) {
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }
    if (!Number.isFinite(dto.cantidad) || dto.cantidad <= 0) {
      throw new BadRequestException('La cantidad debe ser positiva');
    }
    return this.dataSource.transaction(async (manager) => {
      const orden = await manager.findOne(OrdenProduccion, {
        where: { id: dto.ordenId }, lock: { mode: 'pessimistic_read' },
      });
      if (!orden) throw new NotFoundException(`Orden con id ${dto.ordenId} no encontrada`);
      const material = await manager.findOne(Material, {
        where: { id: dto.materialId }, lock: { mode: 'pessimistic_read' },
      });
      if (!material) throw new NotFoundException(`Material con id ${dto.materialId} no encontrado`);
      const item = await manager.findOne(RecetaMaterial, {
        where: { recetaId: Number(orden.producto_id), materialId: dto.materialId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!item) throw new BadRequestException('El material no corresponde a la receta de la orden');
      if (dto.unidad !== material.unidadMedida) {
        throw new BadRequestException(`La unidad del material debe ser ${material.unidadMedida}`);
      }
      // Sin id: cada alta conserva su propio registro. Fecha generada por BD.
      return manager.save(ConsumoMaterial, {
        ordenId: String(dto.ordenId), materialId: String(dto.materialId),
        cantidad: String(dto.cantidad), unidad: dto.unidad, usuarioRegistroId: String(usuarioId),
      });
    });
  }

  private async comprobarReferencias(ordenId: number, materialId?: number) {
    if (!await this.dataSource.getRepository(OrdenProduccion).existsBy({ id: ordenId })) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }
    if (materialId !== undefined && !await this.dataSource.getRepository(Material).existsBy({ id: materialId })) {
      throw new NotFoundException(`Material con id ${materialId} no encontrado`);
    }
  }

  async findByOrden(ordenId: number, materialId?: number) {
    await this.comprobarReferencias(ordenId, materialId);
    return this.consumosRepository.find({
      where: { ordenId: String(ordenId), ...(materialId !== undefined ? { materialId: String(materialId) } : {}) },
      relations: { material: true }, order: { fechaHora: 'ASC', id: 'ASC' },
    });
  }

  async totales(ordenId: number, materialId?: number) {
    await this.comprobarReferencias(ordenId, materialId);
    const query = this.consumosRepository.createQueryBuilder('consumo')
      .select('consumo.ordenId', 'ordenId')
      .addSelect('consumo.materialId', 'materialId')
      .addSelect('consumo.unidad', 'unidad')
      .addSelect('SUM(consumo.cantidad)::text', 'cantidadTotal')
      .where('consumo.ordenId = :ordenId', { ordenId: String(ordenId) })
      .groupBy('consumo.ordenId').addGroupBy('consumo.materialId').addGroupBy('consumo.unidad')
      .orderBy('consumo.materialId', 'ASC').addOrderBy('consumo.unidad', 'ASC');
    if (materialId !== undefined) query.andWhere('consumo.materialId = :materialId', { materialId: String(materialId) });
    // Texto decimal evita perder precision y no mezcla unidades distintas.
    return query.getRawMany<{ ordenId: string; materialId: string; unidad: string; cantidadTotal: string }>();
  }
}
