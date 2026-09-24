import { Injectable } from '@nestjs/common';
import { CreateAvancesProduccionDto } from './dto/create-avances_produccion.dto';
import { UpdateAvancesProduccionDto } from './dto/update-avances_produccion.dto';

@Injectable()
export class AvancesProduccionService {
  create(createAvancesProduccionDto: CreateAvancesProduccionDto) {
    return 'This action adds a new avancesProduccion';
  }

  findAll() {
    return `This action returns all avancesProduccion`;
  }

  findOne(id: number) {
    return `This action returns a #${id} avancesProduccion`;
  }

  update(id: number, updateAvancesProduccionDto: UpdateAvancesProduccionDto) {
    return `This action updates a #${id} avancesProduccion`;
  }

  remove(id: number) {
    return `This action removes a #${id} avancesProduccion`;
  }
}
