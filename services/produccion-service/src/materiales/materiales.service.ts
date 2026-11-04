import { ConflictException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  async findOne(id: number) {
    const material = await this.materialRepository.findOne({
      where: { id }
    });
    if (!material) {
      throw new NotFoundException(`Material con id ${id} no encontrado`);
    }
    return material;
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


    try {
      return await this.materialRepository.save(material);
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException(`Ya existe un material con el código '${dto.codigo}'`);
      }
      throw error;
    }
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

    if (campos.codigo !== undefined) {
      const otro = await this.materialRepository.findOne({
        where: { codigo: campos.codigo },
      });
      if (otro && Number(otro.id) !== Number(id)) {
        throw new ConflictException(`Ya existe un material con el código '${campos.codigo}'`);
      }
    }

    try {
      await this.materialRepository.update(id, campos);
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException('Ya existe un material con ese código');
      }
      throw error;
    }


    return this.findOne(id);
  }



  // Eliminar material
  async remove(id: number) {
    await this.findOne(id);

    try {
      await this.materialRepository.delete(id);
    } catch (error) {
      if ((error as { code?: string })?.code === '23503') {
        throw new ConflictException(
          'No se puede eliminar el material porque está usado en recetas.',
        );
      }
      throw error;
    }

    return {
      mensaje: 'Material eliminado correctamente'
    };

  }

}
