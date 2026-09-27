import { Body, Controller, Post } from '@nestjs/common';
import { MaterialCalculationService } from './material-calculation.service';
import { MaterialReceta } from './material-calculation.service';

@Controller('material-calculation')
export class MaterialCalculationController {
  constructor(
    private readonly service: MaterialCalculationService,
  ) {}

  @Post('calcular')
  calcular(@Body() body: {
    cantidadSolicitada: number;
    materialesReceta: MaterialReceta[];
  }) {
    return this.service.calcularMateriales(
      body.cantidadSolicitada,
      body.materialesReceta,
    );
  }
}