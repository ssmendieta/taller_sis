import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Orden } from './entities/orden.entity';


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

        (rm.cantidad_requerida * o.cantidad_solicitada) AS cantidad_requerida

      FROM ordenes_produccion o

      INNER JOIN receta_material rm
        ON rm.receta_id = o.receta_id

      INNER JOIN materiales m
        ON m.id = rm.material_id

      WHERE o.id = $1


    `,[id]);


    return resultado;

  }




  // Obtener detalle de una orden
  async obtenerDetalle(id: number) {


    const orden = await this.ordenRepository.findOne({

      where: {
        id,
      },

    });


    return orden;

  }





  // Obtener historial de estados de una orden
  async obtenerHistorial(id: number) {


    const resultado = await this.ordenRepository.query(`

      SELECT

        h.id,
        h.estado_anterior,
        h.estado_nuevo,
        h.usuario_responsable_id,
        h.fecha_hora,
        h.motivo

      FROM historial_estado_orden h

      WHERE h.orden_id = $1

      ORDER BY h.fecha_hora DESC


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



    if (estado) {

      query.andWhere(
        'orden.estado = :estado',
        {
          estado,
        },
      );

    }



    if (producto) {

      query.andWhere(
        'orden.codigo ILIKE :producto',
        {
          producto: `%${producto}%`,
        },
      );

    }



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





  // Finalizar orden
  async finalizar(id: number) {


    const orden = await this.ordenRepository.findOne({

      where: {
        id,
      },

    });



    if (!orden) {

      throw new Error(
        'Orden no encontrada',
      );

    }



    if (orden.estado !== 'EN_PRODUCCION') {

      throw new Error(
        'Solo se pueden finalizar órdenes en producción',
      );

    }



    const estadoAnterior = orden.estado;



    orden.estado = 'FINALIZADA';



    await this.ordenRepository.save(orden);



    await this.ordenRepository.query(`

      INSERT INTO historial_estado_orden
      (
        orden_id,
        estado_anterior,
        estado_nuevo,
        usuario_responsable_id,
        motivo
      )

      VALUES
      ($1,$2,$3,$4,$5)

    `,
    [
      id,
      estadoAnterior,
      'FINALIZADA',
      1,
      'Orden finalizada',
    ]);



    return {

      mensaje: 'Orden finalizada correctamente',

      orden,

    };

  }







  // Cancelar orden
  async cancelar(
    id: number,
    motivo: string,
  ) {


    const orden = await this.ordenRepository.findOne({

      where: {
        id,
      },

    });



    if (!orden) {

      throw new Error(
        'Orden no encontrada',
      );

    }



    if (
      orden.estado === 'FINALIZADA' ||
      orden.estado === 'CANCELADA'
    ) {

      throw new Error(
        'No se puede cancelar una orden cerrada',
      );

    }



    if (!motivo) {

      throw new Error(
        'Debe ingresar un motivo de cancelación',
      );

    }



    const estadoAnterior = orden.estado;



    orden.estado = 'CANCELADA';



    await this.ordenRepository.save(orden);




    await this.ordenRepository.query(`

      INSERT INTO historial_estado_orden
      (
        orden_id,
        estado_anterior,
        estado_nuevo,
        usuario_responsable_id,
        motivo
      )

      VALUES
      ($1,$2,$3,$4,$5)

    `,
    [
      id,
      estadoAnterior,
      'CANCELADA',
      1,
      motivo,
    ]);



    return {

      mensaje: 'Orden cancelada correctamente',

      orden,

    };

  }



}