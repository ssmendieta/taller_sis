import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { CrearPerdidaMateriaPrimaDto } from './dto/crear-perdida-materia-prima.dto';
import { PerdidaMateriaPrima } from './entities/perdida-materia-prima.entity';

@Injectable()
export class PerdidasMateriaPrimaService {
  constructor(
    @InjectRepository(PerdidaMateriaPrima)
    private readonly perdidasRepository: Repository<PerdidaMateriaPrima>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CrearPerdidaMateriaPrimaDto, usuarioId: number) {
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }
    if (!Number.isFinite(dto.cantidad) || dto.cantidad <= 0) {
      throw new BadRequestException('La cantidad perdida debe ser mayor que cero');
    }
    const motivo = typeof dto.motivo === 'string' ? dto.motivo.trim() : '';
    if (!motivo) throw new BadRequestException('El motivo de la pérdida es obligatorio');

    return this.dataSource.transaction(async (manager) => {
      const orden = await manager.findOne(OrdenProduccion, {
        where: { id: dto.ordenId }, lock: { mode: 'pessimistic_read' },
      });
      if (!orden) throw new NotFoundException(`Orden con id ${dto.ordenId} no encontrada`);
      const material = await manager.findOne(Material, {
        where: { id: dto.materialId }, lock: { mode: 'pessimistic_read' },
      });
      if (!material) throw new NotFoundException(`Material con id ${dto.materialId} no encontrado`);
      // La merma es de un insumo de la orden: debe pertenecer a su receta.
      const item = await manager.findOne(RecetaMaterial, {
        where: { recetaId: Number(orden.producto_id), materialId: dto.materialId },
      });
      if (!item) throw new BadRequestException('El material no corresponde a la receta de la orden');
      if (dto.unidad !== material.unidadMedida) {
        throw new BadRequestException(`La unidad del material debe ser ${material.unidadMedida}`);
      }
      // Sin id: cada pérdida conserva su propio registro. Fecha generada por BD.
      return manager.save(PerdidaMateriaPrima, {
        ordenId: String(dto.ordenId), materialId: String(dto.materialId),
        cantidad: dto.cantidad.toFixed(4), unidad: dto.unidad, motivo, autorUsuarioId: String(usuarioId),
      });
    });
  }

  // Solo pérdidas de la orden pedida, en orden temporal estable (fecha y luego id).
  async findByOrden(ordenId: number) {
    if (!await this.dataSource.getRepository(OrdenProduccion).existsBy({ id: ordenId })) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }
    return this.perdidasRepository.find({
      where: { ordenId: String(ordenId) },
      relations: { material: true },
      order: { fechaHora: 'ASC', id: 'ASC' },
    });
  }
}
