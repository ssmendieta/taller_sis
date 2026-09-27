import { Injectable } from '@nestjs/common';
import { CreateOrdenesProduccionDto } from './dto/create-ordenes_produccion.dto';
import { UpdateOrdenesProduccionDto } from './dto/update-ordenes_produccion.dto';

@Injectable()
export class OrdenesProduccionService {
  create(createOrdenesProduccionDto: CreateOrdenesProduccionDto) {
    return 'This action adds a new ordenesProduccion';
  }

  findAll() {
    return `This action returns all ordenesProduccion`;
  }

  findOne(id: number) {
    return `This action returns a #${id} ordenesProduccion`;
  }

  update(id: number, updateOrdenesProduccionDto: UpdateOrdenesProduccionDto) {
    return `This action updates a #${id} ordenesProduccion`;
  }

  remove(id: number) {
    return `This action removes a #${id} ordenesProduccion`;
  }
}
