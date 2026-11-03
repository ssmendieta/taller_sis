import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemandaItem } from './entities/demanda-item.entity';
import { Demanda } from './entities/demanda.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Demanda, DemandaItem])],
  exports: [TypeOrmModule],
})
export class DemandaModule {}
