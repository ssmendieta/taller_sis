import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permisos } from './entities/permiso.entity';

@Injectable()
export class PermisosService {
  constructor(
    @InjectRepository(Permisos)
    private readonly permisos: Repository<Permisos>,
  ) {}

  findAll() {
    return this.permisos.find({ order: { codigo: 'ASC' } });
  }

  async findOne(id: number) {
    const permiso = await this.permisos.findOne({
      where: { id: String(id) },
    });
    if (!permiso) throw new NotFoundException('Permiso no encontrado');
    return permiso;
  }

  create() {
    throw new NotFoundException('El catálogo de permisos no admite altas manuales');
  }

  update() {
    throw new NotFoundException('El catálogo de permisos no admite cambios manuales');
  }

  remove() {
    throw new NotFoundException('El catálogo de permisos no admite bajas');
  }
}
