import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';
import { EstadoOrden } from './estado-orden.enum';
import { esTransicionValida } from './estado-orden.transiciones';
import { CambiarEstadoOrdenDto } from './cambiar-estado-orden.dto';
import { CreateOrdenDto } from './dto/create-orden.dto';
import { Inventario } from '../inventario/entities/inventario.entity';

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository: Repository<OrdenProduccion>,
    @InjectRepository(HistorialEstadoOrden)
    private readonly historialRepository: Repository<HistorialEstadoOrden>,
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
  ) {}

  // Alta de ordenes (aporte de develop, conservado tal cual: el DTO usa los
  // mismos nombres de propiedad que OrdenProduccion).
  async create(createOrdenDto: CreateOrdenDto): Promise<OrdenProduccion> {
    const codigo = `ORD-${Math.floor(Date.now() / 1000)}`;

    const nuevaOrden = this.ordenRepository.create({
      ...createOrdenDto,
      codigo,
      estado: 'PENDIENTE',
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
      query.andWhere('orden.fecha_programada = :fecha', { fecha });
    }

    return query.getMany();
  }

  async compararDisponibilidadMateriales(id: number) {
    const orden = await this.ordenRepository.findOne({
      where: { id },
    });

    if (!orden) {
      throw new NotFoundException(`Orden ${id} no encontrada`);
    }

    const materiales = await this.ordenRepository.query(
      `
      SELECT
        m.id AS material_id,
        m.codigo,
        m.nombre,
        m.unidad_medida,
        rm.cantidad_requerida
      FROM ordenes_produccion o
      INNER JOIN receta_material rm
        ON rm.receta_id = o.receta_id
      INNER JOIN materiales m
        ON m.id = rm.material_id
      WHERE o.id = $1
      `,
      [id],
    );

    const resultado = [];

    for (const material of materiales) {
      const cantidadRequerida =
        Number(material.cantidad_requerida) * Number(orden.cantidad);

      const inventario = await this.inventarioRepository.findOne({
        where: {
          materialId: Number(material.material_id),
        },
      });

      const cantidadDisponible = inventario
        ? Number(inventario.cantidadDisponible)
        : 0;

      let estado: string;

      if (!inventario || cantidadDisponible === 0) {
        estado = 'FALTANTE';
      } else if (cantidadDisponible < cantidadRequerida) {
        estado = 'INSUFICIENTE';
      } else {
        estado = 'DISPONIBLE';
      }

      resultado.push({
        material_id: Number(material.material_id),
        codigo: material.codigo,
        nombre: material.nombre,
        unidad_medida: material.unidad_medida,
        cantidad_requerida: cantidadRequerida,
        cantidad_disponible: cantidadDisponible,
        estado,
      });
    }

    return {
      orden_id: orden.id,
      orden_codigo: orden.codigo,
      cantidad_producir: Number(orden.cantidad),
      materiales: resultado,
    };
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
          orden.iniciada_en = new Date();
        }

        if (dto.nuevoEstado === EstadoOrden.FINALIZADA) {
          orden.finalizada_en = new Date();
        }

        if (dto.nuevoEstado === EstadoOrden.CANCELADA) {
          orden.cancelada_en = new Date();
        }

        await manager.save(OrdenProduccion, orden);

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

        return manager.findOne(OrdenProduccion, {
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
