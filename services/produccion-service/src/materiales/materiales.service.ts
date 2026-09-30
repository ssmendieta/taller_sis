import { ConflictException, BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Material } from './entities/material.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';


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
  async create(dto: CreateMaterialDto) {

    // Un código repetido viola la restricción única y TypeORM respondería 500.
    const existente = await this.materialRepository.findOne({
      where: { codigo: dto.codigo },
    });
    if (existente) {
      throw new ConflictException(`Ya existe un material con el código '${dto.codigo}'`);
    }

    const material = this.materialRepository.create({
  codigo: dto.codigo,
  nombre: dto.nombre,
  unidadMedida: dto.unidadMedida,
});


    return this.materialRepository.save(material);
  }



  // Actualizar material
  async update(id: number, data: UpdateMaterialDto) {

    // Solo los campos realmente enviados: con un cuerpo vacío TypeORM lanza
    // `UpdateValuesMissingError` (500) en lugar de responder 400.
    const campos = Object.fromEntries(
      Object.entries(data).filter(([, valor]) => valor !== undefined),
    ) as UpdateMaterialDto;

    if (Object.keys(campos).length === 0) {
      throw new BadRequestException('Debe indicar al menos un campo a actualizar');
    }

    await this.materialRepository.update(id, campos);


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