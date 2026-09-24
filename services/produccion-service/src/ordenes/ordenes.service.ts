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


}