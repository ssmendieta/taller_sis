import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Material } from './entities/material.entity';
import { CreateMaterialDto } from './dto/create-material.dto';


@Injectable()
export class MaterialesService {


  constructor(
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
  ) {}



  // Listar materiales
  findAll() {
    return this.materialRepository.find();
  }



  // Buscar material por ID
  findOne(id: number) {
    return this.materialRepository.findOne({
      where: { id }
    });
  }



  // Crear material
  create(dto: CreateMaterialDto) {

    const material = this.materialRepository.create({
  codigo: dto.codigo,
  nombre: dto.nombre,
  unidadMedida: dto.unidadMedida,
});


    return this.materialRepository.save(material);
  }



  // Actualizar material
  async update(id: number, data: Partial<CreateMaterialDto>) {

    await this.materialRepository.update(
      id,
      {
        ...data,
      }
    );


    return this.findOne(id);
  }



  // Eliminar material
  async remove(id: number) {

    await this.materialRepository.delete(id);

    return {
      mensaje: 'Material eliminado correctamente'
    };

  }

}