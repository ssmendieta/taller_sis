import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { CreateSolicitudMaterialDto } from './dto/create-solicitud-material.dto';
import { SolicitudMaterial } from './entities/solicitud-material.entity';
import { SolicitudMaterialItem } from './entities/solicitud-material-item.entity';

@Injectable()
export class SolicitudesMaterialService {
  constructor(
    @InjectRepository(SolicitudMaterial)
    private readonly solicitudesRepository: Repository<SolicitudMaterial>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSolicitudMaterialDto, usuarioId: number) {
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }
    const materialesIds = dto.items.map((item) => item.materialId);
    if (new Set(materialesIds).size !== materialesIds.length) {
      throw new ConflictException('No puede repetir un material en la misma solicitud');
    }

    return this.dataSource.transaction(async (manager) => {
      // Serializa las altas para una misma orden antes de buscar duplicados.
      const orden = await manager.findOne(OrdenProduccion, {
        where: { id: dto.ordenId }, lock: { mode: 'pessimistic_write' },
      });
      if (!orden) throw new NotFoundException(`Orden con id ${dto.ordenId} no encontrada`);

      // Orden estable de bloqueo para solicitudes con varios materiales.
      for (const materialId of [...materialesIds].sort((a, b) => a - b)) {
        const material = await manager.findOne(Material, {
          where: { id: materialId }, lock: { mode: 'pessimistic_read' },
        });
        if (!material) throw new NotFoundException(`Material con id ${materialId} no encontrado`);
        const item = dto.items.find((actual) => actual.materialId === materialId)!;
        if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
          throw new BadRequestException('La cantidad debe ser positiva');
        }
        if (item.unidad !== material.unidadMedida) {
          throw new BadRequestException(`La unidad del material ${materialId} debe ser ${material.unidadMedida}`);
        }
      }

      const duplicado = await manager.findOne(SolicitudMaterialItem, {
        where: {
          materialId: In(materialesIds.map(String)),
          solicitud: { ordenId: String(dto.ordenId), estado: In(['PENDIENTE', 'APROBADA']) },
        },
      });
      if (duplicado) throw new ConflictException('Ya existe una solicitud abierta para esta orden y material');

      // Solo se copian campos permitidos; actor y estado los fija el servidor.
      const solicitud = await manager.save(SolicitudMaterial, {
        ordenId: String(dto.ordenId), solicitanteUsuarioId: String(usuarioId), estado: 'PENDIENTE',
      });
      const items = await manager.save(SolicitudMaterialItem, dto.items.map((item) => ({
        solicitudId: solicitud.id, materialId: String(item.materialId),
        cantidad: String(item.cantidad), unidad: item.unidad,
      })));
      return { ...solicitud, items };
    });
  }

  findAll() {
    return this.solicitudesRepository.find({
      relations: { items: { material: true }, orden: true },
      order: { fecha: 'DESC', id: 'DESC' },
    });
  }

  async findOne(id: string) {
    if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 9223372036854775807n) {
      throw new BadRequestException('El id debe ser un entero positivo válido');
    }
    const solicitud = await this.solicitudesRepository.findOne({
      where: { id }, relations: { items: { material: true }, orden: true },
    });
    if (!solicitud) throw new NotFoundException(`Solicitud con id ${id} no encontrada`);
    return solicitud;
  }
}
