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


@Injectable()
export class OrdenesService {


  constructor(
    @InjectRepository(Orden)
    private readonly ordenRepository: Repository<Orden>,
  ) {}



  // Mostrar materiales requeridos de una orden
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


      INNER JOIN receta_material rm
        ON rm.receta_id = o.receta_id


      INNER JOIN materiales m
        ON m.id = rm.material_id


      WHERE o.id = $1


    `,[id]);


    return resultado;

  }



  // Buscar órdenes mediante filtros
  async buscar(
    estado?: string,
    producto?: string,
    fecha?: string,
  ) {


    const query = this.ordenRepository
      .createQueryBuilder('orden')
      .where('1=1');



    // Filtro por estado
    if (estado) {

      query.andWhere(
        'orden.estado = :estado',
        {
          estado,
        },
      );

    }



    // Filtro por producto
    if (producto) {

      query.andWhere(
        'orden.codigo ILIKE :producto',
        {
          producto: `%${producto}%`,
        },
      );

    }



    // Filtro por fecha programada
    if (fecha) {

      query.andWhere(
        'orden.fechaProgramada = :fecha',
        {
          fecha,
        },
      );

    }



    return query.getMany();

  }



  // Cambiar el estado de una orden (ABC-148).
  // Valida la transición contra el flujo de ABC-147, actualiza el estado y
  // sus marcas de tiempo, y registra la fila de historial, todo en una
  // misma transacción.
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


    // Validación manual contra el enum (decisión: no se usa ValidationPipe
    // global en este servicio porque main.ts no lo tiene y un pipe global
    // con whitelist rompería los endpoints existentes sin DTO decorados,
    // como materiales o buscar; el controller aplica ValidationPipe solo a
    // esta ruta, esto queda como segunda barrera y hace al service testeable
    // de forma aislada).
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


}