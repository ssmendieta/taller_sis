import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Receta } from './entities/receta.entity';
import { RecetaMaterial } from './entities/receta-material.entity';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import {
  CreateRecetaDto,
  RecetaMaterialItemDto,
} from './dto/create-receta.dto';
import { UpdateRecetaDto } from './dto/update-receta.dto';

@Injectable()
export class RecetasService {
  constructor(
    @InjectRepository(Receta)
    private readonly recetaRepository: Repository<Receta>,
    @InjectRepository(RecetaMaterial)
    private readonly recetaMaterialRepository: Repository<RecetaMaterial>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository: Repository<OrdenProduccion>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(activa?: boolean) {
    const recetas = await this.recetaRepository.find({
      where: activa === undefined ? {} : { activa },
      relations: { items: { material: true } },
      order: { id: 'ASC' },
    });

    return recetas.map((receta) => this.toResponse(receta));
  }

  // GET /recetas/:id — detalle con materiales (join receta_material + materiales).
  async findOne(id: number) {
    const receta = await this.recetaRepository.findOne({
      where: { id },
      relations: { items: { material: true } },
    });

    if (!receta) {
      throw new NotFoundException(`Receta con id ${id} no encontrada`);
    }

    return this.toResponse(receta);
  }

  // POST /recetas — crea la receta junto con su lista de materiales.
  async create(dto: CreateRecetaDto) {
    const vigente = await this.recetaRepository.findOne({
      where: { productoCodigo: dto.producto_codigo, activa: true },
    });

    if (vigente) {
      throw new ConflictException(
        `Ya existe una receta activa (id ${vigente.id}) para el producto_codigo '${dto.producto_codigo}'. ` +
          `Desactívela con PATCH /recetas/${vigente.id}/desactivar antes de crear una nueva.`,
      );
    }

    const materiales = dto.materiales ?? [];
    await this.assertMaterialesExisten(materiales);

    try {
      const creada = await this.dataSource.transaction(async (manager) => {
        const receta = await manager.save(
          manager.create(Receta, {
            productoCodigo: dto.producto_codigo,
            productoNombre: dto.producto_nombre,
            activa: dto.activa ?? true,
          }),
        );

        if (materiales.length > 0) {
          await manager.save(
            RecetaMaterial,
            materiales.map((item) =>
              manager.create(RecetaMaterial, {
                recetaId: receta.id,
                materialId: item.material_id,
                cantidadRequerida: item.cantidad_requerida,
              }),
            ),
          );
        }

        const recargada = await manager.findOne(Receta, {
          where: { id: receta.id },
          relations: { items: { material: true } },
        });

        if (!recargada) {
          throw new NotFoundException(
            `Receta con id ${receta.id} no encontrada tras crearla`,
          );
        }

        return recargada;
      });

      return this.toResponse(creada);
    } catch (error) {
      if (this.esViolacionDeUnicidad(error)) {
        throw new ConflictException(
          `Ya existe una receta activa para el producto_codigo '${dto.producto_codigo}'.`,
        );
      }

      throw error;
    }
  }

  // PATCH /recetas/:id — actualiza producto_nombre y/o reemplaza la lista
  // de materiales (borra e inserta las filas de receta_material).
  // Versionado real: si la receta tiene órdenes asociadas, el cambio de
  // materiales se bloquea con 409 para no alterar el historial de las
  // órdenes existentes. En ese caso cree una nueva versión con
  // POST /recetas/:id/versiones.
  async update(id: number, dto: UpdateRecetaDto) {
    const receta = await this.recetaRepository.findOne({
      where: { id },
    });

    if (!receta) {
      throw new NotFoundException(`Receta con id ${id} no encontrada`);
    }

    if (dto.materiales !== undefined) {
      await this.assertMaterialesExisten(dto.materiales);
      const ordenes = await this.ordenRepository.count({
        where: { producto_id: id },
      });
      if (ordenes > 0) {
        throw new ConflictException(
          'La receta tiene órdenes asociadas y sus materiales no pueden modificarse. Cree una nueva versión con POST /recetas/:id/versiones.',
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.producto_nombre !== undefined) {
        receta.productoNombre = dto.producto_nombre;
      }

      receta.actualizadoEn = new Date();
      await manager.save(receta);

      if (dto.materiales !== undefined) {
        // Reemplazo total del detalle de materiales de la receta.
        await manager.delete(RecetaMaterial, { recetaId: id });

        if (dto.materiales.length > 0) {
          await manager.save(
            RecetaMaterial,
            dto.materiales.map((item) =>
              manager.create(RecetaMaterial, {
                recetaId: id,
                materialId: item.material_id,
                cantidadRequerida: item.cantidad_requerida,
              }),
            ),
          );
        }
      }
    });

    return this.findOne(id);
  }

  // PATCH /recetas/:id/desactivar — soft delete (activa=false, no borra la fila).
  async desactivar(id: number) {
    const receta = await this.recetaRepository.findOne({
      where: { id },
    });

    if (!receta) {
      throw new NotFoundException(`Receta con id ${id} no encontrada`);
    }

    receta.activa = false;
    receta.actualizadoEn = new Date();
    await this.recetaRepository.save(receta);

    return this.findOne(id);
  }

  // GET /recetas/:id/versiones — todas las versiones del mismo
  // producto_codigo, incluida la activa y las anteriores inactivas.
  async listarVersiones(id: number) {
    const receta = await this.recetaRepository.findOne({ where: { id } });
    if (!receta) {
      throw new NotFoundException(`Receta con id ${id} no encontrada`);
    }
    const versiones = await this.recetaRepository.find({
      where: { productoCodigo: receta.productoCodigo },
      relations: { items: { material: true } },
      order: { id: 'ASC' },
    });
    return versiones.map((version) => this.toResponse(version));
  }

  // Valida que cada material_id exista en la tabla materiales antes de insertar.
  private async assertMaterialesExisten(materiales: RecetaMaterialItemDto[]) {
    if (materiales.length === 0) {
      return;
    }

    const ids = [...new Set(materiales.map((item) => Number(item.material_id)))];
    const encontrados = await this.materialRepository.find({
      where: { id: In(ids) },
      select: ['id'],
    });
    const existentes = new Set(encontrados.map((material) => Number(material.id)));
    const faltantes = ids.filter((materialId) => !existentes.has(materialId));

    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Los siguientes material_id no existen en la tabla materiales: ${faltantes.join(', ')}`,
      );
    }
  }

  private esViolacionDeUnicidad(error: unknown): boolean {
    const codigo =
      (error as { code?: string })?.code ??
      (error as { driverError?: { code?: string } })?.driverError?.code;

    return codigo === '23505';
  }


  private toResponse(receta: Receta) {
    return {
      id: Number(receta.id),
      producto_codigo: receta.productoCodigo,
      producto_nombre: receta.productoNombre,
      activa: receta.activa,
      creado_en: receta.creadoEn,
      actualizado_en: receta.actualizadoEn,
      materiales: (receta.items ?? []).map((item) => ({
        material_id: Number(item.materialId),
        cantidad_requerida: Number(item.cantidadRequerida),
        codigo: item.material?.codigo,
        nombre: item.material?.nombre,
        unidad_medida: item.material?.unidadMedida,
      })),
    };
  }
}
