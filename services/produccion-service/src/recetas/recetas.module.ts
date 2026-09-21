import { Module } from '@nestjs/common';
import { RecetasController } from './recetas.controller';
import { RecetasService } from './recetas.service';

@Module({
  controllers: [
    RecetasController
  ],
  providers: [
    RecetasService
  ]
})
export class RecetasModule {}