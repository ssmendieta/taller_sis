import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { CreateOrdenDto } from './dto/create-orden.dto';

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(OrdenProduccion)
    private readonly ordenRepository: Repository<OrdenProduccion>,
  ) {}

  async create(createOrdenDto: CreateOrdenDto): Promise<OrdenProduccion> {
    const codigo = `ORD-${Math.floor(Date.now() / 1000)}`;

    const nuevaOrden = this.ordenRepository.create({
      ...createOrdenDto,
      codigo, 
      estado: 'PENDIENTE', 
    });

    return await this.ordenRepository.save(nuevaOrden);
  }
}