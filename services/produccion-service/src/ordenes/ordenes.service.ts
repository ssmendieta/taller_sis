import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Orden } from './entities/orden.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';
import { EstadoOrden } from './estado-orden.enum';
import { esTransicionValida } from './estado-orden.transiciones';
import { CambiarEstadoOrdenDto } from './cambiar-estado-orden.dto';
import { CreateOrdenDto } from './dto/create-orden.dto';

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(Orden)
    private readonly ordenRepository: Repository<Orden>,
    @InjectRepository(HistorialEstadoOrden)
    private readonly historialRepository: Repository<HistorialEstadoOrden>,
  ) {}

  // Alta de ordenes (aporte de develop, adaptado a la entidad unificada
  // Orden: el DTO usa nombres snake_case de su rama y aqui se mapean a las
  // propiedades camelCase de la entidad).
  async create(createOrdenDto: CreateOrdenDto): Promise<Orden> {
    const codigo = `ORD-${Math.floor(Date.now() / 1000)}`;

    const nuevaOrden = this.ordenRepository.create({
      codigo,
      estado: 'PENDIENTE',
      recetaId: createOrdenDto.producto_id,
      cantidadSolicitada: createOrdenDto.cantidad,
      fechaProgramada: createOrdenDto.fecha_programada as unknown as Date,
      responsableUsuarioId: createOrdenDto.responsable_id,
    });

    return await this.ordenRepository.save(nuevaOrden);
  }

  async obtenerMateriales(id: number) {
    const resultado = await this.ordenRepository.query(`
      SELECT
        o.id AS orden_id,
        o.codigo AS orden_codigo,
        m.codigo,
        m.nombre,
        m.unidad_medida,
        rm.cantidad_requerida
      FROM ordenes_produccion o
      INNER JOIN receta_material rm ON rm.receta_id = o.receta_id
      INNER JOIN materiales m ON m.id = rm.material_id
      WHERE o.id = $1
    `, [id]);

    return resultado;
  }

  async buscar(estado?: string, producto?: string, fecha?: string) {
    const query = this.ordenRepository
      .createQueryBuilder('orden')
      .where('1=1');

    if (estado) {
      query.andWhere('orden.estado = :estado', { estado });
    }

    if (producto) {
      query.andWhere('orden.codigo ILIKE :producto', { producto: `%${producto}%` });
    }

    if (fecha) {
      query.andWhere('orden.fechaProgramada = :fecha', { fecha });
    }

    return query.getMany();
  }




  async cambiarEstado(
    id: number,
    dto: CambiarEstadoOrdenDto,
  ) {


    const orden = await this.ordenRepository.findOne({
      where: { id },
    });


    if (!orden) {
      throw new NotFoundException(`Orden con id ${id} no encontrada`);
    }



    if (!Object.values(EstadoOrden).includes(dto.nuevoEstado)) {
      throw new BadRequestException(
        `Estado solicitado inválido: '${dto.nuevoEstado}'. Valores válidos: ${Object.values(EstadoOrden).join(', ')}`,
      );
    }


    const estadoActual = orden.estado as EstadoOrden;

    if (!esTransicionValida(estadoActual, dto.nuevoEstado)) {
      throw new BadRequestException(
        `Transición no permitida: la orden ${id} está en '${estadoActual}' y no puede pasar a '${dto.nuevoEstado}'`,
      );
    }


    const actualizada = await this.ordenRepository.manager.transaction(
      async (manager) => {

        orden.estado = dto.nuevoEstado;

        if (dto.nuevoEstado === EstadoOrden.EN_PRODUCCION) {
          orden.iniciadaEn = new Date();
        }

        if (dto.nuevoEstado === EstadoOrden.FINALIZADA) {
          orden.finalizadaEn = new Date();
        }

        if (dto.nuevoEstado === EstadoOrden.CANCELADA) {
          orden.canceladaEn = new Date();
        }

        await manager.save(Orden, orden);

        await manager.save(
          HistorialEstadoOrden,
          manager.create(HistorialEstadoOrden, {
            ordenId: id,
            estadoAnterior: estadoActual,
            estadoNuevo: dto.nuevoEstado,
            usuarioResponsableId: dto.usuarioResponsableId,
            motivo: dto.motivo ?? null,
          }),
        );

        return manager.findOne(Orden, {
          where: { id },
        });

      },
    );


    return actualizada;


  }


  async obtenerHistorial(ordenId: number) {


    const orden = await this.ordenRepository.findOne({
      where: { id: ordenId },
    });


    if (!orden) {
      throw new NotFoundException(`Orden con id ${ordenId} no encontrada`);
    }


    return this.historialRepository.find({
      where: { ordenId },
      order: {
        fechaHora: 'DESC',
        id: 'DESC',
      },
    });


  }


}
