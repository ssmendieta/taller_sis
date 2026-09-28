import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Avance } from './entities/avance.entity';


@Injectable()
export class AvancesService {


  constructor(
    @InjectRepository(Avance)
    private readonly avanceRepository: Repository<Avance>,
  ) {}



  // Registrar avance de producción
  async registrar(
    ordenId: number,
    cantidad: number,
    usuarioId: number,
  ) {


    const avance = this.avanceRepository.create({

      orden_id: ordenId,

      cantidad_producida: cantidad,

      usuario_responsable_id: usuarioId,

    });


    return this.avanceRepository.save(avance);

  }



  // Consultar avances de una orden
  async listarPorOrden(
    ordenId: number,
  ) {


    return this.avanceRepository.find({

      where:{
        orden_id: ordenId,
      },

      order:{
        fecha_hora:'DESC',
      },

    });


  }



  // Cantidad acumulada producida
  async totalProducido(
    ordenId:number,
  ){


    const resultado = await this.avanceRepository
      .createQueryBuilder('avance')
      .select(
        'SUM(avance.cantidad_producida)',
        'total',
      )
      .where(
        'avance.orden_id = :ordenId',
        {
          ordenId,
        },
      )
      .getRawOne();


    return Number(resultado.total || 0);

  }


}