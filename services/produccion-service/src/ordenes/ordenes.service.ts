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

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository: Repository<OrdenProduccion>,
    @InjectRepository(HistorialEstadoOrden)
    private readonly historialRepository: Repository<HistorialEstadoOrden>,
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
    // La consulta entrega los nombres de la migración y el nombre del
    // producto de recetas. El filtro producto se aplica al producto, no al
    // código de la orden. La BD de Auth es independiente, por lo que aquí
    // solo se expone el ID del responsable.
    return this.ordenRepository.query(`
      SELECT o.id::text AS id,
             o.codigo,
             r.producto_codigo,
             r.producto_nombre,
             o.cantidad_solicitada::text AS cantidad_solicitada,
             o.fecha_programada::text AS fecha_programada,
             o.estado,
             o.responsable_usuario_id::text AS responsable_usuario_id
      FROM ordenes_produccion o
      JOIN recetas r ON r.id = o.receta_id
      WHERE ($1::text IS NULL OR o.estado = $1)
        AND ($2::text IS NULL OR r.producto_nombre ILIKE '%' || $2 || '%'
             OR r.producto_codigo ILIKE '%' || $2 || '%')
        AND ($3::date IS NULL OR o.fecha_programada = $3::date)
      ORDER BY o.fecha_programada DESC, o.id DESC
    `, [estado?.trim() || null, producto?.trim() || null, fecha?.trim() || null]);
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
