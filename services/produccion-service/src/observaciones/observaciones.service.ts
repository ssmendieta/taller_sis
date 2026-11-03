import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { CreateObservacionDto } from './dto/create-observacion.dto';
import { ObservacionOrden } from './entities/observacion-orden.entity';
import { TipoObservacion } from './entities/tipo-observacion.enum';

@Injectable()
export class ObservacionesService {
  constructor(
    @InjectRepository(ObservacionOrden)
    private readonly observaciones: Repository<ObservacionOrden>,
    private readonly dataSource: DataSource,
  ) {}

  // Autor y fecha salen de la sesión y del servidor, nunca del cuerpo de la petición.
  async registrar(dto: CreateObservacionDto, usuarioId: number, usuarioNombre?: string | null) {
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }
    if (!Number.isSafeInteger(dto.ordenId) || dto.ordenId < 1) {
      throw new BadRequestException('El id de la orden debe ser un entero positivo válido');
    }
    if (!Object.values(TipoObservacion).includes(dto.tipo)) {
      throw new BadRequestException('El tipo debe ser OBSERVACION o INCIDENCIA');
    }
    const descripcion = typeof dto.descripcion === 'string' ? dto.descripcion.trim() : '';
    if (!descripcion || descripcion.length > 1000) {
      throw new BadRequestException('La descripción es obligatoria y admite hasta 1000 caracteres');
    }
    if (!await this.dataSource.getRepository(OrdenProduccion).existsBy({ id: dto.ordenId })) {
      throw new NotFoundException(`Orden con id ${dto.ordenId} no encontrada`);
    }
    return this.observaciones.save(this.observaciones.create({
      ordenId: String(dto.ordenId),
      tipo: dto.tipo,
      descripcion,
      autorUsuarioId: String(usuarioId),
      autorNombre: usuarioNombre?.trim() || null,
    }));
  }

  async listarPorOrden(ordenId: number) {
    if (!Number.isSafeInteger(ordenId) || ordenId < 1) {
      throw new BadRequestException('El id de la orden debe ser un entero positivo válido');
    }
    if (!await this.dataSource.getRepository(OrdenProduccion).existsBy({ id: ordenId })) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }
    return this.observaciones.find({
      where: { ordenId: String(ordenId) },
      order: { fechaHora: 'DESC', id: 'DESC' },
    });
  }
}
