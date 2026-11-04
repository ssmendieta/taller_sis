import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Inventario } from './entities/inventario.entity';


@Injectable()
export class InventarioService {


  constructor(
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
  ) {}



  // Consultar disponibilidad de un material
  async consultarDisponibilidad(materialId: number) {


    const inventario = await this.inventarioRepository.findOne({
      where: {
        materialId,
      },
    });


    if (!inventario) {

      return {
        materialId,
        cantidadDisponible: 0,
        disponible: false,
        mensaje: 'No existe inventario registrado para este material',
      };

    }


    return {
      materialId: inventario.materialId,
      cantidadDisponible: Number(inventario.cantidadDisponible),
      disponible: Number(inventario.cantidadDisponible) > 0,
      actualizadoEn: inventario.actualizadoEn,
    };

  }


}